import 'dart:async';
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
import 'google_signin.dart';
import 'supabase_config.dart';
import 'config/client_config.dart';
import 'config/client_loader.dart';
import 'umami_tracker.dart';
import 'utils/http_client.dart';
import 'services/notification_center_service.dart';

// Helper: Use absolute URL for mobile, relative for web
String get _apiBase => kIsWeb ? '' : 'https://app.vitharn.com';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  _LoginScreenState createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;
  String _errorMessage = '';
  StreamSubscription<GoogleSignInResult>? _googleSub;
  bool _googleReady = false;
  bool _passwordVisible = false;
  bool _showManualEmail = false;

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
    _passwordController.addListener(_onInputChanged);
    _emailController.addListener(_onInputChanged);
    _checkExistingSession();
    _initGoogleSignIn();
    // Client-specific app/web: autofill email so only password is required
    WidgetsBinding.instance.addPostFrameCallback((_) => _autofillEmailForClient());
  }

  void _onInputChanged() {
    if (_errorMessage.isNotEmpty && mounted) {
      setState(() => _errorMessage = '');
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_emailController.text.isEmpty) {
      _autofillEmailForClient();
    }
  }

  void _autofillEmailForClient() {
    if (_emailController.text.isNotEmpty) return;
    try {
      final appState = Provider.of<AppState>(context, listen: false);
      final config = appState.clientConfig;
      String email = '';
      if (config.adminEmails.isNotEmpty) {
        email = config.adminEmails.first;
      } else if (config.companyEmail.isNotEmpty) {
        email = config.companyEmail;
      }
      if (email.isNotEmpty) {
        setState(() => _emailController.text = email);
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _passwordController.removeListener(_onInputChanged);
    _emailController.removeListener(_onInputChanged);
    _passwordController.dispose();
    _emailController.dispose();
    _googleSub?.cancel();
    super.dispose();
  }

  Future<void> _initGoogleSignIn() async {
    if (!googleSignInEnabled) return;
    try {
      _googleSub = googleSignInResults.listen(_handleGoogleResult);
      await ensureGoogleSignInReady();
      if (mounted) setState(() => _googleReady = true);
    } catch (_) {}
  }

  Future<void> _onNativeGooglePressed() async {
    if (_isLoading) return;
    final r = await startGoogleSignIn();
    if (r != null) _handleGoogleResult(r);
  }

  void _handleGoogleResult(GoogleSignInResult r) {
    if (!r.succeeded) {
      if (r.error != null && r.error!.isNotEmpty) {
        setState(() => _errorMessage = r.error!);
      }
      return;
    }
    _loginWithGoogleEmail(r.email!, credential: r.credential);
  }

  Future<void> _loginWithGoogleEmail(String email, {String? credential}) async {
    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });
    try {
      final res = await http.post(
        Uri.parse('$_apiBase/api/portal_auth'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'mode': 'google',
          email: email.trim(),
          credential: credential,
        }),
      );
      final data = _decodeJson(res);
      if (data == null) {
        setState(() {
          _isLoading = false;
          _errorMessage = _badResponseMessage(res);
        });
        return;
      }
      if (res.statusCode == 200 &&
          (data['role'] == 'admin' || data['role'] == 'customer')) {
        umamiTrack('login_success');
        await _writeSession('true');
        final clientId = (data['client_id'] as String?)?.trim();
        if (clientId != null && clientId.isNotEmpty) {
          await _applyTenant(
            clientId,
            authenticatedConfig: data['config'] as Map?,
          );
        }
        if (!mounted) return;
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (context) => DashboardScreen()),
        );
      } else if (res.statusCode == 200 && data['role'] == 'signup') {
        setState(() {
          _isLoading = false;
          _errorMessage =
              'We received your request. Complete your UPVC business profile at app.vitharn.com/signup.';
        });
      } else {
        umamiTrack('login_failed');
        setState(() {
          _isLoading = false;
          _errorMessage =
              (data['error'] as String?) ??
              'This Google account is not registered. Please use your email and password instead.';
        });
      }
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = 'Connection error: $e';
      });
    }
  }

  Future<void> _applyTenant(
    String clientId, {
    Map<dynamic, dynamic>? authenticatedConfig,
  }) async {
    final appState = Provider.of<AppState>(context, listen: false);
    try {
      ClientConfig? config;
      if (authenticatedConfig != null) {
        final candidate = ClientConfig.fromJson(
          Map<String, dynamic>.from(authenticatedConfig),
        );
        if (candidate.clientId.trim() == clientId.trim()) config = candidate;
      }
      config ??=
          await ClientLoader.loadAuthenticatedConfig(clientId) ??
          await ClientLoader.loadConfig(clientId: clientId);
      SupabaseConfig.client.headers['x-client-id'] = config.clientId;
      appState.applyClientConfig(config);
      // Notification startup can run before login knows the tenant. Bind it
      // here as soon as authentication selects the client, without delaying
      // navigation or asking for permission automatically.
      unawaited(NotificationCenterService().resubscribe(config.clientId));
      await _writeSessionClientId(config.clientId);
    } catch (_) {}
  }

  Future<void> _writeSessionClientId(String clientId) async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('session_client_id', clientId);
      return;
    }
    try {
      const storage = FlutterSecureStorage();
      await storage.write(key: 'session_client_id', value: clientId);
    } catch (_) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('session_client_id', clientId);
    }
  }

  /// Stores the password hash received from login/session API for use in
  /// save_client authentication (proves the caller knows the password).
  Future<void> _writeSessionPasswordHash(String? hash) async {
    if (hash == null || hash.isEmpty) return;
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('session_password_hash', hash);
      return;
    }
    try {
      const storage = FlutterSecureStorage();
      await storage.write(key: 'session_password_hash', value: hash);
    } catch (_) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('session_password_hash', hash);
    }
  }

  Future<void> _checkExistingSession() async {
    String? openQuote;
    if (kIsWeb) {
      try {
        final uri = Uri.base;
        openQuote = uri.queryParameters['open_quote'];
        // Verify with Next.js backend using the secure HttpOnly cookie
        final res = await postWithCredentials(
          Uri.parse('$_apiBase/api/portal_auth'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'mode': 'session'}),
        );
        if (res.statusCode == 200) {
          final data = _decodeJson(res);
          if (data != null &&
              (data['role'] == 'admin' || data['role'] == 'customer')) {
            await _writeSession('true');
            // CRITICAL FIX: Store password_hash for save_client authentication
            await _writeSessionPasswordHash(data['password_hash'] as String?);
            final clientId = (data['client_id'] as String?)?.trim();
            if (clientId != null && clientId.isNotEmpty) {
              await _applyTenant(clientId);
            }
            if (!mounted) return;
            Navigator.pushReplacement(
              context,
              MaterialPageRoute(
                builder:
                    (context) => DashboardScreen(initialOpenQuote: openQuote),
              ),
            );
            return;
          }
        }
      } catch (_) {}
    }

    String? session = await _readSession();
    if (session == 'true') {
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (context) => DashboardScreen(initialOpenQuote: openQuote),
        ),
      );
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
    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    // NATIVE (Android) PATH: offline comparison ONLY when the local config
    // actually has a password hash. The `client_public` Supabase view
    // deliberately strips password material, so `portalPasswordHash` is
    // usually empty — in that case we fall through to server-side auth
    // (same endpoint the web path uses) instead of failing locally.
    if (!kIsWeb) {
      final appState = Provider.of<AppState>(context, listen: false);
      final localHash = appState.clientConfig.portalPasswordHash;
      if (appState.clientConfig.adminEmails.contains(email) &&
          localHash.isNotEmpty) {
        if (localHash == _hashPassword(password)) {
          umamiTrack('login_success');
          await _writeSession('true');
          await _writeSessionPasswordHash(localHash);
          await _writeSessionClientId(appState.clientConfig.clientId);
          if (!mounted) return;
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (context) => DashboardScreen()),
          );
          return;
        }
        // Hash available but password doesn't match — fail immediately.
        umamiTrack('login_failed');
        setState(() {
          _isLoading = false;
          _errorMessage = 'Invalid email or password.';
        });
        return;
      }
      // No local hash available — fall through to server-side auth below.
    }

    // SERVER-SIDE AUTH (web always; native fallback when local hash empty).
    try {
      final res = await postWithCredentials(
        Uri.parse('$_apiBase/api/portal_auth'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'mode': 'login',
          'email': email.trim(),
          'password': password,
        }),
      );
      final data = _decodeJson(res);
      if (data == null) {
        setState(() {
          _isLoading = false;
          _errorMessage = _badResponseMessage(res);
        });
        return;
      }
      if (res.statusCode == 200 &&
          (data['role'] == 'admin' || data['role'] == 'customer')) {
        umamiTrack('login_success');
        await _writeSession('true');
        // Store password_hash for save_client authentication
        await _writeSessionPasswordHash(data['password_hash'] as String?);
        final clientId = (data['client_id'] as String?)?.trim();
        if (clientId != null && clientId.isNotEmpty) {
          await _applyTenant(
            clientId,
            authenticatedConfig: data['config'] as Map?,
          );
        }
        if (!mounted) return;
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (context) => DashboardScreen()),
        );
      } else if (res.statusCode == 200 && data['role'] == 'signup') {
        setState(() {
          _isLoading = false;
          _errorMessage =
              'We received your request. Complete your UPVC business profile at app.vitharn.com/signup.';
        });
      } else {
        umamiTrack('login_failed');
        setState(() {
          _isLoading = false;
          _errorMessage =
              (data['error'] as String?) ?? 'Invalid email or password.';
        });
      }
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = 'Connection error: $e';
      });
    }
  }

  Future<void> _forgotPassword() async {
    final appState = Provider.of<AppState>(context, listen: false);

    if (!kIsWeb) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please use the Web Portal to reset your password.'),
        ),
      );
      return;
    }

    setState(() => _isLoading = true);

    try {
      final res = await http.post(
        Uri.parse('$_apiBase/api/reset_client_password'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': appState.companyEmail}),
      );
      final data = _decodeJson(res);
      if (data == null) {
        setState(() {
          _isLoading = false;
          _errorMessage = _badResponseMessage(res);
        });
        return;
      }
      if (res.statusCode != 200) {
        setState(() {
          _isLoading = false;
          _errorMessage = (data['error'] as String?) ?? 'Failed to send OTP.';
        });
        return;
      }
      setState(() {
        _isLoading = false;
      });
      _showOtpDialog();
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = 'Failed to send OTP: $e';
      });
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
              TextField(
                controller: otpController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: '6-digit OTP'),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                final otp = otpController.text.trim();
                if (otp.isNotEmpty) {
                  Navigator.pop(context);
                  _showNewPasswordDialog(otp);
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Enter the OTP')),
                  );
                }
              },
              child: const Text('Verify'),
            ),
          ],
        );
      },
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
          content: TextField(
            controller: passController,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'New Password'),
          ),
          actions: [
            ElevatedButton(
              onPressed: () async {
                if (passController.text.length >= 6) {
                  final newHash = _hashPassword(passController.text);
                  setState(() => _isLoading = true);
                  try {
                    final res = await http.post(
                      Uri.parse('$_apiBase/api/reset_client_password'),
                      headers: {'Content-Type': 'application/json'},
                      body: jsonEncode({
                        'email': appState.companyEmail,
                        'otp': otp,
                        'new_hash': newHash,
                      }),
                    );
                    final data = _decodeJson(res);
                    if (!mounted) return;
                    Navigator.pop(context);
                    if (res.statusCode == 200) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Password updated successfully!'),
                        ),
                      );
                    } else {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            (data?['error'] as String?) ??
                                (data == null
                                    ? _badResponseMessage(res)
                                    : 'Failed to reset password.'),
                          ),
                        ),
                      );
                    }
                  } catch (e) {
                    if (!mounted) return;
                    Navigator.pop(context);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Failed to update password: $e')),
                    );
                  } finally {
                    setState(() => _isLoading = false);
                  }
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Password too short')),
                  );
                }
              },
              child: const Text('Save'),
            ),
          ],
        );
      },
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
              Container(
                width: 120,
                height: 120,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white,
                  boxShadow: [
                    BoxShadow(
                      color: theme.primaryColor.withOpacity(0.15),
                      blurRadius: 24,
                      spreadRadius: 0,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                padding: const EdgeInsets.all(4),
                child: ClipOval(
                  child: ClientLogo(
                    config: appState.clientConfig,
                    width: 112,
                    height: 112,
                    fit: BoxFit.cover,
                  ),
                ),
              ).animate().scale(
                delay: 200.ms,
                duration: 500.ms,
                curve: Curves.easeOutBack,
              ),
              const SizedBox(height: 20),
              Text(
                appState.companyName,
                style: theme.textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: theme.primaryColor,
                ),
                textAlign: TextAlign.center,
              ).animate().fade(delay: 200.ms),
              const SizedBox(height: 8),
              Text(
                'Welcome Back',
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ).animate().fade(delay: 300.ms).slideY(begin: 0.2),
              const SizedBox(height: 8),
              Text(
                'Sign in to manage quotations',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: Colors.grey.shade600,
                ),
              ).animate().fade(delay: 400.ms),
              const SizedBox(height: 40),

              if (_googleReady) ...[
                if (googleSignInUsesWebButton)
                  IgnorePointer(
                    ignoring: _isLoading,
                    child: SizedBox(
                      width: double.infinity,
                      height: 46,
                      child: HtmlElementView(viewType: googleSignInViewType),
                    ),
                  )
                else
                  SizedBox(
                    width: double.infinity,
                    height: 46,
                    child: OutlinedButton.icon(
                      onPressed: _isLoading ? null : _onNativeGooglePressed,
                      style: OutlinedButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: const Color(0xFF1F1F1F),
                        side: const BorderSide(color: Color(0xFFDADCE0)),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(23),
                        ),
                      ),
                      icon: const SizedBox(
                        width: 20,
                        height: 20,
                        child: CustomPaint(painter: GoogleGLogoPainter()),
                      ),
                      label: const Text(
                        'Sign in with Google',
                        style: TextStyle(fontWeight: FontWeight.w500),
                      ),
                    ),
                  ),
                const SizedBox(height: 16),
                const Row(
                  children: [
                    Expanded(child: Divider()),
                    Padding(
                      padding: EdgeInsets.symmetric(horizontal: 12),
                      child: Text('or'),
                    ),
                    Expanded(child: Divider()),
                  ],
                ),
                const SizedBox(height: 16),
              ],

              Card(
                elevation: 4,
                shadowColor: Colors.black12,
                child: Padding(
                  padding: const EdgeInsets.all(24.0),
                  child: Column(
                    children: [
                      if (_emailController.text.isNotEmpty && !_showManualEmail) ...[
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          decoration: BoxDecoration(
                            color: theme.primaryColor.withOpacity(0.06),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: theme.primaryColor.withOpacity(0.2)),
                          ),
                          child: Row(
                            children: [
                              CircleAvatar(
                                radius: 16,
                                backgroundColor: theme.primaryColor.withOpacity(0.15),
                                child: Icon(Icons.person, color: theme.primaryColor, size: 18),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      appState.companyName,
                                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                                    ),
                                    Text(
                                      _emailController.text,
                                      style: TextStyle(color: Colors.grey.shade700, fontSize: 12),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ],
                                ),
                              ),
                              TextButton(
                                onPressed: () => setState(() => _showManualEmail = true),
                                style: TextButton.styleFrom(
                                  visualDensity: VisualDensity.compact,
                                  padding: const EdgeInsets.symmetric(horizontal: 8),
                                ),
                                child: const Text('Change', style: TextStyle(fontSize: 12)),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                      ] else ...[
                        TextField(
                          controller: _emailController,
                          decoration: InputDecoration(
                            labelText: 'Email',
                            prefixIcon: const Icon(Icons.email_outlined),
                            suffixIcon: _emailController.text.isNotEmpty
                                ? IconButton(
                                    icon: const Icon(Icons.check_circle_outline, size: 20),
                                    onPressed: () => setState(() => _showManualEmail = false),
                                  )
                                : null,
                          ),
                          keyboardType: TextInputType.emailAddress,
                        ),
                        const SizedBox(height: 16),
                      ],
                      TextField(
                        controller: _passwordController,
                        autofocus: _emailController.text.isNotEmpty && !_showManualEmail,
                        onSubmitted: (_) => _login(),
                        decoration: InputDecoration(
                          labelText: 'Password',
                          prefixIcon: const Icon(Icons.lock_outline),
                          suffixIcon: IconButton(
                            icon: Icon(
                              _passwordVisible
                                  ? Icons.visibility_off
                                  : Icons.visibility,
                            ),
                            onPressed:
                                () => setState(
                                  () => _passwordVisible = !_passwordVisible,
                                ),
                          ),
                        ),
                        obscureText: !_passwordVisible,
                      ),
                      const SizedBox(height: 24),
                      if (_errorMessage.isNotEmpty) ...[
                        Text(
                          _errorMessage,
                          style: const TextStyle(color: Colors.red),
                        ),
                        const SizedBox(height: 12),
                      ],
                      SizedBox(
                        width: double.infinity,
                        height: 50,
                        child: ElevatedButton(
                          onPressed: _isLoading ? null : _login,
                          child:
                              _isLoading
                                  ? const SizedBox(
                                    width: 24,
                                    height: 24,
                                    child: CircularProgressIndicator(
                                      color: Colors.white,
                                      strokeWidth: 2,
                                    ),
                                  )
                                  : const Text('Login'),
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

/// Draws the official 4-color Google "G" (24x24 viewBox paths from the
/// public-domain Google G logo SVG). Used as the icon inside the native
/// "Sign in with Google" button.
class GoogleGLogoPainter extends CustomPainter {
  const GoogleGLogoPainter();

  static final Path _bluePath =
      Path()
        ..moveTo(22.56, 12.25)
        ..cubicTo(22.56, 11.47, 22.49, 10.72, 22.36, 10.0)
        ..lineTo(12.0, 10.0)
        ..lineTo(12.0, 14.26)
        ..lineTo(17.92, 14.26)
        ..cubicTo(17.66, 15.63, 16.88, 16.79, 15.71, 17.57)
        ..lineTo(15.71, 20.34)
        ..lineTo(19.28, 20.34)
        ..cubicTo(21.36, 18.42, 22.56, 15.6, 22.56, 12.25)
        ..close();

  static final Path _greenPath =
      Path()
        ..moveTo(12.0, 23.0)
        ..cubicTo(14.97, 23.0, 17.46, 22.02, 19.28, 20.34)
        ..lineTo(15.71, 17.57)
        ..cubicTo(14.73, 18.23, 13.48, 18.63, 12.0, 18.63)
        ..cubicTo(9.14, 18.63, 6.71, 16.7, 5.84, 14.1)
        ..lineTo(2.18, 14.1)
        ..lineTo(2.18, 16.94)
        ..cubicTo(3.99, 20.53, 7.7, 23.0, 12.0, 23.0)
        ..close();

  static final Path _yellowPath =
      Path()
        ..moveTo(5.84, 14.09)
        ..cubicTo(5.62, 13.43, 5.49, 12.73, 5.49, 12.0)
        ..cubicTo(5.49, 11.27, 5.62, 10.57, 5.84, 9.91)
        ..lineTo(5.84, 7.07)
        ..lineTo(2.18, 7.07)
        ..cubicTo(1.43, 8.55, 1.0, 10.22, 1.0, 12.0)
        ..cubicTo(1.0, 13.78, 1.43, 15.45, 2.18, 16.93)
        ..lineTo(5.03, 14.71)
        ..lineTo(5.84, 14.09)
        ..close();

  static final Path _redPath =
      Path()
        ..moveTo(12.0, 5.38)
        ..cubicTo(13.62, 5.38, 15.06, 5.94, 16.21, 7.02)
        ..lineTo(19.36, 3.87)
        ..cubicTo(17.45, 2.09, 14.97, 1.0, 12.0, 1.0)
        ..cubicTo(7.7, 1.0, 3.99, 3.47, 2.18, 7.07)
        ..lineTo(5.84, 9.91)
        ..cubicTo(6.71, 7.31, 9.14, 5.38, 12.0, 5.38)
        ..close();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..isAntiAlias = true;
    final scale = size.width / 24;
    canvas.save();
    canvas.scale(scale, scale);

    paint.color = const Color(0xFF4285F4);
    canvas.drawPath(_bluePath, paint);
    paint.color = const Color(0xFF34A853);
    canvas.drawPath(_greenPath, paint);
    paint.color = const Color(0xFFFBBC05);
    canvas.drawPath(_yellowPath, paint);
    paint.color = const Color(0xFFEA4335);
    canvas.drawPath(_redPath, paint);

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
