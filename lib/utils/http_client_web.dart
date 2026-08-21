import 'package:http/browser_client.dart';
import 'package:http/http.dart' as http;

/// Web: use BrowserClient with withCredentials=true so the HttpOnly
/// session cookie is sent even for cross-origin dev (localhost:3000)
/// and reliably for same-origin production. Without this, the
/// `session` cookie is omitted and save_client falls back to
/// `password hash required` (403) for Google-auth'd users.
Future<http.Response> postWithCredentials(
  Uri url, {
  Map<String, String>? headers,
  Object? body,
}) {
  final client = BrowserClient()..withCredentials = true;
  // Ensure we always close the short-lived client.
  return client
      .post(url, headers: headers, body: body)
      .whenComplete(client.close);
}
