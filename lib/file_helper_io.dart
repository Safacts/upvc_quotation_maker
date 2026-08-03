import 'dart:io';
import 'dart:typed_data';
import 'package:path_provider/path_provider.dart';

class FileHelper {
  Future<String?> getDocsDir() async {
    try {
      if (Platform.isAndroid) {
        final dir = await getDownloadsDirectory();
        return dir?.path ?? (await getExternalStorageDirectory())?.path;
      }
      return (await getApplicationDocumentsDirectory()).path;
    } catch (_) {
      return null;
    }
  }

  Future<String?> getTempDir() async {
    try {
      return (await getTemporaryDirectory()).path;
    } catch (_) {
      return null;
    }
  }

  Future<void> writeFile(String path, Uint8List bytes) async {
    await File(path).writeAsBytes(bytes);
  }

  Future<void> downloadPdf(Uint8List bytes, String filename) async {
    final dir = await getDocsDir();
    if (dir != null) {
      await File('$dir/$filename').writeAsBytes(bytes);
    }
  }
}
