import 'dart:async';

import 'package:google_sign_in/google_sign_in.dart';

import 'google_signin.dart';

/// Kept for interface parity with the web implementation. Native platforms do
/// not render an embedded web (GSI) button.
const String googleSignInViewType = 'google-signin-button';

/// Native platforms render their own Google button (a styled OutlinedButton in
/// the login screen) instead of the embedded web GSI button.
bool get googleSignInUsesWebButton => false;

/// Web OAuth client ID for this Google Cloud project. Public identifier,
/// already hardcoded by the web GSI implementation in `google_signin_web.dart`.
///
/// google_sign_in v7 on Android REQUIRES a `serverClientId` when the app does
/// not ship `google-services.json` — the plugin does NOT auto-resolve the
/// client from the registered package + SHA-1 (those only identify the app to
/// CredentialManager). Per the `google_sign_in_android` README, the web client
/// ID is passed as the `serverClientId` in that case.
const String _serverClientId =
    '726482519803-od8lidratsv0du7jtaeopj29khmn6meb.apps.googleusercontent.com';

/// The single shared plugin instance (v7 makes this a singleton).
final GoogleSignIn _googleSignIn = GoogleSignIn.instance;

Future<void>? _initFuture;

/// Initializes the GoogleSignIn singleton exactly once.
///
/// google_sign_in v7 requires `initialize()` to be called and awaited once
/// before any other method on the instance. The cached future keeps this
/// idempotent; on failure it is cleared so a later call retries.
Future<void> ensureGoogleSignInReady() async {
  try {
    _initFuture ??= _googleSignIn.initialize(serverClientId: _serverClientId);
    await _initFuture;
  } catch (_) {
    _initFuture = null;
    rethrow;
  }
}

/// Native sign-in returns its result directly instead of through a stream; the
/// getter is kept so shared imports do not break.
Stream<GoogleSignInResult> get googleSignInResults =>
    const Stream<GoogleSignInResult>.empty();

/// Starts the interactive Google sign-in flow on native platforms.
///
/// Never throws — every failure is returned as a [GoogleSignInResult] carrying
/// an error message.
Future<GoogleSignInResult?> startGoogleSignIn() async {
  try {
    await ensureGoogleSignInReady();
    final account = await _googleSignIn.authenticate();
    final email = account.email.trim();
    if (email.isEmpty) {
      return const GoogleSignInResult(error: 'Google account has no email.');
    }
    return GoogleSignInResult(email: email);
  } on GoogleSignInException catch (e) {
    if (e.code == GoogleSignInExceptionCode.canceled ||
        e.code == GoogleSignInExceptionCode.interrupted) {
      return const GoogleSignInResult(error: 'Google sign-in was cancelled.');
    }
    return GoogleSignInResult(error: 'Google sign-in failed: $e');
  } catch (e) {
    return GoogleSignInResult(error: 'Google sign-in failed: $e');
  }
}
