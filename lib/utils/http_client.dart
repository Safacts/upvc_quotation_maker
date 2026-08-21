// Conditional export: web gets BrowserClient withCredentials=true,
// all other platforms get plain http.post.
// Both `dart.library.html` (JS) and `dart.library.js_interop` (WASM)
// are true on web, so cover both to avoid a missed match.
export 'http_client_stub.dart'
    if (dart.library.html) 'http_client_web.dart'
    if (dart.library.js_interop) 'http_client_web.dart';
