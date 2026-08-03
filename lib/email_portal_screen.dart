import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:mailer/mailer.dart';
import 'package:mailer/smtp_server.dart';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:toastification/toastification.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';
import 'supabase_config.dart';
import 'theme.dart';
import 'client_logo.dart';

class EmailPortalScreen extends StatefulWidget {
  @override
  _EmailPortalScreenState createState() => _EmailPortalScreenState();
}

class _EmailPortalScreenState extends State<EmailPortalScreen> {
  final _toController = TextEditingController();
  final _subjectController = TextEditingController();
  final _bodyController = TextEditingController();
  bool _isSending = false;
  String _selectedTemplate = 'Custom';

  Map<String, String> _templates = {};

  void _applyTemplate(String? templateName) {
    if (templateName == null) return;
    final appState = Provider.of<AppState>(context, listen: false);
    final companyName = appState.companyName;
    _templates = {
      'Custom': '',
      'Follow Up': 'Dear Customer,\n\nI am following up on the quotation we provided for your UPVC windows/doors. Please let me know if you have any questions or if you are ready to proceed.\n\nBest regards,\n$companyName',
      'Payment Reminder': 'Dear Customer,\n\nThis is a gentle reminder regarding the pending payment for your recent UPVC order. We kindly request you to process it at your earliest convenience.\n\nThank you,\n$companyName',
      'Thank You': 'Dear Customer,\n\nThank you for choosing $companyName! We appreciate your business and hope you are completely satisfied with your new windows and doors.\n\nBest regards,\n$companyName',
    };
    setState(() {
      _selectedTemplate = templateName;
      if (templateName != 'Custom') {
        _bodyController.text = _templates[templateName]!;
        _subjectController.text = templateName == 'Thank You' ? 'Thank you for choosing us!' : templateName;
      }
    });
  }

  Future<void> _sendEmail() async {
    if (_toController.text.isEmpty || _subjectController.text.isEmpty || _bodyController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please fill all fields')));
      return;
    }

    final appState = Provider.of<AppState>(context, listen: false);
    final companyName = appState.companyName;
    setState(() => _isSending = true);

    try {
      final smtpKey = dotenv.env['BREVO_SMTP_KEY'] ?? '';
      final smtpServer = SmtpServer('smtp-relay.brevo.com', port: 587, username: 'ad3d10001@smtp-brevo.com', password: smtpKey, ssl: false);

      final ByteData data = ByteData.sublistView(await loadLogoBytes(appState.clientConfig));
      final Directory tempDir = await getTemporaryDirectory();
      final File tempFile = File('${tempDir.path}/logo.png');
      await tempFile.writeAsBytes(data.buffer.asUint8List(), flush: true);

      String htmlBody = '''
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 20px; border-radius: 12px; border: 1px solid #e5e7eb;">
          <div style="text-align: center; margin-bottom: 30px;">
            <img src="cid:logo" alt="$companyName" style="max-height: 100px; margin-bottom: 10px;" />
            <h1 style="color: #4f46e5; margin: 0; font-size: 28px;">$companyName</h1>
            <p style="color: #6b7280; margin-top: 5px; font-size: 14px;">Premium Windows & Doors</p>
          </div>
          <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); color: #374151; font-size: 16px; line-height: 1.6;">
            ${_bodyController.text.replaceAll('\n', '<br>')}
          </div>
          <div style="margin-top: 30px; text-align: center; color: #9ca3af; font-size: 12px;">
            <p>© ${DateTime.now().year} $companyName. All rights reserved.</p>
            <p>Crafted with 💖 by Aadi</p>
          </div>
        </div>
      ''';

      final message = Message()
        ..from = Address(dotenv.env['BREVO_SMTP_EMAIL'] ?? appState.companyEmail, companyName)
        ..recipients.add(_toController.text.trim())
        ..subject = _subjectController.text
        ..html = htmlBody
        ..attachments.add(FileAttachment(tempFile)..location = Location.inline..cid = '<logo>');

      await send(message, smtpServer);

      // Save to Supabase History
      await SupabaseConfig.client.from('sent_emails').insert({
        'recipient': _toController.text.trim(),
        'subject': _subjectController.text,
        'body': _bodyController.text,
        'client_id': appState.clientConfig.clientId,
      });

      toastification.show(
        context: context,
        type: ToastificationType.success,
        style: ToastificationStyle.flat,
        title: const Text('Email sent successfully!'),
        alignment: Alignment.topCenter,
        autoCloseDuration: const Duration(seconds: 4),
      );
      _toController.clear();
      _subjectController.clear();
      _bodyController.clear();
      setState(() => _selectedTemplate = 'Custom');
      
    } catch (e) {
      toastification.show(
        context: context,
        type: ToastificationType.error,
        style: ToastificationStyle.flat,
        title: const Text('Failed to send email'),
        description: Text(e.toString()),
        alignment: Alignment.topCenter,
        autoCloseDuration: const Duration(seconds: 5),
      );
    } finally {
      setState(() => _isSending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    return Scaffold(
      appBar: AppBar(title: const Text('Email Portal')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            DropdownButtonFormField<String>(
              value: _selectedTemplate,
              decoration: const InputDecoration(labelText: 'Choose a Template', prefixIcon: Icon(Icons.file_copy)),
              items: _templates.keys.map((String key) {
                return DropdownMenuItem<String>(value: key, child: Text(key));
              }).toList(),
              onChanged: _applyTemplate,
            ).animate().fade().slideY(begin: -0.2),
            const SizedBox(height: 24),
            
            TextField(
              controller: _toController,
              decoration: const InputDecoration(labelText: 'To (Recipient Email)', prefixIcon: Icon(Icons.email)),
              keyboardType: TextInputType.emailAddress,
            ).animate().fade(delay: 100.ms).slideY(begin: -0.2),
            const SizedBox(height: 16),
            
            TextField(
              controller: _subjectController,
              decoration: const InputDecoration(labelText: 'Subject', prefixIcon: Icon(Icons.title)),
            ).animate().fade(delay: 200.ms).slideY(begin: -0.2),
            const SizedBox(height: 16),
            
            TextField(
              controller: _bodyController,
              maxLines: 8,
              decoration: const InputDecoration(labelText: 'Email Body', alignLabelWithHint: true),
            ).animate().fade(delay: 300.ms).slideY(begin: -0.2),
            const SizedBox(height: 32),
            
            SizedBox(
              width: double.infinity,
              height: 60,
              child: ElevatedButton(
                onPressed: _isSending ? null : _sendEmail,
                style: ElevatedButton.styleFrom(padding: EdgeInsets.zero, backgroundColor: Colors.transparent, elevation: 0, shadowColor: Colors.transparent),
                child: Ink(
                  decoration: BoxDecoration(
                    gradient: AppTheme.primaryGradientFrom(Provider.of<AppState>(context, listen: false).clientConfig),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Container(
                    alignment: Alignment.center,
                    child: _isSending 
                        ? const CircularProgressIndicator(color: Colors.white)
                        : const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.send, color: Colors.white),
                              SizedBox(width: 12),
                              Text('SEND DIRECT EMAIL', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
                            ],
                          ),
                  ),
                ),
              ),
            ).animate().scale(delay: 500.ms),
          ],
        ),
      ),
    );
  }
}
