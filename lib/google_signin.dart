export 'google_signin_native.dart'
    if (dart.library.js_interop) 'google_signin_web.dart';

/// Builds can disable Google without affecting the email/password portal path.
/// Staging clients that do not have a Google account should not be blocked by
/// Google Identity Services failing on an unregistered preview origin.
const bool googleSignInEnabled = bool.fromEnvironment(
  'GOOGLE_SIGNIN_ENABLED',
  defaultValue: true,
);

class GoogleSignInResult {
  const GoogleSignInResult({this.email, this.credential, this.error});
  final String? email;
  final String? credential;
  final String? error;
  bool get succeeded => email != null && email!.isNotEmpty;
}
