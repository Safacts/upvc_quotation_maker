import 'dart:typed_data';

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
  throw UnsupportedError('CSV import is available in the web app');
}

Future<Uint8List> fetchCsvTemplate(String url) async {
  throw UnsupportedError('Template download is available in the web app');
}

void downloadBytes(Uint8List bytes, String filename, {String mime = 'text/csv'}) {
  throw UnsupportedError('File download is available in the web app');
}

Future<RateCardHttpResponse> postMultipartCsv(String url, String filename, String content, {bool dryRun = false}) async {
  throw UnsupportedError('CSV import is available in the web app');
}
