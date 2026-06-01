import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'dashboard_screen.dart';

class LoginScreen extends StatefulWidget {
  @override
  _LoginScreenState createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _storage = FlutterSecureStorage();
  bool _isLoading = false;
  String _error = '';

  final String _allowedEmail = 'jvenkateshupvc@gmail.com';
  final String _defaultPassword = 'Jvenkatesh@1234'; // In a real app, verify against Supabase Auth

  @override
  void initState() {
    super.initState();
    _checkLoginStatus();
  }

  Future<void> _checkLoginStatus() async {
    final isLoggedIn = await _storage.read(key: 'is_logged_in');
    if (isLoggedIn == 'true') {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (context) => DashboardScreen()),
      );
    }
  }

  void _login() async {
    setState(() {
      _isLoading = true;
      _error = '';
    });

    // Hardcoded logic as per user request
    if (_emailController.text.trim() == _allowedEmail && 
        _passwordController.text == _defaultPassword) {
      
      await _storage.write(key: 'is_logged_in', value: 'true');
      
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (context) => DashboardScreen()),
      );
    } else {
      setState(() {
        _error = 'Invalid email or password.';
        _isLoading = false;
      });
    }
  }

  void _showForgotPassword() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Reset Password'),
        content: Text('Password reset functionality will be integrated with Supabase Auth in the future.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: Text('OK')),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Color(0xFF1E3A5F),
      body: Center(
        child: SingleChildScrollView(
          padding: EdgeInsets.all(24.0),
          child: Card(
            elevation: 8,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: Padding(
              padding: EdgeInsets.all(32.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.lock_outline, size: 64, color: Color(0xFF1E3A5F)),
                  SizedBox(height: 24),
                  Text('Venkateshwara UPVC', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF1E3A5F))),
                  SizedBox(height: 8),
                  Text('Sign in to continue', style: TextStyle(color: Colors.grey[600])),
                  SizedBox(height: 32),
                  if (_error.isNotEmpty) ...[
                    Text(_error, style: TextStyle(color: Colors.red)),
                    SizedBox(height: 16),
                  ],
                  TextField(
                    controller: _emailController,
                    decoration: InputDecoration(
                      labelText: 'Email',
                      prefixIcon: Icon(Icons.email),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    keyboardType: TextInputType.emailAddress,
                  ),
                  SizedBox(height: 16),
                  TextField(
                    controller: _passwordController,
                    decoration: InputDecoration(
                      labelText: 'Password',
                      prefixIcon: Icon(Icons.lock),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    obscureText: true,
                  ),
                  SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      onPressed: _isLoading ? null : _login,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Color(0xFF1E3A5F),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))
                      ),
                      child: _isLoading 
                        ? CircularProgressIndicator(color: Colors.white) 
                        : Text('LOGIN', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    ),
                  ),
                  SizedBox(height: 16),
                  TextButton(
                    onPressed: _showForgotPassword,
                    child: Text('Forgot Password?', style: TextStyle(color: Color(0xFF1E3A5F))),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
