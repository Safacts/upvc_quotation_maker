import 'dart:html' as html;
import 'dart:typed_data';
import 'package:share_plus/share_plus.dart';

class FileHelper {
  Future<String?> getDocsDir() async {
    return null;
  }

  Future<String?> getTempDir() async {
    return null;
  }

  Future<void> writeFile(String path, Uint8List bytes) async {
    await Share.shareXFiles([XFile.fromData(bytes, name: path.split('/').last)]);
  }

  Future<void> downloadPdf(Uint8List bytes, String filename) async {
    final blob = html.Blob([bytes], 'application/pdf');
    final url = html.Url.createObjectUrlFromBlob(blob);
    final anchor = html.AnchorElement(href: url)
      ..download = filename
      ..style.display = 'none';
    html.document.body!.append(anchor);
    anchor.click();
    anchor.remove();
    html.Url.revokeObjectUrl(url);
  }
}
