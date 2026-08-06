import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'package:printing/printing.dart' deferred as printLib;
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';
import 'models.dart';
import 'theme.dart';
import 'file_helper.dart';

import 'notification_service.dart';

class PdfConfirmationScreen extends StatefulWidget {
  final QuotationData data;
  final Uint8List pdfBytes;
  final Future<void>? emailTask;

  const PdfConfirmationScreen({
    Key? key,
    required this.data,
    required this.pdfBytes,
    this.emailTask,
  }) : super(key: key);

  @override
  _PdfConfirmationScreenState createState() => _PdfConfirmationScreenState();
}

class _PdfConfirmationScreenState extends State<PdfConfirmationScreen> {
  String _emailStatus = 'Pending';
  IconData _emailIcon = Icons.hourglass_empty;
  Color _emailColor = Colors.orange;

  @override
  void initState() {
    super.initState();
    _handleEmailTask();
  }

  Future<void> _handleEmailTask() async {
    if (widget.emailTask == null) {
      setState(() {
        _emailStatus = 'Email not provided';
        _emailIcon = Icons.info_outline;
        _emailColor = Colors.grey;
      });
      return;
    }

    setState(() {
      _emailStatus = 'Sending email...';
      _emailIcon = Icons.hourglass_top;
      _emailColor = Colors.blue;
    });

    try {
      await widget.emailTask!;
      if (mounted) {
        setState(() {
          _emailStatus = 'Email sent successfully';
          _emailIcon = Icons.check_circle;
          _emailColor = Colors.green;
        });
      }
      NotificationService().showImportantNotification(title: "Email Sent", body: "Quotation ${widget.data.quotationNo} email has been sent successfully.");
    } catch (e) {
      if (mounted) {
        setState(() {
          _emailStatus = 'Failed to send email';
          _emailIcon = Icons.error;
          _emailColor = Colors.red;
        });
      }
      NotificationService().showImportantNotification(title: "Email Failed", body: "Failed to send email for quotation ${widget.data.quotationNo}.");
    }
  }

  Future<void> _savePdfToDevice() async {
    try {
      final helper = FileHelper();
      await helper.downloadPdf(widget.pdfBytes, 'Quotation_${widget.data.quotationNo}.pdf');
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Saved: Quotation_${widget.data.quotationNo}.pdf')));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error saving PDF: $e')));
    }
  }

  String _reviewUrl() {
    final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
    final origin = kIsWeb ? Uri.base.origin : 'https://app.vitharn.com';
    return '$origin/review/$clientId';
  }

  Future<void> _sharePdf() async {
    final text = 'Here is your quotation ${widget.data.quotationNo}.\n\nWe value your feedback! Please rate your experience here: ${_reviewUrl()}';
    if (kIsWeb) {
      await Share.shareXFiles([XFile.fromData(widget.pdfBytes, name: 'Quotation_${widget.data.quotationNo}.pdf')], text: text);
    } else {
      final helper = FileHelper();
      final dir = await helper.getTempDir();
      if (dir != null) {
        await helper.writeFile('$dir/Quotation_${widget.data.quotationNo}.pdf', widget.pdfBytes);
        await Share.shareXFiles([XFile('$dir/Quotation_${widget.data.quotationNo}.pdf')], text: text);
      }
    }
  }

  Future<void> _shareToWhatsApp() async {
    final companyName = Provider.of<AppState>(context, listen: false).companyName;
    final text = "Hello ${widget.data.customerName},\n\nPlease find attached the quotation ${widget.data.quotationNo} from $companyName.\n\nWe value your feedback! Please rate your service here: ${_reviewUrl()}";
    await _shareViaXFiles(text);
  }

  Future<void> _shareToTelegram() async {
    final companyName = Provider.of<AppState>(context, listen: false).companyName;
    final text = "Hello ${widget.data.customerName},\n\nPlease find attached the quotation ${widget.data.quotationNo} from $companyName.\n\nWe value your feedback! Please rate your service here: ${_reviewUrl()}";
    await _shareViaXFiles(text);
  }

  Future<void> _shareViaXFiles(String text) async {
    if (kIsWeb) {
      await Share.shareXFiles([XFile.fromData(widget.pdfBytes, name: 'Quotation_${widget.data.quotationNo}.pdf')], text: text);
    } else {
      final helper = FileHelper();
      final dir = await helper.getTempDir();
      if (dir != null) {
        await helper.writeFile('$dir/Quotation_${widget.data.quotationNo}.pdf', widget.pdfBytes);
        await Share.shareXFiles([XFile('$dir/Quotation_${widget.data.quotationNo}.pdf')], text: text);
      }
    }
  }

  Future<void> _printPdf() async {
    await printLib.loadLibrary();
    await printLib.Printing.layoutPdf(onLayout: (format) async => widget.pdfBytes);
  }

  Widget _buildActionButton(String label, IconData icon, Color color, VoidCallback onTap, int delay) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        width: 100,
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          border: Border.all(color: color.withOpacity(0.3)),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          children: [
            Icon(icon, size: 32, color: color),
            const SizedBox(height: 8),
            Text(label, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 12)),
          ],
        ),
      ),
    ).animate().fade(delay: Duration(milliseconds: delay)).scale();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Confirmation'),
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(20),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                  boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 10)],
                ),
                child: const Icon(Icons.check_circle, size: 60, color: Colors.green),
              ).animate().scale(curve: Curves.easeOutBack),
              
              const SizedBox(height: 24),
              Text('Quotation Generated', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text(widget.data.quotationNo, style: TextStyle(color: Colors.grey.shade600, fontSize: 16)),
              
              const SizedBox(height: 32),
              
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: _emailColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: _emailColor.withOpacity(0.3)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(_emailIcon, color: _emailColor),
                    const SizedBox(width: 12),
                    Text(_emailStatus, style: TextStyle(color: _emailColor, fontWeight: FontWeight.bold)),
                  ],
                ),
              ).animate().fade(delay: 200.ms).slideY(begin: 0.2),
              
              const SizedBox(height: 40),
              
              Wrap(
                spacing: 16,
                runSpacing: 16,
                alignment: WrapAlignment.center,
                children: [
                  _buildActionButton('Save', Icons.download, Colors.indigo, _savePdfToDevice, 300),
                  _buildActionButton('Print', Icons.print, Colors.deepPurple, _printPdf, 400),
                  _buildActionButton('Share', Icons.share, Colors.blue, _sharePdf, 500),
                  _buildActionButton('WhatsApp', Icons.chat, Colors.green, _shareToWhatsApp, 600),
                  _buildActionButton('Telegram', Icons.send, Colors.lightBlue, _shareToTelegram, 700),
                ],
              ),
              
              const SizedBox(height: 40),
              TextButton(
                onPressed: () => Navigator.of(context).popUntil((route) => route.isFirst),
                child: const Text('Back to Dashboard', style: TextStyle(fontSize: 16)),
              ).animate().fade(delay: 800.ms),
            ],
          ),
        ),
      ),
    );
  }
}
