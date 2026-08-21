import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:http/http.dart' as http;
import 'package:toastification/toastification.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';
import 'supabase_config.dart';
import 'theme.dart';
import 'client_logo.dart';
import 'quote_share.dart';
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

  static const List<String> _templateKeys = ['Custom', 'Follow Up', 'Payment Reminder', 'Thank You'];

  @override
  void dispose() {
    _toController.dispose();
    _subjectController.dispose();
    _bodyController.dispose();
    super.dispose();
  }

  Map<String, String> _buildTemplates(String companyName) {
    return {
      'Custom': '',
      'Follow Up': 'Dear Customer,\n\nI am following up on the quotation we provided for your UPVC windows/doors. Please let me know if you have any questions or if you are ready to proceed.\n\nBest regards,\n$companyName',
      'Payment Reminder': 'Dear Customer,\n\nThis is a gentle reminder regarding the pending payment for your recent UPVC order. We kindly request you to process it at your earliest convenience.\n\nThank you,\n$companyName',
      'Thank You': 'Dear Customer,\n\nThank you for choosing $companyName! We appreciate your business and hope you are completely satisfied with your new windows and doors.\n\nBest regards,\n$companyName',
    };
  }

  void _applyTemplate(String templateName) {
    final appState = Provider.of<AppState>(context, listen: false);
    final companyName = appState.companyName.isNotEmpty ? appState.companyName : appState.clientConfig.appName;
    final templates = _buildTemplates(companyName);
    setState(() {
      _selectedTemplate = templateName;
      if (templateName != 'Custom' && templates.containsKey(templateName)) {
        _bodyController.text = templates[templateName]!;
        _subjectController.text = templateName == 'Thank You' ? 'Thank you for choosing $companyName!' : '$templateName - $companyName';
      }
    });
  }

  Future<void> _sendEmail() async {
    final to = _toController.text.trim();
    final subject = _subjectController.text.trim();
    final body = _bodyController.text.trim();

    if (to.isEmpty || subject.isEmpty || body.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please fill all required fields'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    final appState = Provider.of<AppState>(context, listen: false);
    final companyName = appState.companyName.isNotEmpty ? appState.companyName : appState.clientConfig.appName;
    setState(() => _isSending = true);

    try {
      final logoBytes = await loadLogoBytes(appState.clientConfig);
      final passwordHash = await QuoteShare.passwordHash(appState.clientConfig);

      final hasLogo = logoBytes.isNotEmpty;
      final logoHeader = hasLogo
          ? '<img src="cid:logo" alt="${htmlEscape(companyName)}" style="max-height: 80px; margin-bottom: 12px;" />'
          : '';

      final htmlBody = '''
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8fafc; padding: 24px; border-radius: 12px; border: 1px solid #e2e8f0;">
          <div style="text-align: center; margin-bottom: 24px;">
            $logoHeader
            <h1 style="color: #1e293b; margin: 0; font-size: 24px; font-weight: 700;">${htmlEscape(companyName)}</h1>
            <p style="color: #64748b; margin-top: 4px; font-size: 14px;">Premium Windows &amp; Doors</p>
          </div>
          <div style="background-color: #ffffff; padding: 24px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); color: #334155; font-size: 15px; line-height: 1.6; border: 1px solid #edf2f7;">
            ${htmlEscape(body).replaceAll('\n', '<br>')}
          </div>
          <div style="margin-top: 24px; text-align: center; color: #94a3b8; font-size: 12px;">
            <p>© ${DateTime.now().year} ${htmlEscape(companyName)}. All rights reserved.</p>
          </div>
        </div>
      ''';

      final attachments = <Map<String, dynamic>>[];
      if (hasLogo) {
        attachments.add({
          'filename': 'logo.png',
          'cid': 'logo',
          'content': base64Encode(logoBytes),
        });
      }

      final url = '${QuoteShare.origin()}/api/send_email';
      final res = await http.post(
        Uri.parse(url),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'client_id': appState.clientConfig.clientId,
          'admin_password_hash': passwordHash,
          'to': to,
          'subject': subject,
          'html': htmlBody,
          if (attachments.isNotEmpty) 'attachments': attachments,
        }),
      );

      if (res.statusCode != 200) {
        String errorMsg = 'HTTP ${res.statusCode}';
        try {
          final decoded = jsonDecode(res.body);
          if (decoded is Map && decoded['error'] != null) {
            errorMsg = decoded['error'].toString();
          }
        } catch (_) {}
        throw Exception(errorMsg);
      }

      umamiTrack('send_email');

      // Save to Supabase History (non-blocking)
      try {
        await SupabaseConfig.client.from('sent_emails').insert({
          'recipient': to,
          'subject': subject,
          'body': body,
          'client_id': appState.clientConfig.clientId,
        });
      } catch (dbErr) {
        debugPrint('sent_emails insert log skipped: $dbErr');
      }

      if (!mounted) return;
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
      if (!mounted) return;
      toastification.show(
        context: context,
        type: ToastificationType.error,
        style: ToastificationStyle.flat,
        title: const Text('Failed to send email'),
        description: Text(e.toString().replaceAll('Exception: ', '')),
        alignment: Alignment.topCenter,
        autoCloseDuration: const Duration(seconds: 5),
      );
    } finally {
      if (mounted) {
        setState(() => _isSending = false);
      }
    }
  }

  static String htmlEscape(String text) {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final appState = Provider.of<AppState>(context);
    final primaryGradient = AppTheme.primaryGradientFrom(appState.clientConfig);
    final companyName = appState.companyName.isNotEmpty ? appState.companyName : appState.clientConfig.appName;
    
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC), // Modern slate off-white
      appBar: AppBar(
        title: const Text(
          'Email Portal',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
            fontSize: 19,
            letterSpacing: 0.3,
          ),
        ),
        centerTitle: true,
        elevation: 0,
        backgroundColor: Colors.transparent,
        iconTheme: const IconThemeData(color: Colors.white),
        flexibleSpace: Container(decoration: BoxDecoration(gradient: primaryGradient)),
      ),
      body: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Unified Main Card
                Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF0F172A).withValues(alpha: 0.05),
                        blurRadius: 24,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  padding: const EdgeInsets.all(28),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Header with avatar & info
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          Container(
                            width: 48,
                            height: 48,
                            decoration: BoxDecoration(
                              gradient: primaryGradient,
                              borderRadius: BorderRadius.circular(14),
                              boxShadow: [
                                BoxShadow(
                                  color: theme.primaryColor.withValues(alpha: 0.3),
                                  blurRadius: 10,
                                  offset: const Offset(0, 4),
                                ),
                              ],
                            ),
                            child: const Icon(Icons.mark_email_read_rounded, color: Colors.white, size: 26),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Compose Direct Email',
                                  style: theme.textTheme.titleLarge?.copyWith(
                                    fontWeight: FontWeight.w800,
                                    color: const Color(0xFF1E293B),
                                    letterSpacing: -0.2,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Sending on behalf of $companyName',
                                  style: TextStyle(
                                    color: Colors.grey.shade600,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      
                      const SizedBox(height: 24),
                      const Divider(color: Color(0xFFF1F5F9), height: 1, thickness: 1),
                      const SizedBox(height: 20),

                      // Quick Templates Header & Chips
                      Row(
                        children: [
                          Icon(Icons.auto_awesome_rounded, size: 18, color: theme.primaryColor),
                          const SizedBox(width: 8),
                          const Text(
                            'Quick Templates',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF334155),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: _templateKeys.map((key) {
                          final isSelected = _selectedTemplate == key;
                          return ChoiceChip(
                            label: Text(
                              key,
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                                color: isSelected ? Colors.white : const Color(0xFF475569),
                              ),
                            ),
                            selected: isSelected,
                            selectedColor: theme.primaryColor,
                            backgroundColor: const Color(0xFFF1F5F9),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                              side: BorderSide(
                                color: isSelected ? theme.primaryColor : const Color(0xFFE2E8F0),
                              ),
                            ),
                            showCheckmark: false,
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            onSelected: (val) {
                              if (val) _applyTemplate(key);
                            },
                          );
                        }).toList(),
                      ),

                      const SizedBox(height: 24),

                      // Recipient Field
                      const Text(
                        'Recipient Email',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF475569)),
                      ),
                      const SizedBox(height: 6),
                      TextField(
                        controller: _toController,
                        keyboardType: TextInputType.emailAddress,
                        decoration: InputDecoration(
                          hintText: 'customer@example.com',
                          hintStyle: TextStyle(color: Colors.grey.shade400, fontSize: 14),
                          prefixIcon: Icon(Icons.alternate_email_rounded, color: Colors.grey.shade600, size: 20),
                          filled: true,
                          fillColor: const Color(0xFFF8FAFC),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: theme.primaryColor, width: 2),
                          ),
                        ),
                        style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 15),
                      ),

                      const SizedBox(height: 18),

                      // Subject Field
                      const Text(
                        'Subject',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF475569)),
                      ),
                      const SizedBox(height: 6),
                      TextField(
                        controller: _subjectController,
                        decoration: InputDecoration(
                          hintText: 'e.g. Quotation Details / Follow up',
                          hintStyle: TextStyle(color: Colors.grey.shade400, fontSize: 14),
                          prefixIcon: Icon(Icons.subject_rounded, color: Colors.grey.shade600, size: 20),
                          filled: true,
                          fillColor: const Color(0xFFF8FAFC),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide(color: theme.primaryColor, width: 2),
                          ),
                        ),
                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
                      ),

                      const SizedBox(height: 18),

                      // Body Field
                      const Text(
                        'Email Message',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF475569)),
                      ),
                      const SizedBox(height: 6),
                      TextField(
                        controller: _bodyController,
                        maxLines: 9,
                        decoration: InputDecoration(
                          hintText: 'Type your email body here...',
                          hintStyle: TextStyle(color: Colors.grey.shade400, fontSize: 14),
                          filled: true,
                          fillColor: const Color(0xFFF8FAFC),
                          contentPadding: const EdgeInsets.all(16),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: BorderSide(color: theme.primaryColor, width: 2),
                          ),
                        ),
                        style: const TextStyle(fontSize: 14, height: 1.6, color: Color(0xFF1E293B)),
                      ),

                      const SizedBox(height: 28),

                      // Send Email Button
                      SizedBox(
                        height: 54,
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _isSending ? null : _sendEmail,
                          style: ElevatedButton.styleFrom(
                            padding: EdgeInsets.zero,
                            backgroundColor: Colors.transparent,
                            elevation: 4,
                            shadowColor: theme.primaryColor.withValues(alpha: 0.35),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          ),
                          child: Ink(
                            decoration: BoxDecoration(
                              gradient: primaryGradient,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Container(
                              alignment: Alignment.center,
                              child: _isSending
                                  ? const Row(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        SizedBox(
                                          width: 20,
                                          height: 20,
                                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                                        ),
                                        SizedBox(width: 14),
                                        Text(
                                          'SENDING EMAIL...',
                                          style: TextStyle(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w700,
                                            fontSize: 15,
                                            letterSpacing: 0.8,
                                          ),
                                        ),
                                      ],
                                    )
                                  : const Row(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        Icon(Icons.send_rounded, color: Colors.white, size: 20),
                                        SizedBox(width: 10),
                                        Text(
                                          'SEND EMAIL',
                                          style: TextStyle(
                                            color: Colors.white,
                                            fontSize: 15,
                                            fontWeight: FontWeight.w700,
                                            letterSpacing: 0.5,
                                          ),
                                        ),
                                      ],
                                    ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ).animate().fade(duration: 350.ms).slideY(begin: 0.05),
                
                const SizedBox(height: 28),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

