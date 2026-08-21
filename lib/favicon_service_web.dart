import 'dart:html' as html;

class FaviconService {
  static const String fallbackFavicon = 'favicon.png';

  static void setFromUrl(String url) {
    final cleanUrl = url.trim();
    if (cleanUrl.isEmpty) {
      _applyFavicon(fallbackFavicon);
      return;
    }

    // Apply the client logo immediately as the browser favicon
    _applyFavicon(cleanUrl);

    // Fallback to Vitharn favicon if the image fails to load
    final testImg = html.ImageElement();
    testImg.src = cleanUrl;
    testImg.onError.first.then((_) {
      _applyFavicon(fallbackFavicon);
    });
  }

  static void _applyFavicon(String href) {
    try {
      final links = html.document.querySelectorAll("link[rel*='icon']");
      if (links.isNotEmpty) {
        for (final el in links) {
          if (el is html.LinkElement) {
            el.href = href;
          }
        }
      } else {
        final link = html.LinkElement()
          ..rel = 'shortcut icon'
          ..type = 'image/png'
          ..href = href;
        html.document.head?.append(link);
      }
    } catch (_) {}
  }
}


