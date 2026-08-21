/// Web implementation of the browser-fragment helpers used by client_loader.
import 'dart:html' as html;

String? readSsoFragmentToken() {
  try {
    final fragment = html.window.location.hash; // e.g., "#sso_token=xyz"
    if (fragment.startsWith('#sso_token=')) {
      return fragment.substring('#sso_token='.length);
    }
  } catch (_) {}
  return null;
}

void clearUrlFragment() {
  try {
    // Remove fragment without triggering navigation
    html.window.history
        .replaceState(null, '', '${html.window.location.pathname}${html.window.location.search ?? ''}');
  } catch (_) {}
}
