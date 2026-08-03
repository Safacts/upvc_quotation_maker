import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';
import 'dashboard_screen.dart';
import 'crafted_widget.dart';
import 'client_logo.dart';

class LoginScreen extends StatefulWidget {
  @override
  _LoginScreenState createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;
  String _errorMessage = '';

  Future<String?> _readSession() async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString('session_active');
    }
    try {
      final storage = FlutterSecureStorage();
      return await storage.read(key: 'session_active');
    } catch (_) {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString('session_active');
    }
  }

  Future<void> _writeSession(String value) async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('session_active', value);
      return;
    }
    try {
      final storage = const FlutterSecureStorage();
      await storage.write(key: 'session_active', value: value);
    } catch (_) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('session_active', value);
    }
  }

  @override
  void initState() {
    super.initState();
    _checkExistingSession();
  }

  Future<void> _checkExistingSession() async {
    String? session = await _readSession();
    if (session == 'true') {
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => DashboardScreen()));
    }
  }

  String _hashPassword(String password) {
    final bytes = utf8.encode(password);
    return sha256.convert(bytes).toString();
  }

  Map<String, dynamic>? _decodeJson(http.Response res) {
    final body = res.body.trim();
    if (body.isEmpty) return null;
    try {
      return jsonDecode(body) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  String _badResponseMessage(http.Response res) =>
      res.body.trim().isEmpty
          ? 'Server returned an empty response. The backend may be restarting - retry, or run npm run dev:all.'
          : 'Server returned an invalid response (HTTP ${res.statusCode}).';

  void _login() async {
    setState(() { _isLoading = true; _errorMessage = ''; });
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    try {
      final res = await http.post(
        Uri.parse('/api/portal_auth'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'mode': 'login', 'email': email, 'password': password}),
      );
      final data = _decodeJson(res);
      if (data == null) {
        setState(() { _isLoading = false; _errorMessage = _badResponseMessage(res); });
        return;
      }
      if (res.statusCode == 200 && (data['role'] == 'admin' || data['role'] == 'customer')) {
        await _writeSession('true');
        if (!mounted) return;
        Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => DashboardScreen()));
      } else {
        setState(() { _isLoading = false; _errorMessage = (data['error'] as String?) ?? 'Invalid email or password.'; });
      }
    } catch (e) {
      setState(() { _isLoading = false; _errorMessage = 'Connection error: $e'; });
    }
  }

  Future<void> _forgotPassword() async {
    final appState = Provider.of<AppState>(context, listen: false);
    setState(() => _isLoading = true);

    try {
      final res = await http.post(
        Uri.parse('/api/reset_client_password'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': appState.companyEmail}),
      );
      final data = _decodeJson(res);
      if (data == null) {
        setState(() { _isLoading = false; _errorMessage = _badResponseMessage(res); });
        return;
      }
      if (res.statusCode != 200) {
        setState(() { _isLoading = false; _errorMessage = (data['error'] as String?) ?? 'Failed to send OTP.'; });
        return;
      }
      setState(() { _isLoading = false; });
      _showOtpDialog();
    } catch (e) {
      setState(() { _isLoading = false; _errorMessage = 'Failed to send OTP: $e'; });
    }
  }

  void _showOtpDialog() {
    final appState = Provider.of<AppState>(context, listen: false);
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
              Text('An OTP has been sent to ${appState.companyEmail}.'),
              const SizedBox(height: 10),
              TextField(controller: otpController, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: '6-digit OTP')),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: () {
                final otp = otpController.text.trim();
                if (otp.isNotEmpty) {
                  Navigator.pop(context);
                  _showNewPasswordDialog(otp);
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter the OTP')));
                }
              },
              child: const Text('Verify'),
            ),
          ],
        );
      }
    );
  }

  void _showNewPasswordDialog(String otp) {
    final appState = Provider.of<AppState>(context, listen: false);
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
                  final newHash = _hashPassword(passController.text);
                  setState(() => _isLoading = true);
                  try {
                    final res = await http.post(
                      Uri.parse('/api/reset_client_password'),
                      headers: {'Content-Type': 'application/json'},
                      body: jsonEncode({'email': appState.companyEmail, 'otp': otp, 'new_hash': newHash}),
                    );
                    final data = _decodeJson(res);
                    if (!mounted) return;
                    Navigator.pop(context);
                    if (res.statusCode == 200) {
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password updated successfully!')));
                    } else {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text((data?['error'] as String?) ?? (data == null ? _badResponseMessage(res) : 'Failed to reset password.'))));
                    }
                  } catch (e) {
                    if (!mounted) return;
                    Navigator.pop(context);
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to update password: $e')));
                  } finally {
                    setState(() => _isLoading = false);
                  }
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
    final appState = Provider.of<AppState>(context);
    
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              ClientLogo(config: appState.clientConfig, width: 120, height: 120).animate().scale(delay: 200.ms, duration: 500.ms, curve: Curves.easeOutBack),
              const SizedBox(height: 20),
              Text(appState.companyName, style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold, color: theme.primaryColor), textAlign: TextAlign.center).animate().fade(delay: 200.ms),
              const SizedBox(height: 8),
              Text('Welcome Back', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600)).animate().fade(delay: 300.ms).slideY(begin: 0.2),
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
              
              const SizedBox(height: 40),
              CraftedWithLoveWidget(),
            ],
          ),
        ),
      ),
    );
  }
}
