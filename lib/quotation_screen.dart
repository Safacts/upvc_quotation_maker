import 'dart:io';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:mailer/mailer.dart';
import 'package:mailer/smtp_server.dart';
import 'package:path_provider/path_provider.dart';
import 'models.dart';
import 'pdf_generator.dart';
import 'supabase_config.dart';

class QuotationScreen extends StatefulWidget {
  final QuotationData? existingData;

  QuotationScreen({this.existingData});

  @override
  _QuotationScreenState createState() => _QuotationScreenState();
}

class _QuotationScreenState extends State<QuotationScreen> {
  late QuotationData data;
  final Color primaryColor = Color(0xFF1E3A5F);
  bool _isLoading = false;
  bool _isSaving = false;
  Timer? _debounce;

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
  }

  @override
  void dispose() {
    _debounce?.cancel();
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
        final measuredRes = await SupabaseConfig.client
            .from('measured_items')
            .select()
            .eq('quotation_id', data.id!);
        
        final unmeasuredRes = await SupabaseConfig.client
            .from('unmeasured_items')
            .select()
            .eq('quotation_id', data.id!);

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
    String nextNo = await QuotationData.generateNextQuoteNumber();
    setState(() {
      data.quotationNo = nextNo;
    });
    // Auto-save initial creation
    _autoSaveToDatabase();
  }

  Future<void> _autoSaveToDatabase() async {
    if (_isSaving) return;
    setState(() => _isSaving = true);
    try {
      final quotationMap = data.toMap();
      
      if (data.id == null) {
        final res = await SupabaseConfig.client
            .from('quotations')
            .insert(quotationMap)
            .select()
            .single();
        data.id = res['id'];
      } else {
        await SupabaseConfig.client
            .from('quotations')
            .update(quotationMap)
            .eq('id', data.id!);
        
        await SupabaseConfig.client.from('measured_items').delete().eq('quotation_id', data.id!);
        await SupabaseConfig.client.from('unmeasured_items').delete().eq('quotation_id', data.id!);
      }

      if (data.measuredItems.isNotEmpty) {
        final mItems = data.measuredItems.map((e) => e.toMap(data.id!)).toList();
        await SupabaseConfig.client.from('measured_items').insert(mItems);
      }
      
      if (data.unmeasuredItems.isNotEmpty) {
        final umItems = data.unmeasuredItems.map((e) => e.toMap(data.id!)).toList();
        await SupabaseConfig.client.from('unmeasured_items').insert(umItems);
      }
    } catch (e) {
      debugPrint('Auto-save error: $e');
    } finally {
      setState(() => _isSaving = false);
    }
  }

  Future<void> _saveToDatabase() async {
    await _autoSaveToDatabase();
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Saved successfully!')));
  }

  Future<void> _emailQuotation() async {
    final emailController = TextEditingController();
    
    showDialog(
      context: context,
      builder: (context) {
        bool isSending = false;
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: Text('Email Quotation'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('Send this quotation to the customer:'),
                  SizedBox(height: 10),
                  TextField(
                    controller: emailController,
                    decoration: InputDecoration(
                      labelText: 'Customer Email',
                      border: OutlineInputBorder(),
                    ),
                    keyboardType: TextInputType.emailAddress,
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: Text('Cancel'),
                ),
                ElevatedButton(
                  onPressed: isSending ? null : () async {
                    if (emailController.text.isEmpty) return;
                    setDialogState(() => isSending = true);
                    
                    try {
                      final pdfBytes = await generatePdfBytes(data);
                      final dir = await getTemporaryDirectory();
                      final file = File('${dir.path}/${data.quotationNo}.pdf');
                      await file.writeAsBytes(pdfBytes);

                      final smtpServer = SmtpServer(
                        'smtp-relay.brevo.com',
                        port: 587,
                        username: 'ad3d10001@smtp-brevo.com',
                        password: const String.fromEnvironment('BREVO_SMTP_KEY', defaultValue: 'YOUR_SMTP_KEY_HERE'),
                        ssl: false,
                      );

                      final message = Message()
                        ..from = Address('jvenkateshupvc@gmail.com', 'Venkatesh')
                        ..recipients.add(emailController.text.trim())
                        ..subject = 'Quotation ${data.quotationNo} from Venkateshwara UPVC'
                        ..text = 'Dear ${data.customerName},\n\nPlease find attached the quotation ${data.quotationNo}.\n\nBest regards,\nVenkatesh'
                        ..attachments.add(FileAttachment(file));

                      await send(message, smtpServer);
                      
                      Navigator.pop(context);
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Email sent successfully!')));
                    } catch (e) {
                      setDialogState(() => isSending = false);
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to send email: $e')));
                    }
                  },
                  child: isSending ? SizedBox(width: 20, height: 20, child: CircularProgressIndicator()) : Text('Send'),
                ),
              ],
            );
          }
        );
      }
    );
  }

  Future<void> _launchLinkedIn() async {
    final Uri url = Uri.parse('https://www.linkedin.com/in/aadisheshu-konga/');
    if (!await launchUrl(url, mode: LaunchMode.externalApplication)) {
      debugPrint('Could not launch $url');
    }
  }

  Widget _buildSectionTitle(String title) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(color: primaryColor, borderRadius: BorderRadius.circular(5)),
      padding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      margin: EdgeInsets.only(top: 25, bottom: 15),
      child: Text(title, style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      backgroundColor: Color(0xFFE9EEF3),
      appBar: AppBar(
        title: Text(widget.existingData == null ? 'New Quotation' : 'Edit Quotation', style: TextStyle(color: Colors.white, fontSize: 18)),
        backgroundColor: primaryColor,
        elevation: 0,
        actions: [
          if (_isSaving)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0),
              child: Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))),
            ),
          IconButton(
            icon: Icon(Icons.email, color: Colors.white),
            onPressed: _emailQuotation,
            tooltip: 'Email Quotation',
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: EdgeInsets.all(12.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Card(
              elevation: 2,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Quote No', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                        Text(data.quotationNo, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                      ],
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text('Date', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                        Text(DateFormat('dd-MMM-yyyy').format(data.date), style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            
            _buildSectionTitle('Customer Details'),
            Card(
              elevation: 2,
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Column(
                  children: [
                    TextFormField(
                      initialValue: data.customerName,
                      decoration: InputDecoration(labelText: 'Name', border: OutlineInputBorder(), isDense: true),
                      onChanged: (val) { data.customerName = val; _onDataChanged(); }
                    ),
                    SizedBox(height: 12),
                    TextFormField(
                      initialValue: data.reference,
                      decoration: InputDecoration(labelText: 'Reference', border: OutlineInputBorder(), isDense: true),
                      onChanged: (val) { data.reference = val; _onDataChanged(); }
                    ),
                    SizedBox(height: 12),
                    TextFormField(
                      initialValue: data.address,
                      decoration: InputDecoration(labelText: 'Address', border: OutlineInputBorder(), isDense: true),
                      onChanged: (val) { data.address = val; _onDataChanged(); }
                    ),
                    SizedBox(height: 12),
                    TextFormField(
                      initialValue: data.contactNo,
                      keyboardType: TextInputType.phone,
                      decoration: InputDecoration(labelText: 'Contact No', border: OutlineInputBorder(), isDense: true),
                      onChanged: (val) { data.contactNo = val; _onDataChanged(); }
                    ),
                  ],
                ),
              ),
            ),

            _buildSectionTitle('Measured Items'),
            ...data.measuredItems.asMap().entries.map((entry) {
              int index = entry.key;
              MeasuredItem item = entry.value;
              return Card(
                elevation: 3,
                margin: EdgeInsets.only(bottom: 15),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: BorderSide(color: Colors.grey.shade300)),
                child: Padding(
                  padding: EdgeInsets.all(12.0),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Item #${index + 1}', style: TextStyle(fontWeight: FontWeight.bold, color: primaryColor)),
                          IconButton(
                            icon: Icon(Icons.delete_outline, color: Colors.red),
                            constraints: BoxConstraints(),
                            padding: EdgeInsets.zero,
                            onPressed: () {
                              setState(() => data.measuredItems.removeAt(index));
                              _onDataChanged();
                            }
                          ),
                        ],
                      ),
                      SizedBox(height: 10),
                      Row(children: [
                        Expanded(child: TextFormField(
                          initialValue: item.code,
                          decoration: InputDecoration(labelText: 'Code', border: OutlineInputBorder(), isDense: true),
                          onChanged: (val) { item.code = val; _onDataChanged(); }
                        )),
                        SizedBox(width: 10),
                        Expanded(flex: 2, child: TextFormField(
                          initialValue: item.description,
                          decoration: InputDecoration(labelText: 'Description', border: OutlineInputBorder(), isDense: true),
                          onChanged: (val) { item.description = val; _onDataChanged(); }
                        )),
                      ]),
                      SizedBox(height: 12),
                      Row(children: [
                        Expanded(child: TextFormField(
                          initialValue: item.width == 0 ? '' : item.width.toString(),
                          keyboardType: TextInputType.number,
                          decoration: InputDecoration(labelText: 'W (MM)', border: OutlineInputBorder(), isDense: true),
                          onChanged: (val) { 
                            item.width = double.tryParse(val) ?? 0;
                            setState(() {}); // trigger totals update
                            _onDataChanged();
                          }
                        )),
                        SizedBox(width: 10),
                        Expanded(child: TextFormField(
                          initialValue: item.height == 0 ? '' : item.height.toString(),
                          keyboardType: TextInputType.number,
                          decoration: InputDecoration(labelText: 'H (MM)', border: OutlineInputBorder(), isDense: true),
                          onChanged: (val) {
                            item.height = double.tryParse(val) ?? 0;
                            setState(() {});
                            _onDataChanged();
                          }
                        )),
                        SizedBox(width: 10),
                        Expanded(child: TextFormField(
                          initialValue: item.units.toString(),
                          keyboardType: TextInputType.number,
                          decoration: InputDecoration(labelText: 'Units', border: OutlineInputBorder(), isDense: true),
                          onChanged: (val) {
                            item.units = int.tryParse(val) ?? 1;
                            setState(() {});
                            _onDataChanged();
                          }
                        )),
                      ]),
                      SizedBox(height: 12),
                      Row(children: [
                        Expanded(child: TextFormField(
                          initialValue: item.glass,
                          decoration: InputDecoration(labelText: 'Glass', border: OutlineInputBorder(), isDense: true),
                          onChanged: (val) { item.glass = val; _onDataChanged(); }
                        )),
                        SizedBox(width: 10),
                        Expanded(child: TextFormField(
                          initialValue: item.rate == 0 ? '' : item.rate.toString(),
                          keyboardType: TextInputType.number,
                          decoration: InputDecoration(labelText: 'Rate (Rs)', border: OutlineInputBorder(), isDense: true),
                          onChanged: (val) {
                            item.rate = double.tryParse(val) ?? 0;
                            setState(() {});
                            _onDataChanged();
                          }
                        )),
                      ]),
                    ],
                  ),
                ),
              );
            }).toList(),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                icon: Icon(Icons.add), label: Text('Add Measured Item'),
                style: OutlinedButton.styleFrom(foregroundColor: primaryColor, side: BorderSide(color: primaryColor)),
                onPressed: () {
                  setState(() => data.measuredItems.add(MeasuredItem()));
                  _onDataChanged();
                },
              ),
            ),

            _buildSectionTitle('Unmeasured Items'),
            ...data.unmeasuredItems.asMap().entries.map((entry) {
              int index = entry.key;
              UnmeasuredItem item = entry.value;
              return Card(
                elevation: 2,
                margin: EdgeInsets.only(bottom: 12),
                child: Padding(
                  padding: EdgeInsets.all(12.0),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Unmeasured #${index + 1}', style: TextStyle(fontWeight: FontWeight.bold, color: primaryColor)),
                          IconButton(
                            icon: Icon(Icons.delete_outline, color: Colors.red),
                            constraints: BoxConstraints(), padding: EdgeInsets.zero,
                            onPressed: () {
                              setState(() => data.unmeasuredItems.removeAt(index));
                              _onDataChanged();
                            }
                          ),
                        ],
                      ),
                      SizedBox(height: 10),
                      TextFormField(
                        initialValue: item.description,
                        decoration: InputDecoration(labelText: 'Description', border: OutlineInputBorder(), isDense: true),
                        onChanged: (val) { item.description = val; _onDataChanged(); }
                      ),
                      SizedBox(height: 12),
                      Row(children: [
                        Expanded(child: TextFormField(
                          initialValue: item.units.toString(),
                          keyboardType: TextInputType.number,
                          decoration: InputDecoration(labelText: 'Units', border: OutlineInputBorder(), isDense: true),
                          onChanged: (val) {
                            item.units = int.tryParse(val) ?? 1;
                            setState(() {});
                            _onDataChanged();
                          }
                        )),
                        SizedBox(width: 10),
                        Expanded(child: TextFormField(
                          initialValue: item.rate == 0 ? '' : item.rate.toString(),
                          keyboardType: TextInputType.number,
                          decoration: InputDecoration(labelText: 'Rate (Rs)', border: OutlineInputBorder(), isDense: true),
                          onChanged: (val) {
                            item.rate = double.tryParse(val) ?? 0;
                            setState(() {});
                            _onDataChanged();
                          }
                        )),
                      ]),
                    ],
                  ),
                ),
              );
            }).toList(),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                icon: Icon(Icons.add), label: Text('Add Unmeasured Item'),
                style: OutlinedButton.styleFrom(foregroundColor: primaryColor, side: BorderSide(color: primaryColor)),
                onPressed: () {
                  setState(() => data.unmeasuredItems.add(UnmeasuredItem()));
                  _onDataChanged();
                },
              ),
            ),
            
            _buildSectionTitle('Final Computations'),
            Card(
              child: Padding(
                padding: EdgeInsets.all(12),
                child: TextFormField(
                  initialValue: data.transport == 0 ? '' : data.transport.toString(),
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(labelText: 'Transport Cost (Rs)', border: OutlineInputBorder(), isDense: true),
                  onChanged: (val) {
                    data.transport = double.tryParse(val) ?? 0;
                    setState(() {});
                    _onDataChanged();
                  }
                ),
              ),
            ),
            
            SizedBox(height: 30),
            Row(
              children: [
                Expanded(
                  child: SizedBox(
                    height: 55,
                    child: ElevatedButton.icon(
                      icon: Icon(Icons.save),
                      label: Text('FORCE SAVE', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                      style: ElevatedButton.styleFrom(backgroundColor: Colors.green[700], foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))),
                      onPressed: _saveToDatabase,
                    ),
                  ),
                ),
                SizedBox(width: 10),
                Expanded(
                  child: SizedBox(
                    height: 55,
                    child: ElevatedButton.icon(
                      icon: Icon(Icons.picture_as_pdf),
                      label: Text('PREVIEW PDF', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                      style: ElevatedButton.styleFrom(backgroundColor: primaryColor, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))),
                      onPressed: () => generateAndPreviewPdf(data, context),
                    ),
                  ),
                ),
              ],
            ),
            
            SizedBox(height: 20),
            Center(
              child: InkWell(
                onTap: _launchLinkedIn,
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding: EdgeInsets.all(12.0),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('Crafted with ', style: TextStyle(color: Colors.grey[700], fontSize: 13)),
                      Icon(Icons.favorite, color: Colors.redAccent, size: 16),
                      Text(' by Aadi', style: TextStyle(color: primaryColor, fontWeight: FontWeight.bold, fontSize: 13)),
                    ],
                  ),
                ),
              ),
            ),
            SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}