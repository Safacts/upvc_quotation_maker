import 'dart:typed_data';

import 'package:share_plus/share_plus.dart';

Future<void> downloadFileBytes(
  Uint8List bytes,
  String filename,
  String mimeType,
) async {
  await SharePlus.instance.share(ShareParams(
    files: [XFile.fromData(bytes, mimeType: mimeType, name: filename)],
  ));
}
