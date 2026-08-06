import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:http/http.dart' as http;
import 'package:toastification/toastification.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';
import 'supabase_config.dart';
import 'theme.dart';
import 'client_logo.dart';
import 'umami_tracker.dart';

class EmailPortalScreen extends StatefulWidget {
  const EmailPortalScreen({super.key});

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
      final logoBytes = await loadLogoBytes(appState.clientConfig);

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

      final url = kIsWeb
          ? '/api/send_email'
          : 'https://app.vitharn.com/api/send_email';
      final res = await http.post(
        Uri.parse(url),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'to': _toController.text.trim(),
          'subject': _subjectController.text,
          'html': htmlBody,
          'attachments': [
            {
              'filename': 'logo.png',
              'cid': 'logo',
              'content': base64Encode(logoBytes),
            },
          ],
        }),
      );
      if (res.statusCode != 200) {
        throw Exception('Server returned ${res.statusCode}: ${res.body}');
      }

      umamiTrack('send_email');

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
    final appState = Provider.of<AppState>(context, listen: false);
    final primaryGradient = AppTheme.primaryGradientFrom(appState.clientConfig);
    
    return Scaffold(
      backgroundColor: Colors.grey[100], // Premium off-white background
      appBar: AppBar(
        title: const Text('Email Portal', style: TextStyle(fontWeight: FontWeight.bold)),
        elevation: 0,
        backgroundColor: Colors.transparent,
        flexibleSpace: Container(decoration: BoxDecoration(gradient: primaryGradient)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 30),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 700),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Header Card
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 20, offset: const Offset(0, 10))
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Compose Email',
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: Colors.grey[800],
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Send personalized messages directly to your customers with professional templates.',
                        style: TextStyle(color: Colors.grey[600], fontSize: 14, height: 1.5),
                      ),
                      const SizedBox(height: 24),
                      DropdownButtonFormField<String>(
                        initialValue: _selectedTemplate,
                        decoration: InputDecoration(
                          labelText: 'Choose a Template',
                          prefixIcon: Icon(Icons.auto_awesome, color: theme.primaryColor),
                          filled: true,
                          fillColor: Colors.grey[50],
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: theme.primaryColor.withValues(alpha: 0.5), width: 2)),
                        ),
                        icon: const Icon(Icons.expand_more, color: Colors.grey),
                        dropdownColor: Colors.white,
                        items: _templates.keys.map((String key) {
                          return DropdownMenuItem<String>(value: key, child: Text(key, style: const TextStyle(fontWeight: FontWeight.w500)));
                        }).toList(),
                        onChanged: _applyTemplate,
                      ).animate().fade().slideY(begin: -0.1),
                    ],
                  ),
                ).animate().fade(duration: 400.ms).slideY(begin: 0.1),
                
                const SizedBox(height: 24),

                // Form Card
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 20, offset: const Offset(0, 10))
                    ],
                  ),
                  child: Column(
                    children: [
                      TextField(
                        controller: _toController,
                        decoration: InputDecoration(
                          labelText: 'To (Recipient Email)',
                          prefixIcon: Icon(Icons.person_outline, color: Colors.grey[600]),
                          filled: true,
                          fillColor: Colors.grey[50],
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: theme.primaryColor.withValues(alpha: 0.5), width: 2)),
                        ),
                        keyboardType: TextInputType.emailAddress,
                        style: const TextStyle(fontWeight: FontWeight.w500),
                      ).animate().fade(delay: 100.ms).slideX(begin: -0.1),
                      const SizedBox(height: 20),
                      
                      TextField(
                        controller: _subjectController,
                        decoration: InputDecoration(
                          labelText: 'Subject',
                          prefixIcon: Icon(Icons.title, color: Colors.grey[600]),
                          filled: true,
                          fillColor: Colors.grey[50],
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: theme.primaryColor.withValues(alpha: 0.5), width: 2)),
                        ),
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ).animate().fade(delay: 200.ms).slideX(begin: -0.1),
                      const SizedBox(height: 20),
                      
                      TextField(
                        controller: _bodyController,
                        maxLines: 10,
                        decoration: InputDecoration(
                          labelText: 'Email Body',
                          alignLabelWithHint: true,
                          filled: true,
                          fillColor: Colors.grey[50],
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: theme.primaryColor.withValues(alpha: 0.5), width: 2)),
                        ),
                        style: const TextStyle(height: 1.5),
                      ).animate().fade(delay: 300.ms).slideX(begin: -0.1),
                    ],
                  ),
                ).animate().fade(delay: 200.ms, duration: 400.ms).slideY(begin: 0.1),
                
                const SizedBox(height: 32),
                
                // Submit Button
                SizedBox(
                  height: 65,
                  child: ElevatedButton(
                    onPressed: _isSending ? null : _sendEmail,
                    style: ElevatedButton.styleFrom(
                      padding: EdgeInsets.zero, 
                      backgroundColor: Colors.transparent, 
                      elevation: 8, 
                      shadowColor: theme.primaryColor.withValues(alpha: 0.4),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
                    ),
                    child: Ink(
                      decoration: BoxDecoration(
                        gradient: primaryGradient,
                        borderRadius: BorderRadius.circular(24),
                      ),
                      child: Container(
                        alignment: Alignment.center,
                        child: _isSending 
                            ? const Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  SizedBox(
                                    width: 24, height: 24,
                                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                                  ),
                                  SizedBox(width: 16),
                                  Text('SENDING...', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, letterSpacing: 1.5)),
                                ],
                              )
                            : const Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.send_rounded, color: Colors.white, size: 24),
                                  SizedBox(width: 12),
                                  Text('SEND DIRECT EMAIL', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
                                ],
                              ),
                      ),
                    ),
                  ),
                ).animate().scale(delay: 400.ms, curve: Curves.easeOutBack),
                const SizedBox(height: 40),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
