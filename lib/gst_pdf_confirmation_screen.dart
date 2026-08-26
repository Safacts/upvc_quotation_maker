import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import 'package:printing/printing.dart' deferred as print_lib;
import 'package:flutter_animate/flutter_animate.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';
import 'gst_invoice_model.dart';
import 'file_helper.dart';

class GstPdfConfirmationScreen extends StatefulWidget {
  final GstInvoiceData data;
  final Uint8List pdfBytes;

  const GstPdfConfirmationScreen({
    super.key,
    required this.data,
    required this.pdfBytes,
  });

  @override
  _GstPdfConfirmationScreenState createState() => _GstPdfConfirmationScreenState();
}

class _GstPdfConfirmationScreenState extends State<GstPdfConfirmationScreen> {
  String _fileName() => 'GST_Invoice_${widget.data.invoiceNumber}.pdf';

  Future<void> _savePdf() async {
    try {
      final helper = FileHelper();
      await helper.downloadPdf(widget.pdfBytes, _fileName());
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Saved: ${_fileName()}')));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error saving PDF: $e')));
    }
  }

  String _shareMessage({required String app}) {
    final companyName = Provider.of<AppState>(context, listen: false).companyName;
    final base = "Hello ${widget.data.buyerName},\n\nPlease find attached the GST invoice ${widget.data.invoiceNumber} from $companyName.";
    return app == 'WhatsApp' || app == 'Telegram'
        ? base
        : 'Here is your GST invoice ${widget.data.invoiceNumber} from $companyName.';
  }

  Future<void> _sharePdf(String text) async {
    await Clipboard.setData(ClipboardData(text: text));
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Message copied to clipboard! Paste it when sharing.')));
    }

    if (kIsWeb) {
      await Share.shareXFiles([XFile.fromData(widget.pdfBytes, name: _fileName())], text: text);
    } else {
      final helper = FileHelper();
      final dir = await helper.getTempDir();
      if (dir != null) {
        await helper.writeFile('$dir/${_fileName()}', widget.pdfBytes);
        await Share.shareXFiles([XFile('$dir/${_fileName()}')], text: text);
      }
    }
  }

  Future<void> _printPdf() async {
    await print_lib.loadLibrary();
    await print_lib.Printing.layoutPdf(onLayout: (format) async => widget.pdfBytes);
  }

  Widget _buildActionButton(String label, IconData icon, Color color, VoidCallback onTap, int delay, {Widget? brandIcon}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        width: 100,
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          border: Border.all(color: color.withValues(alpha: 0.3)),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          children: [
            brandIcon ?? Icon(icon, size: 32, color: color),
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
              Text('GST Invoice Generated', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text(widget.data.invoiceNumber, style: TextStyle(color: Colors.grey.shade600, fontSize: 16)),
              const SizedBox(height: 8),
              Text('Auto-saved successfully', style: TextStyle(color: Colors.green.shade700, fontSize: 13, fontWeight: FontWeight.w600)),

              const SizedBox(height: 40),

              Wrap(
                spacing: 16,
                runSpacing: 16,
                alignment: WrapAlignment.center,
                children: [
                  _buildActionButton('Save', Icons.download, Colors.indigo, _savePdf, 300),
                  _buildActionButton('Print', Icons.print, Colors.deepPurple, _printPdf, 400),
                  _buildActionButton('Share', Icons.share, Colors.blue, () => _sharePdf(_shareMessage(app: 'Share')), 500),
                  _buildActionButton('WhatsApp', Icons.chat, Colors.green, () => _sharePdf(_shareMessage(app: 'WhatsApp')), 600, brandIcon: const FaIcon(FontAwesomeIcons.whatsapp, size: 32, color: Colors.green)),
                  _buildActionButton('Telegram', Icons.send, Colors.lightBlue, () => _sharePdf(_shareMessage(app: 'Telegram')), 700, brandIcon: const FaIcon(FontAwesomeIcons.telegram, size: 32, color: Color(0xFF229ED9))),
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
