import 'dart:async';
import 'dart:convert';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:ui_web' as ui_web;

import 'google_signin.dart';

const String googleSignInViewType = 'google-signin-button';

const String _googleClientId =
    '726482519803-od8lidratsv0du7jtaeopj29khmn6meb.apps.googleusercontent.com';

const Duration _gsiTimeout = Duration(seconds: 20);

final StreamController<GoogleSignInResult> _results =
    StreamController<GoogleSignInResult>.broadcast();

Future<void>? _gsiLoadFuture;
bool _viewRegistered = false;

Stream<GoogleSignInResult> get googleSignInResults => _results.stream;

/// Web renders the embedded Google Identity Services button (an
/// [HtmlElementView]) instead of the styled native button.
bool get googleSignInUsesWebButton => googleSignInEnabled;

/// The web flow completes through the GSI credential callback pushed onto
/// [googleSignInResults], so this interactive flow is never invoked — kept for
/// interface parity with the native implementation.
Future<GoogleSignInResult?> startGoogleSignIn() async => null;

bool get _gsiLoaded =>
    globalContext.has('google') &&
    (globalContext.getProperty('google'.toJS) as JSObject).has('accounts');

Future<void> ensureGoogleSignInReady() async {
  try {
    _gsiLoadFuture ??= _loadGsiScript();
    await _gsiLoadFuture;
    _registerView();
  } catch (_) {
    _gsiLoadFuture = null;
    rethrow;
  }
}

Future<void> _loadGsiScript() async {
  final doc = globalContext.getProperty('document'.toJS) as JSObject;
  final existing = doc.callMethod<JSObject?>(
    'querySelector'.toJS,
    'script[data-gsi]'.toJS,
  );
  if (existing == null) {
    final script = doc.callMethod<JSObject>(
      'createElement'.toJS,
      'script'.toJS,
    );
    script.setProperty(
      'src'.toJS,
      'https://accounts.google.com/gsi/client'.toJS,
    );
    script.setProperty('async'.toJS, true.toJS);
    script.setProperty('data-gsi'.toJS, '1'.toJS);
    final head = doc.getProperty('head'.toJS) as JSObject;
    head.callMethodVarArgs('appendChild'.toJS, [script]);
  }
  await _waitForGoogle();
}

Future<void> _waitForGoogle() async {
  final completer = Completer<void>();
  final deadline = DateTime.now().add(_gsiTimeout);
  Timer.periodic(const Duration(milliseconds: 100), (timer) {
    if (_gsiLoaded) {
      timer.cancel();
      if (!completer.isCompleted) completer.complete();
    } else if (DateTime.now().isAfter(deadline)) {
      timer.cancel();
      if (!completer.isCompleted) {
        completer.completeError(
          StateError('Google Identity Services failed to load.'),
        );
      }
    }
  });
  await completer.future;
}

void _registerView() {
  if (_viewRegistered) return;
  _viewRegistered = true;
  ui_web.platformViewRegistry.registerViewFactory(googleSignInViewType, (
    int viewId,
  ) {
    final doc = globalContext.getProperty('document'.toJS) as JSObject;
    final div = doc.callMethod<JSObject>('createElement'.toJS, 'div'.toJS);
    final style = div.getProperty('style'.toJS) as JSObject;
    style.setProperty('width'.toJS, '100%'.toJS);
    style.setProperty('height'.toJS, '100%'.toJS);
    style.setProperty('display'.toJS, 'flex'.toJS);
    style.setProperty('align-items'.toJS, 'center'.toJS);
    style.setProperty('justify-content'.toJS, 'center'.toJS);
    final google = globalContext.getProperty('google'.toJS) as JSObject;
    final accounts = google.getProperty('accounts'.toJS) as JSObject;
    final id = accounts.getProperty('id'.toJS) as JSObject;
    final config =
        <String, Object?>{
          'client_id': _googleClientId,
          'auto_select': false,
          'callback': _onCredentialResponse.toJS,
        }.jsify();
    id.callMethod<JSAny?>('initialize'.toJS, config);
    final options =
        <String, Object?>{
          'theme': 'outline',
          'size': 'large',
          'text': 'continue_with',
          'shape': 'pill',
          'width': 320,
        }.jsify();
    id.callMethodVarArgs<JSAny?>('renderButton'.toJS, [div, options]);
    return div;
  });
}

void _onCredentialResponse(JSAny response) {
  final res = response as JSObject;
  if (res.has('error')) {
    final error = res.getProperty<JSString>('error'.toJS).toDart;
    _results.add(
      GoogleSignInResult(
        error: error.isEmpty ? 'Google sign-in failed.' : error,
      ),
    );
    return;
  }
  if (!res.has('credential')) {
    _results.add(
      const GoogleSignInResult(error: 'Google did not return a credential.'),
    );
    return;
  }
  final credential = res.getProperty<JSString>('credential'.toJS).toDart;
  _results.add(_decodeCredential(credential));
}

GoogleSignInResult _decodeCredential(String credential) {
  final parts = credential.split('.');
  if (parts.length < 2) {
    return const GoogleSignInResult(
      error: 'Google returned a malformed credential.',
    );
  }
  Map<String, dynamic>? payload;
  try {
    final json = utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
    payload = jsonDecode(json) as Map<String, dynamic>;
  } catch (_) {
    return const GoogleSignInResult(
      error: 'Could not read the Google credential.',
    );
  }
  final email = (payload['email'] as String?)?.trim();
  if (email == null || email.isEmpty) {
    return const GoogleSignInResult(error: 'Google account has no email.');
  }
  if (payload['email_verified'] != true) {
    return const GoogleSignInResult(
      error: 'Google account email is not verified.',
    );
  }
  return GoogleSignInResult(email: email, credential: credential);
}
