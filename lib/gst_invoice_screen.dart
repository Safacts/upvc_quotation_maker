import 'dart:async';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'models.dart';
import 'app_state.dart';
import 'gst_invoice_model.dart';
import 'gst_pdf_confirmation_screen.dart';
import 'gst_pdf_generator.dart' deferred as gstPdfGen;
import 'supabase_config.dart';
import 'crafted_widget.dart';
import 'theme.dart';
import 'umami_tracker.dart';

class GstInvoiceScreen extends StatefulWidget {
  final GstInvoiceData? existingData;
  final QuotationData? sourceQuotation;

  GstInvoiceScreen({this.existingData, this.sourceQuotation});

  @override
  _GstInvoiceScreenState createState() => _GstInvoiceScreenState();
}

class _GstInvoiceScreenState extends State<GstInvoiceScreen> {
  late GstInvoiceData data;
  bool _isLoading = false;
  bool _isSaving = false;
  Timer? _debounce;
  Uint8List? _pdfBytes;
  bool _isGeneratingPdf = false;

  final _buyerNameFocus = FocusNode();
  final _buyerAddressFocus = FocusNode();
  final _buyerGstinFocus = FocusNode();
  final _transportFocus = FocusNode();
  final _notesFocus = FocusNode();

  final Map<String, FocusNode> _itemFocusNodes = {};

  FocusNode _node(String key) {
    return _itemFocusNodes.putIfAbsent(key, () => FocusNode());
  }

  @override
  void initState() {
    super.initState();
    if (widget.existingData != null) {
      data = widget.existingData!;
      _loadItems();
    } else {
      data = GstInvoiceData();
      _prefillFromQuotation();
      _initInvoiceNumber();
    }
    _applySupplierDetails();
  }

  void _applySupplierDetails() {
    final appState = Provider.of<AppState>(context, listen: false);
    if (data.supplierCompanyName.isEmpty) {
      data.supplierCompanyName = appState.companyName;
    }
    if (data.supplierAddress.isEmpty) {
      data.supplierAddress = appState.companyAddress;
    }
    if (data.supplierGstin.isEmpty) {
      data.supplierGstin = appState.gstNumber;
    }
  }

  void _prefillFromQuotation() {
    if (widget.sourceQuotation == null) return;
    final q = widget.sourceQuotation!;
    data.buyerName = q.customerName;
    data.buyerAddress = q.address;
    data.sourceQuotationId = q.id;
    int sno = 1;
    for (final item in q.measuredItems) {
      data.items.add(GstInvoiceItem(
        sno: sno++,
        hsnCode: '3925',
        description: item.description.isNotEmpty ? item.description : item.code,
        quantity: item.totalSft,
        unit: 'SFT',
        rate: item.rate,
      ));
    }
    for (final item in q.unmeasuredItems) {
      data.items.add(GstInvoiceItem(
        sno: sno++,
        hsnCode: '3925',
        description: item.description,
        quantity: item.units.toDouble(),
        unit: 'NOS',
        rate: item.rate,
      ));
    }
    data.transportCost = q.transport;
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _buyerNameFocus.dispose();
    _buyerAddressFocus.dispose();
    _buyerGstinFocus.dispose();
    _transportFocus.dispose();
    _notesFocus.dispose();
    for (final n in _itemFocusNodes.values) {
      n.dispose();
    }
    super.dispose();
  }

  void _onDataChanged() {
    if (_debounce?.isActive ?? false) _debounce!.cancel();
    _debounce = Timer(const Duration(seconds: 2), () {
      _autoSaveToDatabase();
    });
  }

  Future<void> _loadItems() async {
    setState(() => _isLoading = true);
    try {
      if (data.id != null) {
        final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
        final itemsRes = await SupabaseConfig.client
            .from('gst_invoice_items')
            .select()
            .eq('invoice_id', data.id!)
            .eq('client_id', clientId);
        setState(() {
          data.items = (itemsRes as List).map((e) => GstInvoiceItem.fromMap(e)).toList();
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() => _isLoading = false);
      debugPrint('Failed to load GST invoice items: $e');
    }
  }

  Future<void> _initInvoiceNumber() async {
    final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
    String nextNo = await GstInvoiceData.generateNextNumber(clientId);
    setState(() => data.invoiceNumber = nextNo);
    _autoSaveToDatabase();
  }

  Future<void> _autoSaveToDatabase() async {
    if (_isSaving) return;
    setState(() => _isSaving = true);
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final invoiceMap = data.toMap(clientId: clientId);
      if (data.id == null) {
        final res = await SupabaseConfig.client.from('gst_invoices').insert(invoiceMap).select().single();
        data.id = res['id'];
      } else {
        await SupabaseConfig.client
            .from('gst_invoices')
            .update(invoiceMap)
            .eq('id', data.id!)
            .eq('client_id', clientId);
        await SupabaseConfig.client
            .from('gst_invoice_items')
            .delete()
            .eq('invoice_id', data.id!)
            .eq('client_id', clientId);
      }

      if (data.items.isNotEmpty) {
        await SupabaseConfig.client.from('gst_invoice_items').insert(
          data.items.map((e) => e.toMap(data.id!, clientId: clientId)).toList(),
        );
      }
    } catch (e) {
      debugPrint('GST invoice auto-save error: $e');
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  Future<Uint8List> _ensurePdfBytes() async {
    if (_pdfBytes != null) return _pdfBytes!;
    await _autoSaveToDatabase();
    final appState = Provider.of<AppState>(context, listen: false);
    await gstPdfGen.loadLibrary();
    final bytes = await gstPdfGen.generateGstPdfBytes(data, appState);
    _pdfBytes = bytes;
    return bytes;
  }

  Future<void> _generatePdf() async {
    umamiTrack('generate_gst_pdf');
    setState(() => _isGeneratingPdf = true);
    try {
      final pdfBytes = await _ensurePdfBytes();
      if (!mounted) return;
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => GstPdfConfirmationScreen(data: data, pdfBytes: pdfBytes),
        ),
      );
    } finally {
      if (mounted) setState(() => _isGeneratingPdf = false);
    }
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(top: 24, bottom: 12),
      child: Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold, color: Theme.of(context).primaryColor)),
    );
  }

  Color _statusColor(GstInvoiceStatus s) {
    switch (s) {
      case GstInvoiceStatus.draft: return Colors.grey.shade400;
      case GstInvoiceStatus.sent: return Colors.blue.shade400;
      case GstInvoiceStatus.paid: return Colors.green.shade500;
      case GstInvoiceStatus.cancelled: return Colors.red.shade400;
    }
  }

  Widget _statusChip(String label, GstInvoiceStatus status) {
    final isSelected = data.status == status;
    return GestureDetector(
      onTap: () async {
        if (data.status != status) {
          setState(() => data.status = status);
          await _updateStatus(status);
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? _statusColor(status) : Colors.transparent,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _statusColor(status), width: 1.5),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
            color: isSelected ? Colors.white : _statusColor(status),
          ),
        ),
      ),
    );
  }

  Future<void> _updateStatus(GstInvoiceStatus newStatus) async {
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      await SupabaseConfig.client
          .from('gst_invoices')
          .update({'status': newStatus.value})
          .eq('id', data.id!)
          .eq('client_id', clientId);
    } catch (e) {
      debugPrint('GST status update error: $e');
    }
  }

  Widget _buildComputationRow(String label, double amount, {bool isBold = false}) {
    final theme = Theme.of(context);
    final style = TextStyle(
      fontSize: isBold ? 16 : 14,
      fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
      color: isBold ? theme.colorScheme.primary : theme.textTheme.bodyLarge?.color,
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: style),
          Text('₹${amount.toStringAsFixed(2)}', style: style),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Scaffold(body: Center(child: CircularProgressIndicator()));

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.existingData == null ? 'New GST Invoice' : 'Edit GST Invoice'),
        actions: [
          if (_isSaving)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16.0),
              child: Center(child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))),
            ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    const Text('TAX INVOICE', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, letterSpacing: 2)),
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Invoice No', style: TextStyle(fontSize: 12, color: Colors.grey)),
                            Text(data.invoiceNumber, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                          ],
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            const Text('Date', style: TextStyle(fontSize: 12, color: Colors.grey)),
                            Text(DateFormat('dd-MMM-yyyy').format(data.invoiceDate), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ).animate().fade().slideY(begin: -0.1),

            if (widget.existingData != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  children: [
                    const Text('Status: ', style: TextStyle(fontSize: 13, color: Colors.grey)),
                    Expanded(
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: [
                            _statusChip('Draft', GstInvoiceStatus.draft),
                            const SizedBox(width: 6),
                            _statusChip('Sent', GstInvoiceStatus.sent),
                            const SizedBox(width: 6),
                            _statusChip('Paid', GstInvoiceStatus.paid),
                            const SizedBox(width: 6),
                            _statusChip('Cancelled', GstInvoiceStatus.cancelled),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ).animate().fade().slideY(begin: -0.1),

            _buildSectionTitle('Supplier Details').animate().fade(delay: 100.ms),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    TextFormField(
                      initialValue: data.supplierCompanyName,
                      decoration: const InputDecoration(labelText: 'Company Name'),
                      onChanged: (val) { data.supplierCompanyName = val; _onDataChanged(); },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      initialValue: data.supplierAddress,
                      decoration: const InputDecoration(labelText: 'Address'),
                      maxLines: 2,
                      onChanged: (val) { data.supplierAddress = val; _onDataChanged(); },
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            initialValue: data.supplierGstin,
                            decoration: const InputDecoration(labelText: 'GSTIN'),
                            onChanged: (val) { data.supplierGstin = val; _onDataChanged(); },
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextFormField(
                            initialValue: data.supplierState,
                            decoration: const InputDecoration(labelText: 'State'),
                            onChanged: (val) { data.supplierState = val; _onDataChanged(); },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      initialValue: data.supplierStateCode,
                      decoration: const InputDecoration(labelText: 'State Code'),
                      onChanged: (val) { data.supplierStateCode = val; _onDataChanged(); },
                    ),
                  ],
                ),
              ),
            ).animate().fade(delay: 150.ms),

            _buildSectionTitle('Buyer Details').animate().fade(delay: 200.ms),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    TextFormField(
                      focusNode: _buyerNameFocus,
                      initialValue: data.buyerName,
                      textInputAction: TextInputAction.next,
                      onFieldSubmitted: (_) => _buyerAddressFocus.requestFocus(),
                      decoration: const InputDecoration(labelText: 'Buyer Name'),
                      onChanged: (val) { data.buyerName = val; _onDataChanged(); },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      focusNode: _buyerAddressFocus,
                      initialValue: data.buyerAddress,
                      textInputAction: TextInputAction.next,
                      onFieldSubmitted: (_) => _buyerGstinFocus.requestFocus(),
                      decoration: const InputDecoration(labelText: 'Buyer Address'),
                      maxLines: 2,
                      onChanged: (val) { data.buyerAddress = val; _onDataChanged(); },
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            focusNode: _buyerGstinFocus,
                            initialValue: data.buyerGstin,
                            textInputAction: TextInputAction.next,
                            decoration: const InputDecoration(labelText: 'Buyer GSTIN'),
                            onChanged: (val) { data.buyerGstin = val; _onDataChanged(); },
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextFormField(
                            initialValue: data.buyerState,
                            decoration: const InputDecoration(labelText: 'Buyer State'),
                            onChanged: (val) { data.buyerState = val; _onDataChanged(); },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            initialValue: data.buyerStateCode,
                            decoration: const InputDecoration(labelText: 'Buyer State Code'),
                            onChanged: (val) { data.buyerStateCode = val; _onDataChanged(); },
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextFormField(
                            initialValue: data.placeOfSupply,
                            decoration: const InputDecoration(labelText: 'Place of Supply'),
                            onChanged: (val) { data.placeOfSupply = val; _onDataChanged(); },
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ).animate().fade(delay: 250.ms),

            _buildSectionTitle('Line Items').animate().fade(delay: 300.ms),
            ...data.items.asMap().entries.map((entry) {
              int index = entry.key;
              GstInvoiceItem item = entry.value;
              return Card(
                margin: const EdgeInsets.only(bottom: 12),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Item #${index + 1}', style: const TextStyle(fontWeight: FontWeight.bold)),
                          IconButton(
                            icon: const Icon(Icons.delete, color: Colors.redAccent),
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(),
                            onPressed: () {
                              setState(() => data.items.removeAt(index));
                              for (int i = 0; i < data.items.length; i++) {
                                data.items[i].sno = i + 1;
                              }
                              _onDataChanged();
                            },
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(children: [
                        SizedBox(
                          width: 60,
                          child: TextFormField(
                            focusNode: _node('i_${index}_sno'),
                            initialValue: item.sno.toString(),
                            keyboardType: TextInputType.number,
                            textInputAction: TextInputAction.next,
                            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                            decoration: const InputDecoration(labelText: 'S.No'),
                            onChanged: (val) { item.sno = int.tryParse(val) ?? index + 1; },
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          flex: 2,
                          child: TextFormField(
                            focusNode: _node('i_${index}_hsn'),
                            initialValue: item.hsnCode,
                            textInputAction: TextInputAction.next,
                            decoration: const InputDecoration(labelText: 'HSN'),
                            onChanged: (val) { item.hsnCode = val; _onDataChanged(); },
                          ),
                        ),
                      ]),
                      const SizedBox(height: 12),
                      TextFormField(
                        focusNode: _node('i_${index}_desc'),
                        initialValue: item.description,
                        textInputAction: TextInputAction.next,
                        decoration: const InputDecoration(labelText: 'Description'),
                        onChanged: (val) { item.description = val; _onDataChanged(); },
                      ),
                      const SizedBox(height: 12),
                      Row(children: [
                        Expanded(
                          child: TextFormField(
                            focusNode: _node('i_${index}_qty'),
                            initialValue: item.quantity == 0 ? '' : item.quantity.toString(),
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            textInputAction: TextInputAction.next,
                            decoration: const InputDecoration(labelText: 'Qty'),
                            onChanged: (val) { item.quantity = double.tryParse(val) ?? 0; setState(() {}); _onDataChanged(); },
                          ),
                        ),
                        const SizedBox(width: 8),
                        SizedBox(
                          width: 80,
                          child: TextFormField(
                            focusNode: _node('i_${index}_unit'),
                            initialValue: item.unit,
                            textInputAction: TextInputAction.next,
                            decoration: const InputDecoration(labelText: 'Unit'),
                            onChanged: (val) { item.unit = val; _onDataChanged(); },
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: TextFormField(
                            focusNode: _node('i_${index}_rate'),
                            initialValue: item.rate == 0 ? '' : item.rate.toString(),
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            textInputAction: TextInputAction.next,
                            decoration: const InputDecoration(labelText: 'Rate'),
                            onChanged: (val) { item.rate = double.tryParse(val) ?? 0; setState(() {}); _onDataChanged(); },
                          ),
                        ),
                      ]),
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerRight,
                        child: Text('Taxable: ₹${item.taxableValue.toStringAsFixed(2)}',
                          style: TextStyle(fontWeight: FontWeight.w600, color: Theme.of(context).colorScheme.primary)),
                      ),
                    ],
                  ),
                ),
              ).animate().fade(delay: 300.ms).slideX(begin: 0.1);
            }).toList(),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                icon: const Icon(Icons.add),
                label: const Text('Add Line Item'),
                onPressed: () {
                  setState(() => data.items.add(GstInvoiceItem(sno: data.items.length + 1)));
                  _onDataChanged();
                },
              ),
            ).animate().fade(delay: 400.ms),

            _buildSectionTitle('Tax & Other').animate().fade(delay: 500.ms),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SwitchListTile(
                      title: const Text('Interstate (IGST)', style: TextStyle(fontWeight: FontWeight.bold)),
                      value: data.isInterstate,
                      activeColor: Theme.of(context).colorScheme.primary,
                      onChanged: (val) {
                        setState(() => data.isInterstate = val);
                        _onDataChanged();
                      },
                    ),
                    SwitchListTile(
                      title: const Text('Reverse Charge', style: TextStyle(fontWeight: FontWeight.bold)),
                      value: data.isReverseCharge,
                      activeColor: Theme.of(context).colorScheme.primary,
                      onChanged: (val) {
                        setState(() => data.isReverseCharge = val);
                        _onDataChanged();
                      },
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            focusNode: _transportFocus,
                            initialValue: data.transportCost == 0 ? '' : data.transportCost.toString(),
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            textInputAction: TextInputAction.next,
                            onFieldSubmitted: (_) => _notesFocus.requestFocus(),
                            decoration: const InputDecoration(labelText: 'Transport Cost (Rs)'),
                            onChanged: (val) { data.transportCost = double.tryParse(val) ?? 0; setState(() {}); _onDataChanged(); },
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextFormField(
                            initialValue: data.cgstRate.toString(),
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            decoration: InputDecoration(
                              labelText: data.isInterstate ? 'IGST Rate (%)' : 'CGST Rate (%)',
                            ),
                            onChanged: (val) {
                              final rate = double.tryParse(val) ?? 9.0;
                              if (data.isInterstate) {
                                data.igstRate = rate;
                              } else {
                                data.cgstRate = rate;
                              }
                              setState(() {});
                              _onDataChanged();
                            },
                          ),
                        ),
                      ],
                    ),
                    if (!data.isInterstate) ...[
                      const SizedBox(height: 12),
                      TextFormField(
                        initialValue: data.sgstRate.toString(),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: const InputDecoration(labelText: 'SGST Rate (%)'),
                        onChanged: (val) { data.sgstRate = double.tryParse(val) ?? 9.0; setState(() {}); _onDataChanged(); },
                      ),
                    ],
                    const SizedBox(height: 12),
                    TextFormField(
                      focusNode: _notesFocus,
                      initialValue: data.notes,
                      maxLines: 3,
                      decoration: const InputDecoration(labelText: 'Notes'),
                      onChanged: (val) { data.notes = val; _onDataChanged(); },
                    ),
                  ],
                ),
              ),
            ).animate().fade(delay: 500.ms),

            _buildSectionTitle('Tax Breakdown').animate().fade(delay: 600.ms),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Builder(builder: (context) {
                      data.calculateTotals();
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _buildComputationRow('Subtotal (Taxable Value)', data.subtotal),
                          _buildComputationRow('Transport Cost', data.transportCost),
                          const Divider(),
                          if (data.isInterstate) ...[
                            _buildComputationRow('IGST (${data.igstRate}%)', data.igstAmount),
                          ] else ...[
                            _buildComputationRow('CGST (${data.cgstRate}%)', data.cgstAmount),
                            _buildComputationRow('SGST (${data.sgstRate}%)', data.sgstAmount),
                          ],
                          const Divider(thickness: 1.5),
                          _buildComputationRow('Grand Total', data.grandTotal, isBold: true),
                          const SizedBox(height: 8),
                          Text(
                            data.amountInWords,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        ],
                      );
                    }),
                  ],
                ),
              ),
            ).animate().fade(delay: 600.ms),

            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              height: 60,
              child: ElevatedButton(
                onPressed: _isGeneratingPdf ? null : _generatePdf,
                style: ElevatedButton.styleFrom(padding: EdgeInsets.zero, backgroundColor: Colors.transparent, elevation: 0, shadowColor: Colors.transparent),
                child: Ink(
                  decoration: BoxDecoration(
                    gradient: AppTheme.primaryGradientFrom(Provider.of<AppState>(context, listen: false).clientConfig),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Container(
                    alignment: Alignment.center,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        if (_isGeneratingPdf)
                          const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5))
                        else
                          const Icon(Icons.picture_as_pdf, color: Colors.white),
                        const SizedBox(width: 12),
                        Text(_isGeneratingPdf ? 'GENERATING PDF...' : 'GENERATE GST PDF', style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
                      ],
                    ),
                  ),
                ),
              ),
            ).animate().scale(delay: 700.ms),
            const SizedBox(height: 20),
            CraftedWithLoveWidget(),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }
}
