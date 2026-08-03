import 'dart:html' as html;

class FaviconService {
  static void setFromUrl(String url) {
    if (url.isEmpty) return;
    var link = html.document.querySelector('link[rel*="icon"]') as html.LinkElement?;
    if (link != null) {
      link.href = url;
    } else {
      link = html.LinkElement()
        ..rel = 'icon'
        ..type = 'image/png'
        ..href = url;
      html.document.head!.append(link);
    }
  }
}
