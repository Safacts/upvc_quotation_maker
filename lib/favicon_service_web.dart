import 'dart:html' as html;

class FaviconService {
  static const String fallbackFavicon = 'favicon.png';

  static void setFromUrl(String url) {
    final cleanUrl = url.trim();
    if (cleanUrl.isEmpty) {
      _applyFavicon(fallbackFavicon);
      return;
    }

    // Test if the client logo loads successfully; fall back to Vitharn logo if unavailable
    final testImg = html.ImageElement();
    testImg.src = cleanUrl;
    testImg.onLoad.first.then((_) {
      _applyFavicon(cleanUrl);
    }).catchError((_) {
      _applyFavicon(fallbackFavicon);
    });
    testImg.onError.first.then((_) {
      _applyFavicon(fallbackFavicon);
    });
  }

  static void _applyFavicon(String href) {
    var link = html.document.querySelector('link[rel*="icon"]') as html.LinkElement?;
    if (link != null) {
      link.href = href;
    } else {
      link = html.LinkElement()
        ..rel = 'icon'
        ..type = 'image/png'
        ..href = href;
      html.document.head?.append(link);
    }
  }
}

