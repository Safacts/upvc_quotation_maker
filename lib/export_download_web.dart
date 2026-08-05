import 'dart:convert';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:typed_data';

Future<void> downloadFileBytes(
  Uint8List bytes,
  String filename,
  String mimeType,
) async {
  final b64 = base64Encode(bytes);
  final doc = globalContext['document'] as JSObject;
  final body = doc.getProperty('body'.toJS) as JSObject;
  final anchor = doc.callMethod('createElement'.toJS, 'a'.toJS) as JSObject;
  final style = anchor.getProperty('style'.toJS) as JSObject;
  style.setProperty('display'.toJS, 'none'.toJS);
  anchor.setProperty('href'.toJS, 'data:$mimeType;base64,$b64'.toJS);
  anchor.setProperty('download'.toJS, filename.toJS);
  body.callMethodVarArgs('appendChild'.toJS, [anchor]);
  anchor.callMethodVarArgs('click'.toJS, const []);
  body.callMethodVarArgs('removeChild'.toJS, [anchor]);
}
