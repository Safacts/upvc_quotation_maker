import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:toastification/toastification.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';
import 'supabase_config.dart';
import 'theme.dart';
import 'quote_share.dart';
import 'umami_tracker.dart';
import 'utils/http_client.dart';

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
    setState(() => _isSending = true);

    try {
      final passwordHash = await QuoteShare.passwordHash(appState.clientConfig);

      final htmlBody = '''
      <div style="font-family: 'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; max-width: 600px; margin: auto; background-color: #FFFBF6; padding: 0; border: 1px solid #EADFD3; border-radius: 16px; overflow: hidden;">
        <!-- Header Band -->
        <div style="background-color: #1A0A00; padding: 26px 36px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            <tr>
              <td style="vertical-align: middle; width: 42px;">
                <img src="https://app.vitharn.com/logo.png" alt="Vitharn" width="42" height="42" style="display: block; border-radius: 10px; width: 42px; height: 42px;" />
              </td>
              <td style="vertical-align: middle; padding-left: 14px;">
                <div style="color: #FFFFFF; font-size: 17px; font-weight: 800; line-height: 1.2; letter-spacing: -0.2px;">Vitharn <span style="color: #E06A1E;">ERP</span> Services</div>
                <div style="color: #9A8B7E; font-size: 11.5px; line-height: 1.4; margin-top: 2px;">Quotation & ERP software for UPVC fabricators</div>
              </td>
            </tr>
          </table>
        </div>
        <!-- Body -->
        <div style="padding: 34px 36px; color: #3D1F08;">
          <div style="background-color: #FFF3E6; border: 1px solid #E2D3C4; border-radius: 12px; padding: 24px; margin: 0 0 28px 0; color: #3D1F08; font-size: 15px; line-height: 1.7;">
            ${htmlEscape(body).replaceAll('\n', '<br>')}
          </div>
        </div>
        <!-- Footer -->
        <div style="background-color: #FFF3E6; border-top: 1px solid #EADFD3; padding: 20px 36px; text-align: center;">
          <p style="margin: 0 0 6px 0; color: #3D1F08; font-size: 13px; line-height: 1.5;">
            Vitharn ERP Services |
            <a href="mailto:vitarn.dev@gmail.com" style="color: #C44A10; text-decoration: none;">vitarn.dev@gmail.com</a> |
            <a href="https://app.vitharn.com" style="color: #C44A10; text-decoration: none;">app.vitharn.com</a>
          </p>
          <p style="margin: 0; color: #9A8B7E; font-size: 11px; line-height: 1.4;">Sent by your Vitharn UPVC Quotation Maker</p>
        </div>
      </div>
''';

      final attachments = <Map<String, dynamic>>[];

      final url = '${QuoteShare.origin()}/api/send_email';
      final res = await postWithCredentials(
        Uri.parse(url),
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': appState.clientConfig.clientId,
        },
        body: jsonEncode({
          'client_id': appState.clientConfig.clientId,
          if (appState.clientConfig.adminEmails.isNotEmpty)
            'admin_email': appState.clientConfig.adminEmails.first,
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

