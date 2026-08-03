import 'dart:io';
import 'dart:async';
import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:mailer/mailer.dart';
import 'package:mailer/smtp_server.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:provider/provider.dart';
import 'models.dart';
import 'app_state.dart';
import 'pdf_generator.dart';
import 'supabase_config.dart';
import 'crafted_widget.dart';
import 'theme.dart';
import 'file_helper.dart';
import 'client_logo.dart';
import 'package:toastification/toastification.dart';
import 'pdf_confirmation_screen.dart';
import 'umami_tracker.dart';

class QuotationScreen extends StatefulWidget {
  final QuotationData? existingData;

  QuotationScreen({this.existingData});

  @override
  _QuotationScreenState createState() => _QuotationScreenState();
}

class _QuotationScreenState extends State<QuotationScreen> {
  late QuotationData data;
  bool _isLoading = false;
  bool _isSaving = false;
  Timer? _debounce;
  List<QuotationData> _pastQuotations = [];

  final _nameFocus = FocusNode();
  final _referenceFocus = FocusNode();
  final _addressFocus = FocusNode();
  final _contactFocus = FocusNode();
  final _emailFocus = FocusNode();
  final _transportFocus = FocusNode();
  final _gstFocus = FocusNode();

  final Map<String, FocusNode> _itemFocusNodes = {};

  FocusNode _node(String key) {
    return _itemFocusNodes.putIfAbsent(key, () => FocusNode());
  }

  void _nextField(String currentKey) {
    if (currentKey.startsWith('m_')) {
      final parts = currentKey.split('_');
      final idx = int.parse(parts[1]);
      final field = int.parse(parts[2]);
      if (field < 6) {
        _node('m_${idx}_${field + 1}').requestFocus();
      } else if (idx < data.measuredItems.length - 1) {
        _node('m_${idx + 1}_0').requestFocus();
      } else if (data.unmeasuredItems.isNotEmpty) {
        _node('u_0_0').requestFocus();
      } else {
        _transportFocus.requestFocus();
      }
      return;
    }
    if (currentKey.startsWith('u_')) {
      final parts = currentKey.split('_');
      final idx = int.parse(parts[1]);
      final field = int.parse(parts[2]);
      if (field < 2) {
        _node('u_${idx}_${field + 1}').requestFocus();
      } else if (idx < data.unmeasuredItems.length - 1) {
        _node('u_${idx + 1}_0').requestFocus();
      } else {
        _transportFocus.requestFocus();
      }
      return;
    }
  }

  @override
  void initState() {
    super.initState();
    if (widget.existingData != null) {
      data = widget.existingData!;
      _loadItems();
    } else {
      data = QuotationData();
      _initQuoteNumber();
    }
    _fetchPastQuotations();
  }

  Future<void> _fetchPastQuotations() async {
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final response = await SupabaseConfig.client
          .from('quotations')
          .select()
          .eq('client_id', clientId);
      if (mounted) {
        setState(() {
          _pastQuotations = (response as List).map((e) => QuotationData.fromMap(e)).toList();
        });
      }
    } catch (e) {
      debugPrint('Failed to load past quotes: $e');
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _nameFocus.dispose();
    _referenceFocus.dispose();
    _addressFocus.dispose();
    _contactFocus.dispose();
    _emailFocus.dispose();
    _transportFocus.dispose();
    _gstFocus.dispose();
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
        final measuredRes = await SupabaseConfig.client
            .from('measured_items')
            .select()
            .eq('quotation_id', data.id!)
            .eq('client_id', clientId);
        final unmeasuredRes = await SupabaseConfig.client
            .from('unmeasured_items')
            .select()
            .eq('quotation_id', data.id!)
            .eq('client_id', clientId);

        setState(() {
          data.measuredItems = (measuredRes as List).map((e) => MeasuredItem.fromMap(e)).toList();
          data.unmeasuredItems = (unmeasuredRes as List).map((e) => UnmeasuredItem.fromMap(e)).toList();
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to load items: $e')));
    }
  }

  Future<void> _initQuoteNumber() async {
    final prefix = Provider.of<AppState>(context, listen: false).quotePrefix;
    String nextNo = await QuotationData.generateNextQuoteNumber(prefix: prefix);
    setState(() => data.quotationNo = nextNo);
    _autoSaveToDatabase();
  }

  Future<void> _autoSaveToDatabase() async {
    if (_isSaving) return;
    setState(() => _isSaving = true);
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final quotationMap = data.toMap(clientId: clientId);
      if (data.id == null) {
        final res = await SupabaseConfig.client.from('quotations').insert(quotationMap).select().single();
        data.id = res['id'];
      } else {
        await SupabaseConfig.client
            .from('quotations')
            .update(quotationMap)
            .eq('id', data.id!)
            .eq('client_id', clientId);
        await SupabaseConfig.client
            .from('measured_items')
            .delete()
            .eq('quotation_id', data.id!)
            .eq('client_id', clientId);
        await SupabaseConfig.client
            .from('unmeasured_items')
            .delete()
            .eq('quotation_id', data.id!)
            .eq('client_id', clientId);
      }

      if (data.measuredItems.isNotEmpty) {
        await SupabaseConfig.client.from('measured_items').insert(data.measuredItems.map((e) => e.toMap(data.id!, clientId: clientId)).toList());
      }
      if (data.unmeasuredItems.isNotEmpty) {
        await SupabaseConfig.client.from('unmeasured_items').insert(data.unmeasuredItems.map((e) => e.toMap(data.id!, clientId: clientId)).toList());
      }
    } catch (e) {
      debugPrint('Auto-save error: $e');
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  Future<void> _sendEmail(String targetEmail) async {
    if (kIsWeb) {
      throw Exception('Email sending is not supported on web. Please use the desktop or mobile app.');
    }
    try {
      final appState = Provider.of<AppState>(context, listen: false);
      final pdfBytes = await generatePdfBytes(data, appState);
      final helper = FileHelper();
      final dir = (await helper.getTempDir()) ?? '';
      final pdfPath = '$dir/${data.quotationNo}.pdf';
      await helper.writeFile(pdfPath, pdfBytes);

      final smtpHost = dotenv.env['SMTP_HOST'] ?? 'smtp.hostinger.com';
      final smtpPort = int.tryParse(dotenv.env['SMTP_PORT'] ?? '') ?? 465;
      final smtpUser = dotenv.env['SMTP_USER'] ?? 'vitharn@rubixitsolution.com';
      final smtpPass = dotenv.env['SMTP_PASS'] ?? '';
      if (smtpPass.isEmpty) throw Exception("SMTP password not configured in .env");

      final smtpServer = SmtpServer(smtpHost, port: smtpPort, username: smtpUser, password: smtpPass, ssl: true);

      final ByteData logoData = ByteData.sublistView(await loadLogoBytes(appState.clientConfig));
      final logoPath = '$dir/logo.png';
      await helper.writeFile(logoPath, logoData.buffer.asUint8List());

      final htmlBody = '''
      <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #f8fafc;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="cid:logo" alt="${appState.companyName}" style="max-height: 100px; margin-bottom: 10px;" />
        </div>
        <h2 style="color: #1E3A5F; text-align: center; margin-top: 0;">Quotation from ${appState.companyName}</h2>
        <p style="color: #334155; font-size: 16px;">Dear <b>${data.customerName}</b>,</p>
        <p style="color: #475569; font-size: 15px; line-height: 1.6;">Please find attached the quotation <b>${data.quotationNo}</b> for your requested UPVC windows and doors.</p>
        <div style="background-color: white; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #e2e8f0;">
          <p style="margin: 5px 0; color: #1E3A5F;"><strong>Quote No:</strong> ${data.quotationNo}</p>
          <p style="margin: 5px 0; color: #1E3A5F;"><strong>Date:</strong> ${DateFormat('dd-MMM-yyyy').format(data.date)}</p>
          <p style="margin: 5px 0; color: #1E3A5F;"><strong>Total Amount:</strong> Rs. ${data.grandTotal.toStringAsFixed(2)}</p>
        </div>
        <p style="color: #475569; font-size: 14px;">If you have any questions, please feel free to reach out.</p>
        <hr style="border: none; border-top: 1px solid #cbd5e1; margin: 20px 0;">
        <p style="color: #64748b; font-size: 12px; text-align: center;">Prop: ${appState.companyProprietor} | ${appState.companyContact}</p>
      </div>
      ''';

      final message = Message()
        ..from = Address(dotenv.env['SMTP_FROM'] ?? 'vitharn@rubixitsolution.com', dotenv.env['SMTP_FROM_NAME'] ?? 'Vitharn | Rubix IT Solution')
        ..recipients.add(targetEmail.trim())
        ..subject = 'Quotation ${data.quotationNo} from ${appState.companyName}'
        ..html = htmlBody
        ..attachments.add(FileAttachment(File(pdfPath)))
        ..attachments.add(FileAttachment(File(logoPath))..location = Location.inline..cid = '<logo>');

      await send(message, smtpServer);
    } catch (e) {
      throw Exception('Failed to send email: $e');
    }
  }

  Future<void> _manualEmailPrompt() async {
    final emailController = TextEditingController(text: data.email);
    showDialog(
      context: context,
      builder: (context) {
        bool isSending = false;
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('Email Quotation'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(controller: emailController, decoration: const InputDecoration(labelText: 'Customer Email'), keyboardType: TextInputType.emailAddress),
                ],
              ),
              actions: [
                TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
                ElevatedButton(
                  onPressed: isSending ? null : () async {
                    if (emailController.text.isEmpty) return;
                    setDialogState(() => isSending = true);
                    try {
                      await _sendEmail(emailController.text);
                      Navigator.pop(context);
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Email sent successfully!')));
                    } catch (e) {
                      setDialogState(() => isSending = false);
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
                    }
                  },
                  child: isSending ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator()) : const Text('Send'),
                ),
              ],
            );
          }
        );
      }
    );
  }

  Future<void> _generateAndProcessPdf() async {
    // 1. Force Save
    umamiTrack('generate_pdf');
    await _autoSaveToDatabase();
    
    // Generate PDF bytes
    final appState = Provider.of<AppState>(context, listen: false);
    final pdfBytes = await generatePdfBytes(data, appState);
    
    // 2. If email exists, send automatically in background
    Future<void>? emailTask;
    if (data.email.isNotEmpty && data.email.contains('@')) {
      emailTask = _sendEmail(data.email);
    }

    // 3. Navigate to Confirmation Screen
    if (!mounted) return;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => PdfConfirmationScreen(
          data: data,
          pdfBytes: pdfBytes,
          emailTask: emailTask,
        ),
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(top: 24, bottom: 12),
      child: Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold, color: Theme.of(context).primaryColor)),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Scaffold(body: Center(child: CircularProgressIndicator()));

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.existingData == null ? 'New Quotation' : 'Edit Quotation'),
        actions: [
          if (_isSaving)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16.0),
              child: Center(child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))),
            ),
          IconButton(icon: const Icon(Icons.email), onPressed: _manualEmailPrompt, tooltip: 'Send to custom email'),
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
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Quote No', style: TextStyle(fontSize: 12, color: Colors.grey)),
                            Text(data.quotationNo, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                          ],
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            const Text('Date', style: TextStyle(fontSize: 12, color: Colors.grey)),
                            Text(DateFormat('dd-MMM-yyyy').format(data.date), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                          ],
                        ),
                      ],
                    ),

                  ],
                ),
              ),
            ).animate().fade().slideY(begin: -0.1),


            
            _buildSectionTitle('Customer Details').animate().fade(delay: 100.ms),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Autocomplete<QuotationData>(
                      initialValue: TextEditingValue(text: data.customerName),
                      displayStringForOption: (option) => option.customerName,
                      optionsBuilder: (TextEditingValue textEditingValue) {
                        if (textEditingValue.text.isEmpty) return const Iterable<QuotationData>.empty();
                        final uniqueCustomers = <String, QuotationData>{};
                        for (var q in _pastQuotations) {
                          if (q.customerName.toLowerCase().contains(textEditingValue.text.toLowerCase())) {
                            uniqueCustomers.putIfAbsent(q.customerName, () => q);
                          }
                        }
                        return uniqueCustomers.values;
                      },
                      onSelected: (QuotationData selection) {
                        setState(() {
                          data.customerName = selection.customerName;
                          data.address = selection.address;
                          data.contactNo = selection.contactNo;
                          data.email = selection.email;
                        });
                        _onDataChanged();
                      },
                      fieldViewBuilder: (context, textEditingController, focusNode, onFieldSubmitted) {
                        return TextFormField(
                          controller: textEditingController,
                          focusNode: focusNode,
                          textInputAction: TextInputAction.next,
                          onFieldSubmitted: (_) {
                            onFieldSubmitted();
                            _referenceFocus.requestFocus();
                          },
                          decoration: const InputDecoration(labelText: 'Name'),
                          onChanged: (val) { data.customerName = val; _onDataChanged(); },
                        );
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      focusNode: _referenceFocus,
                      initialValue: data.reference,
                      textInputAction: TextInputAction.next,
                      onFieldSubmitted: (_) => _addressFocus.requestFocus(),
                      decoration: const InputDecoration(labelText: 'Reference'),
                      onChanged: (val) { data.reference = val; _onDataChanged(); }
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      focusNode: _addressFocus,
                      initialValue: data.address,
                      textInputAction: TextInputAction.next,
                      onFieldSubmitted: (_) => _contactFocus.requestFocus(),
                      decoration: const InputDecoration(labelText: 'Address'),
                      onChanged: (val) { data.address = val; _onDataChanged(); }
                    ),
                    const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: TextFormField(
                              focusNode: _contactFocus,
                              initialValue: data.contactNo,
                              keyboardType: TextInputType.phone,
                              textInputAction: TextInputAction.next,
                              onFieldSubmitted: (_) => _emailFocus.requestFocus(),
                              inputFormatters: [
                                LengthLimitingTextInputFormatter(10)
                              ],
                              decoration: const InputDecoration(labelText: 'Contact No'),
                              onChanged: (val) { data.contactNo = val; _onDataChanged(); }
                            )
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextFormField(
                              focusNode: _emailFocus,
                              initialValue: data.email,
                              keyboardType: TextInputType.emailAddress,
                              textInputAction: TextInputAction.done,
                              decoration: const InputDecoration(labelText: 'Email (Optional)'),
                              onChanged: (val) { data.email = val; _onDataChanged(); }
                            )
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ).animate().fade(delay: 200.ms),

            _buildSectionTitle('Measured Items').animate().fade(delay: 300.ms),
            ...data.measuredItems.asMap().entries.map((entry) {
              int index = entry.key;
              MeasuredItem item = entry.value;
              return Card(
                key: item.cardKey,
                margin: const EdgeInsets.only(bottom: 12),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Item #${index + 1}', style: const TextStyle(fontWeight: FontWeight.bold)),
                          IconButton(icon: const Icon(Icons.delete, color: Colors.redAccent), padding: EdgeInsets.zero, constraints: const BoxConstraints(), onPressed: () { setState(() => data.measuredItems.removeAt(index)); _onDataChanged(); }),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(children: [
                        Expanded(child: TextFormField(focusNode: _node('m_${index}_0'), initialValue: item.code, textInputAction: TextInputAction.next, onFieldSubmitted: (_) => _nextField('m_${index}_0'), decoration: const InputDecoration(labelText: 'Code'), onChanged: (val) { item.code = val; _onDataChanged(); })),
                        const SizedBox(width: 12),
                        Expanded(flex: 2, child: 
                          (Provider.of<AppState>(context, listen: false).clientConfig.enablePricePresets) 
                            ? Autocomplete<Map<String, dynamic>>(
                                initialValue: TextEditingValue(text: item.description),
                                displayStringForOption: (option) => option['description'] ?? option['name'] ?? '',
                                optionsBuilder: (TextEditingValue textEditingValue) {
                                  final presets = Provider.of<AppState>(context, listen: false).clientConfig.measuredPresets;
                                  if (textEditingValue.text.isEmpty) return presets;
                                  return presets.where((preset) {
                                    final name = preset['name']?.toString().toLowerCase() ?? '';
                                    final desc = preset['description']?.toString().toLowerCase() ?? '';
                                    final input = textEditingValue.text.toLowerCase();
                                    return name.contains(input) || desc.contains(input);
                                  });
                                },
                                onSelected: (Map<String, dynamic> selection) {
                                  setState(() {
                                    if (selection['code'] != null && selection['code'].toString().isNotEmpty) {
                                      item.code = selection['code'].toString();
                                    }
                                    if (selection['glass'] != null && selection['glass'].toString().isNotEmpty) {
                                      item.glass = selection['glass'].toString();
                                    }
                                    if (selection['width'] != null && selection['width'].toString().isNotEmpty) {
                                      item.width = (selection['width'] as num?)?.toDouble() ?? 0;
                                    }
                                    if (selection['height'] != null && selection['height'].toString().isNotEmpty) {
                                      item.height = (selection['height'] as num?)?.toDouble() ?? 0;
                                    }
                                    item.description = selection['description']?.toString() ?? selection['name']?.toString() ?? '';
                                    item.rate = (selection['rate'] as num?)?.toDouble() ?? 0;
                                    item.cardKey = UniqueKey();
                                  });
                                  _onDataChanged();
                                },
                                fieldViewBuilder: (context, textEditingController, focusNode, onFieldSubmitted) {
                                  return TextFormField(
                                    controller: textEditingController,
                                    focusNode: focusNode,
                                    textInputAction: TextInputAction.next,
                                    onFieldSubmitted: (_) {
                                      onFieldSubmitted();
                                      _nextField('m_${index}_1');
                                    },
                                    decoration: const InputDecoration(labelText: 'Description (Type to search measured presets)'),
                                    onChanged: (val) { item.description = val; _onDataChanged(); },
                                  );
                                },
                              )
                            : TextFormField(
                                focusNode: _node('m_${index}_1'), 
                                initialValue: item.description, 
                                textInputAction: TextInputAction.next, 
                                onFieldSubmitted: (_) => _nextField('m_${index}_1'), 
                                decoration: const InputDecoration(labelText: 'Description'), 
                                onChanged: (val) { item.description = val; _onDataChanged(); }
                              )
                        ),
                      ]),
                      const SizedBox(height: 12),
                      Row(children: [
                        Expanded(child: TextFormField(focusNode: _node('m_${index}_2'), initialValue: item.width == 0 ? '' : item.width.toString(), keyboardType: TextInputType.number, textInputAction: TextInputAction.next, onFieldSubmitted: (_) => _nextField('m_${index}_2'), decoration: const InputDecoration(labelText: 'W (MM)'), onChanged: (val) { item.width = double.tryParse(val) ?? 0; setState((){}); _onDataChanged(); })),
                        const SizedBox(width: 12),
                        Expanded(child: TextFormField(focusNode: _node('m_${index}_3'), initialValue: item.height == 0 ? '' : item.height.toString(), keyboardType: TextInputType.number, textInputAction: TextInputAction.next, onFieldSubmitted: (_) => _nextField('m_${index}_3'), decoration: const InputDecoration(labelText: 'H (MM)'), onChanged: (val) { item.height = double.tryParse(val) ?? 0; setState((){}); _onDataChanged(); })),
                        const SizedBox(width: 12),
                        Expanded(child: TextFormField(focusNode: _node('m_${index}_4'), initialValue: item.units.toString(), keyboardType: TextInputType.number, textInputAction: TextInputAction.next, onFieldSubmitted: (_) => _nextField('m_${index}_4'), decoration: const InputDecoration(labelText: 'Units'), onChanged: (val) { item.units = int.tryParse(val) ?? 1; setState((){}); _onDataChanged(); })),
                      ]),
                      const SizedBox(height: 12),
                      Row(children: [
                        Expanded(child: TextFormField(focusNode: _node('m_${index}_5'), initialValue: item.glass, textInputAction: TextInputAction.next, onFieldSubmitted: (_) => _nextField('m_${index}_5'), decoration: const InputDecoration(labelText: 'Glass'), onChanged: (val) { item.glass = val; _onDataChanged(); })),
                        const SizedBox(width: 12),
                        Expanded(child: TextFormField(focusNode: _node('m_${index}_6'), initialValue: item.rate == 0 ? '' : item.rate.toString(), keyboardType: TextInputType.number, textInputAction: TextInputAction.next, onFieldSubmitted: (_) => _nextField('m_${index}_6'), decoration: const InputDecoration(labelText: 'Rate (Rs)'), onChanged: (val) { item.rate = double.tryParse(val) ?? 0; setState((){}); _onDataChanged(); })),
                      ]),
                    ],
                  ),
                ),
              ).animate().fade(delay: 300.ms).slideX(begin: 0.1);
            }).toList(),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(icon: const Icon(Icons.add), label: const Text('Add Measured Item'), onPressed: () { setState(() => data.measuredItems.add(MeasuredItem())); _onDataChanged(); }),
            ).animate().fade(delay: 400.ms),

            _buildSectionTitle('Unmeasured Items').animate().fade(delay: 500.ms),
            ...data.unmeasuredItems.asMap().entries.map((entry) {
              int index = entry.key;
              UnmeasuredItem item = entry.value;
              return Card(
                key: item.cardKey,
                margin: const EdgeInsets.only(bottom: 12),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Unmeasured #${index + 1}', style: const TextStyle(fontWeight: FontWeight.bold)),
                          IconButton(icon: const Icon(Icons.delete, color: Colors.redAccent), padding: EdgeInsets.zero, constraints: const BoxConstraints(), onPressed: () { setState(() => data.unmeasuredItems.removeAt(index)); _onDataChanged(); }),
                        ],
                      ),
                      const SizedBox(height: 12),
                      (Provider.of<AppState>(context, listen: false).clientConfig.enablePricePresets) 
                        ? Autocomplete<Map<String, dynamic>>(
                            initialValue: TextEditingValue(text: item.description),
                            displayStringForOption: (option) => option['description'] ?? option['name'] ?? '',
                            optionsBuilder: (TextEditingValue textEditingValue) {
                              final presets = Provider.of<AppState>(context, listen: false).clientConfig.unmeasuredPresets;
                              if (textEditingValue.text.isEmpty) return presets;
                              return presets.where((preset) {
                                final name = preset['name']?.toString().toLowerCase() ?? '';
                                final desc = preset['description']?.toString().toLowerCase() ?? '';
                                final input = textEditingValue.text.toLowerCase();
                                return name.contains(input) || desc.contains(input);
                              });
                            },
                            onSelected: (Map<String, dynamic> selection) {
                              setState(() {
                                item.description = selection['description']?.toString() ?? selection['name']?.toString() ?? '';
                                item.rate = (selection['rate'] as num?)?.toDouble() ?? 0;
                                item.cardKey = UniqueKey();
                              });
                              _onDataChanged();
                            },
                            fieldViewBuilder: (context, textEditingController, focusNode, onFieldSubmitted) {
                              return TextFormField(
                                controller: textEditingController,
                                focusNode: focusNode,
                                textInputAction: TextInputAction.next,
                                onFieldSubmitted: (_) {
                                  onFieldSubmitted();
                                  _nextField('u_${index}_0');
                                },
                                decoration: const InputDecoration(labelText: 'Description (Type to search unmeasured presets)'),
                                onChanged: (val) { item.description = val; _onDataChanged(); },
                              );
                            },
                          )
                        : TextFormField(focusNode: _node('u_${index}_0'), initialValue: item.description, textInputAction: TextInputAction.next, onFieldSubmitted: (_) => _nextField('u_${index}_0'), decoration: const InputDecoration(labelText: 'Description'), onChanged: (val) { item.description = val; _onDataChanged(); }),
                      const SizedBox(height: 12),
                      Row(children: [
                        Expanded(child: TextFormField(focusNode: _node('u_${index}_1'), initialValue: item.units.toString(), keyboardType: TextInputType.number, textInputAction: TextInputAction.next, onFieldSubmitted: (_) => _nextField('u_${index}_1'), decoration: const InputDecoration(labelText: 'Units'), onChanged: (val) { item.units = int.tryParse(val) ?? 1; setState((){}); _onDataChanged(); })),
                        const SizedBox(width: 12),
                        Expanded(child: TextFormField(focusNode: _node('u_${index}_2'), initialValue: item.rate == 0 ? '' : item.rate.toString(), keyboardType: TextInputType.number, textInputAction: TextInputAction.next, onFieldSubmitted: (_) => _nextField('u_${index}_2'), decoration: const InputDecoration(labelText: 'Rate (Rs)'), onChanged: (val) { item.rate = double.tryParse(val) ?? 0; setState((){}); _onDataChanged(); })),
                      ]),
                    ],
                  ),
                ),
              ).animate().fade(delay: 500.ms).slideX(begin: 0.1);
            }).toList(),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(icon: const Icon(Icons.add), label: const Text('Add Unmeasured Item'), onPressed: () { setState(() => data.unmeasuredItems.add(UnmeasuredItem())); _onDataChanged(); }),
            ).animate().fade(delay: 600.ms),
            
            _buildSectionTitle('Final Computations').animate().fade(delay: 700.ms),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    TextFormField(
                      focusNode: _transportFocus,
                      initialValue: data.transport == 0 ? '' : data.transport.toString(),
                      keyboardType: TextInputType.number,
                      textInputAction: TextInputAction.next,
                      onFieldSubmitted: (_) {
                        if (data.includeGst) {
                          _gstFocus.requestFocus();
                        }
                      },
                      decoration: const InputDecoration(labelText: 'Transport Cost (Rs)'),
                      onChanged: (val) {
                        data.transport = double.tryParse(val) ?? 0;
                        setState(() {});
                        _onDataChanged();
                      },
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Checkbox(
                          value: data.includeGst,
                          onChanged: (val) {
                            setState(() {
                              data.includeGst = val ?? false;
                              if (data.includeGst && data.gstPercentage == 0.0) {
                                final appState = Provider.of<AppState>(context, listen: false);
                                data.gstPercentage = appState.defaultGstPercentage;
                              }
                            });
                            _onDataChanged();
                          },
                        ),
                        const Expanded(child: Text('Do you want to add GST to the invoice?')),
                      ],
                    ),
                    if (data.includeGst)
                      Padding(
                        padding: const EdgeInsets.only(left: 48.0, top: 8.0, bottom: 8.0),
                        child: TextFormField(
                          focusNode: _gstFocus,
                          initialValue: data.gstPercentage == 0.0 ? '' : data.gstPercentage.toString(),
                          keyboardType: TextInputType.number,
                          textInputAction: TextInputAction.done,
                          decoration: const InputDecoration(labelText: 'GST Percentage (%)'),
                          onChanged: (val) {
                            data.gstPercentage = double.tryParse(val) ?? 0.0;
                            setState(() {});
                            _onDataChanged();
                          },
                        ),
                      ),
                    const Divider(),
                    const SizedBox(height: 8),
                    _buildComputationRow('Subtotal (Actual Amount)', data.actualAmount),
                    _buildComputationRow('Transport Cost', data.transport),
                    if (data.includeGst)
                      _buildComputationRow('IGST (${data.gstPercentage}%)', data.igst),
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
                ),
              ),
            ).animate().fade(delay: 700.ms),
            
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              height: 60,
              child: ElevatedButton(
                onPressed: _generateAndProcessPdf,
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
                      children: const [
                        Icon(Icons.picture_as_pdf, color: Colors.white),
                        SizedBox(width: 12),
                        Text('GENERATE PDF', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
                      ],
                    ),
                  ),
                ),
              ),
            ).animate().scale(delay: 800.ms),
            const SizedBox(height: 20),
            CraftedWithLoveWidget(),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
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
}