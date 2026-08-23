import 'dart:async';
import 'dart:html' as html;
import 'dart:typed_data';
import 'package:http/browser_client.dart';
import 'package:http/http.dart' as http;

class CsvPickResult {
  final String name;
  final String content;
  const CsvPickResult(this.name, this.content);
}

class RateCardHttpResponse {
  final int status;
  final String body;
  const RateCardHttpResponse(this.status, this.body);
}

Future<CsvPickResult?> pickCsvFile() async {
  final input = html.FileUploadInputElement()
    ..accept = '.csv,text/csv'
    ..multiple = false;
  input.style.display = 'none';
  html.document.body!.append(input);
  final completer = Completer<CsvPickResult?>();
  input.onChange.listen((_) {
    if (input.files == null || input.files!.isEmpty) {
      if (!completer.isCompleted) completer.complete(null);
      return;
    }
    final file = input.files!.first;
    final reader = html.FileReader();
    reader.onLoadEnd.listen((_) {
      if (!completer.isCompleted) completer.complete(CsvPickResult(file.name, reader.result as String));
    });
    reader.onError.listen((_) {
      if (!completer.isCompleted) completer.completeError(StateError('Could not read the selected CSV file'));
    });
    reader.readAsText(file);
  });
  input.click();
  try {
    return await completer.future;
  } finally {
    input.remove();
  }
}

Future<Uint8List> fetchCsvTemplate(String url) async {
  final client = BrowserClient()..withCredentials = true;
  try {
    final res = await client.get(Uri.parse(url));
    if (res.statusCode != 200) {
      throw StateError('Template download failed (${res.statusCode})');
    }
    return res.bodyBytes;
  } finally {
    client.close();
  }
}

void downloadBytes(Uint8List bytes, String filename, {String mime = 'text/csv'}) {
  final blob = html.Blob([bytes], mime);
  final url = html.Url.createObjectUrlFromBlob(blob);
  final anchor = html.AnchorElement(href: url)
    ..download = filename
    ..style.display = 'none';
  html.document.body!.append(anchor);
  anchor.click();
  anchor.remove();
  html.Url.revokeObjectUrl(url);
}

Future<RateCardHttpResponse> postMultipartCsv(String url, String filename, String content) async {
  final client = BrowserClient()..withCredentials = true;
  try {
    final request = http.MultipartRequest('POST', Uri.parse(url))
      ..fields['dry_run'] = 'false'
      ..files.add(http.MultipartFile.fromString('file', content, filename: filename));
    final streamed = await client.send(request);
    final body = await streamed.stream.bytesToString();
    return RateCardHttpResponse(streamed.statusCode, body);
  } finally {
    client.close();
  }
}
