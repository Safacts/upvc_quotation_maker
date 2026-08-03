import 'dart:js_interop';
import 'dart:js_interop_unsafe';

@JS('umami')
external JSObject? get _umami;

void umamiTrack(String event) {
  try {
    _umami?.callMethod('track'.toJS, event.toJS);
  } catch (_) {}
}
