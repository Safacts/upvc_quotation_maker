import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mailer/mailer.dart';
import 'package:mailer/smtp_server.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'dashboard_screen.dart';

class LoginScreen extends StatefulWidget {
  @override
  _LoginScreenState createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _storage = const FlutterSecureStorage();
  
  bool _isLoading = false;
  String _errorMessage = '';
  
  // Default credentials
  final String _adminEmail = 'jvenkateshupvc@gmail.com';

  @override
  void initState() {
    super.initState();
    _checkExistingSession();
  }

  Future<void> _checkExistingSession() async {
    String? session = await _storage.read(key: 'session_active');
    if (session == 'true') {
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => DashboardScreen()));
    }
  }

  Future<String> _getStoredPassword() async {
    String? p = await _storage.read(key: 'admin_password');
    if (p == null || p.isEmpty) {
      // Set default password if not set
      await _storage.write(key: 'admin_password', value: 'Jvenkatesh@1234');
      return 'Jvenkatesh@1234';
    }
    return p;
  }

  void _login() async {
    setState(() { _isLoading = true; _errorMessage = ''; });
    final storedPassword = await _getStoredPassword();
    
    if (_emailController.text.trim() == _adminEmail && _passwordController.text == storedPassword) {
      await _storage.write(key: 'session_active', value: 'true');
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => DashboardScreen()));
    } else {
      setState(() { _isLoading = false; _errorMessage = 'Invalid email or password.'; });
    }
  }

  Future<void> _forgotPassword() async {
    final String otp = (Random().nextInt(900000) + 100000).toString(); // 6 digit OTP
    setState(() => _isLoading = true);

    try {
      final smtpKey = dotenv.env['BREVO_SMTP_KEY'] ?? '';
      if (smtpKey.isEmpty) throw Exception("SMTP Key missing");

      final smtpServer = SmtpServer('smtp-relay.brevo.com', port: 587, username: 'ad3d10001@smtp-brevo.com', password: smtpKey, ssl: false);
      
      final htmlBody = '''
      <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: auto; padding: 30px; text-align: center; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #1E3A5F;">Password Reset Request</h2>
        <p style="color: #475569; font-size: 16px;">We received a request to reset your password for the Venkateshwara UPVC app.</p>
        <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 25px 0; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1E3A5F;">
          $otp
        </div>
        <p style="color: #64748b; font-size: 14px;">Enter this code in the app to reset your password. If you didn't request this, you can safely ignore this email.</p>
      </div>
      ''';

      final message = Message()
        ..from = Address('jvenkateshupvc@gmail.com', 'System Security')
        ..recipients.add(_adminEmail)
        ..subject = 'Your Password Reset OTP'
        ..html = htmlBody;

      await send(message, smtpServer);
      setState(() => _isLoading = false);

      _showOtpDialog(otp);
    } catch (e) {
      setState(() { _isLoading = false; _errorMessage = 'Failed to send OTP: $e'; });
    }
  }

  void _showOtpDialog(String realOtp) {
    final otpController = TextEditingController();
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return AlertDialog(
          title: const Text('Enter OTP'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('An OTP has been sent to jvenkateshupvc@gmail.com.'),
              const SizedBox(height: 10),
              TextField(controller: otpController, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: '6-digit OTP')),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: () {
                if (otpController.text == realOtp) {
                  Navigator.pop(context);
                  _showNewPasswordDialog();
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Invalid OTP')));
                }
              },
              child: const Text('Verify'),
            ),
          ],
        );
      }
    );
  }

  void _showNewPasswordDialog() {
    final passController = TextEditingController();
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return AlertDialog(
          title: const Text('Set New Password'),
          content: TextField(controller: passController, obscureText: true, decoration: const InputDecoration(labelText: 'New Password')),
          actions: [
            ElevatedButton(
              onPressed: () async {
                if (passController.text.length >= 6) {
                  await _storage.write(key: 'admin_password', value: passController.text);
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password updated successfully!')));
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password too short')));
                }
              },
              child: const Text('Save'),
            ),
          ],
        );
      }
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.lock_outline, size: 80, color: theme.primaryColor).animate().scale(delay: 200.ms, duration: 500.ms, curve: Curves.easeOutBack),
              const SizedBox(height: 20),
              Text('Welcome Back', style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold, color: theme.primaryColor)).animate().fade(delay: 300.ms).slideY(begin: 0.2),
              const SizedBox(height: 8),
              Text('Sign in to manage quotations', style: theme.textTheme.bodyMedium?.copyWith(color: Colors.grey.shade600)).animate().fade(delay: 400.ms),
              const SizedBox(height: 40),
              
              Card(
                elevation: 4,
                shadowColor: Colors.black12,
                child: Padding(
                  padding: const EdgeInsets.all(24.0),
                  child: Column(
                    children: [
                      TextField(
                        controller: _emailController,
                        decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.email_outlined)),
                        keyboardType: TextInputType.emailAddress,
                      ),
                      const SizedBox(height: 16),
                      TextField(
                        controller: _passwordController,
                        decoration: const InputDecoration(labelText: 'Password', prefixIcon: Icon(Icons.lock_outline)),
                        obscureText: true,
                      ),
                      const SizedBox(height: 24),
                      if (_errorMessage.isNotEmpty) ...[
                        Text(_errorMessage, style: const TextStyle(color: Colors.red)),
                        const SizedBox(height: 12),
                      ],
                      SizedBox(
                        width: double.infinity,
                        height: 50,
                        child: ElevatedButton(
                          onPressed: _isLoading ? null : _login,
                          child: _isLoading ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)) : const Text('Login'),
                        ),
                      ),
                      const SizedBox(height: 16),
                      TextButton(
                        onPressed: _isLoading ? null : _forgotPassword,
                        child: const Text('Forgot Password?'),
                      ),
                    ],
                  ),
                ),
              ).animate().fade(delay: 500.ms).slideY(begin: 0.1),
            ],
          ),
        ),
      ),
    );
  }
}
