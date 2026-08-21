import 'package:http/http.dart' as http;

/// Fallback for non-web: plain POST without credential handling.
Future<http.Response> postWithCredentials(
  Uri url, {
  Map<String, String>? headers,
  Object? body,
}) {
  return http.post(url, headers: headers, body: body);
}
