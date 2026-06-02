import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'package:printing/printing.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'models.dart';
import 'theme.dart';

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
    } catch (e) {
      if (mounted) {
        setState(() {
          _emailStatus = 'Failed to send email';
          _emailIcon = Icons.error;
          _emailColor = Colors.red;
        });
      }
    }
  }

  Future<void> _savePdfToDevice() async {
    try {
      if (Platform.isAndroid) {
        var status = await Permission.storage.status;
        if (!status.isGranted) {
          status = await Permission.storage.request();
          if (!status.isGranted) {
            status = await Permission.manageExternalStorage.request();
          }
        }
        
        if (status.isGranted) {
          Directory? directory = Directory('/storage/emulated/0/Download');
          if (!await directory.exists()) {
            directory = await getExternalStorageDirectory();
          }
          
          if (directory != null) {
            final file = File('${directory.path}/Quotation_${widget.data.quotationNo}.pdf');
            await file.writeAsBytes(widget.pdfBytes);
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Saved to Downloads: Quotation_${widget.data.quotationNo}.pdf')));
            return;
          }
        } else {
           ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Storage permission denied.')));
           return;
        }
      } else {
        // Fallback for other platforms
        final directory = await getApplicationDocumentsDirectory();
        final file = File('${directory.path}/Quotation_${widget.data.quotationNo}.pdf');
        await file.writeAsBytes(widget.pdfBytes);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Saved to Documents: Quotation_${widget.data.quotationNo}.pdf')));
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error saving PDF: $e')));
    }
  }

  Future<void> _sharePdf() async {
    final tempDir = await getTemporaryDirectory();
    final file = File('${tempDir.path}/Quotation_${widget.data.quotationNo}.pdf');
    await file.writeAsBytes(widget.pdfBytes);
    
    await Share.shareXFiles([XFile(file.path)], text: 'Here is your quotation ${widget.data.quotationNo}');
  }

  Future<void> _shareToWhatsApp() async {
    final message = Uri.encodeComponent("Hello ${widget.data.customerName},\n\nPlease find attached the quotation ${widget.data.quotationNo} from Venkateshwara UPVC.");
    final url = Uri.parse("whatsapp://send?text=$message");
    
    // We launch WhatsApp first to prepare the chat, then we can share the PDF manually.
    // Standard whatsapp url scheme doesn't support file attachments directly without Share.shareXFiles.
    // So we will trigger shareXFiles if URL launch succeeds.
    
    final tempDir = await getTemporaryDirectory();
    final file = File('${tempDir.path}/Quotation_${widget.data.quotationNo}.pdf');
    await file.writeAsBytes(widget.pdfBytes);
    
    try {
      await Share.shareXFiles([XFile(file.path)], text: "Hello ${widget.data.customerName},\n\nPlease find attached the quotation ${widget.data.quotationNo} from Venkateshwara UPVC.");
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not share file directly.')));
    }
  }

  Future<void> _shareToTelegram() async {
    final tempDir = await getTemporaryDirectory();
    final file = File('${tempDir.path}/Quotation_${widget.data.quotationNo}.pdf');
    await file.writeAsBytes(widget.pdfBytes);
    
    try {
      await Share.shareXFiles([XFile(file.path)], text: "Hello ${widget.data.customerName},\n\nPlease find attached the quotation ${widget.data.quotationNo} from Venkateshwara UPVC.");
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not share file directly.')));
    }
  }

  Future<void> _printPdf() async {
    await Printing.layoutPdf(onLayout: (format) async => widget.pdfBytes);
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
                  _buildActionButton('WhatsApp', FontAwesomeIcons.whatsapp, Colors.green, _shareToWhatsApp, 600),
                  _buildActionButton('Telegram', FontAwesomeIcons.telegram, Colors.lightBlue, _shareToTelegram, 700),
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
