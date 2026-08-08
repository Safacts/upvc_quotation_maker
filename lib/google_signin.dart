export 'google_signin_native.dart'
    if (dart.library.js_interop) 'google_signin_web.dart';

class GoogleSignInResult {
  const GoogleSignInResult({this.email, this.error});
  final String? email;
  final String? error;
  bool get succeeded => email != null && email!.isNotEmpty;
}
