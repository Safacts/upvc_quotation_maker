import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import 'config/client_config.dart';
import 'models.dart';

/// Shared "send this quotation to the customer" plumbing.
///
/// WHY THIS FILE EXISTS
/// --------------------
/// `pdf_confirmation_screen.dart` and `quotation_screen.dart` each had their own
/// private copy of `_fetchQuoteToken()` / `_quoteLink()`. Both copies had the
/// SAME defect, and fixing one silently left the other broken. Everything that
/// mints a customer-facing quote link now lives here, once.
///
/// THE BUG THIS FIXES (root cause, verified 09-08-2026)
/// ---------------------------------------------------
/// The old helper did:
///
/// ```dart
/// final res = await http.get(Uri.parse('$origin/api/quotation/$id/token'));
/// if (res.statusCode == 200) { ...return token... }
/// return '';                       // <-- every failure funnels here
/// ```
///
/// `GET /api/quotation/[id]/token` is gated by `getSession()`, which reads the
/// **HttpOnly `session` cookie** set by `/api/portal_auth`. On Flutter WEB the
/// browser attaches that cookie to the same-origin XHR automatically, so web
/// worked. On ANDROID the app authenticates against SharedPreferences
/// (`session_active`) and `package:http` keeps no cookie jar — so the request
/// went out anonymous and the route answered `401 {"error":"Unauthorized"}`.
/// Confirmed against production:
///
///   curl https://app.vitharn.com/api/quotation/<id>/token
///   -> 401 {"error":"Unauthorized"}
///
/// The helper swallowed that 401 and returned `''`, so the caller happily built
/// `https://app.vitharn.com/quote/<id>?token=` — an EMPTY token. The public
/// route verifies with `if (!token || !verifyToken(id, token))` and answers
/// `403 {"error":"Invalid or missing token"}`. Net effect: the owner thought a
/// quote was sent, and the customer got "Access Denied".
///
/// THE FIX
/// -------
/// 1. `fetchToken()` authenticates the way the Flutter app actually can —
///    it POSTs the tenant credentials it already holds (the exact pattern
///    `app_state.dart` uses for `/api/save_client`), and only falls back to the
///    cookie-based GET (which is the web path that already worked).
/// 2. **A failure now returns `null`, never `''`.** A missing token propagates
///    as "no link" instead of silently minting a poisoned URL. Callers must
///    handle `null` — that is deliberate, and it is what makes the broken-link
///    class of bug unrepresentable rather than merely unlikely.
///
/// WHY THE TOKEN IS NOT GENERATED CLIENT-SIDE
/// ------------------------------------------
/// The token is `HMAC-SHA256(QUOTE_TOKEN_SECRET, quotationId)[0..16]`. Minting
/// it in Dart would require shipping `QUOTE_TOKEN_SECRET` inside the APK and
/// inside `main.dart.js` — where it is plain text to anyone who unzips or views
/// source. That secret is the ONLY thing standing between the public internet
/// and every customer's quotation, so anyone who extracted it could forge a
/// link for any quotation id and read any tenant's data. It must stay
/// server-side; this class asks the server for a token instead.
class QuoteShare {
  QuoteShare._();

  /// Where the Next.js backend lives. On web we stay same-origin so the browser
  /// keeps attaching the session cookie (and so localhost dev works); on mobile
  /// there is no origin, so we target production explicitly.
  ///
  /// On Flutter web dev (127.0.0.1:8080) there is no /api — Next lives at :3000
  /// (gateway) / :3100. Detect that and use the gateway so token mint works
  /// locally; otherwise same-origin.
  static String origin() {
    if (!kIsWeb) return 'https://app.vitharn.com';
    final o = Uri.base.origin;
    // Flutter web dev server has no API — route to Next via gateway.
    if (o.contains('127.0.0.1:8080') || o.contains('localhost:8080')) {
      return 'http://localhost:3000';
    }
    return o;
  }

  /// Best available proof-of-tenancy this app holds.
  ///
  /// Mirrors `AppState._pushSettingsToServer`: prefer the hash handed back by
  /// `/api/portal_auth` at login, fall back to the one baked into the client
  /// config (the native/APK login path verifies against exactly that value).
  static Future<String> passwordHash(ClientConfig cfg) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final stored = prefs.getString('session_password_hash') ?? '';
      if (stored.isNotEmpty) return stored;
    } catch (_) {
      // SharedPreferences unavailable — fall through to the config hash.
    }
    return cfg.portalPasswordHash;
  }

  /// Returns a valid share token for [quotationId], or `null` when one could
  /// not be obtained.
  ///
  /// Returning `null` (rather than `''`) is the whole point: an empty string is
  /// a *valid-looking* token that produces a 403 for the customer, whereas
  /// `null` forces the caller to decide what to do about it.
  static Future<String?> fetchToken(
    String quotationId, {
    required ClientConfig config,
  }) async {
    final base = origin();

    // Path 1 — credentialed POST. This is the path that works on Android,
    // because it carries the tenant credentials in the body rather than
    // relying on a cookie jar the Flutter http client does not have.
    try {
      final res = await http.post(
        Uri.parse('$base/api/quotation/$quotationId/token'),
        headers: const {'Content-Type': 'application/json'},
        body: jsonEncode({
          'client_id': config.clientId,
          'admin_email': config.companyEmail,
          'admin_password_hash': await passwordHash(config),
        }),
      );
      final token = _readToken(res);
      if (token != null) return token;
    } catch (_) {
      // Network/route missing — fall through to the cookie path.
    }

    // Path 2 — legacy cookie-authenticated GET. Still the happy path on Flutter
    // web, where the browser attaches the HttpOnly session cookie for us.
    try {
      final res = await http.get(Uri.parse('$base/api/quotation/$quotationId/token'));
      final token = _readToken(res);
      if (token != null) return token;
    } catch (_) {
      // Swallowed on purpose: the caller handles null.
    }

    return null;
  }

  /// Extracts a NON-EMPTY token from a response, or `null`.
  ///
  /// The emptiness check is load-bearing. A 200 carrying `{"token":""}` is
  /// exactly as useless as a 401, and treating it as success is what shipped
  /// the broken links in the first place.
  static String? _readToken(http.Response res) {
    if (res.statusCode != 200) return null;
    try {
      final body = jsonDecode(res.body);
      if (body is! Map) return null;
      final token = (body['token'] as String?)?.trim();
      if (token == null || token.isEmpty) return null;
      return token;
    } catch (_) {
      return null;
    }
  }

  /// The customer-facing quotation page: full quote, PDF download, and the
  /// approve / reject / request-changes buttons.
  ///
  /// `null` means "we could not mint a working link" — callers must NOT
  /// substitute a tokenless URL, which is precisely the 403 this fix removes.
  static Future<String?> quoteLink(
    QuotationData data, {
    required ClientConfig config,
  }) async {
    final id = data.id;
    if (id == null || id.isEmpty) return null;
    final token = await fetchToken(id, config: config);
    if (token == null) return null;
    return '${origin()}/quote/$id?token=$token';
  }

  /// Public review page for the tenant, pre-filled with this quotation.
  ///
  /// The client id is slugified exactly like ClientLoader._slugify so ids with
  /// spaces/casing ("VAISHNAVI UPVC WINDOWS AND DOORS") produce a clean,
  /// mail-safe path instead of a raw-space URL that email clients break.
  static String reviewUrl(
    QuotationData data, {
    required ClientConfig config,
  }) {
    final slug = config.clientId
        .trim()
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
        .replaceAll(RegExp(r'^-+|-+$'), '');
    return '${origin()}/$slug/review'
        '?q=${Uri.encodeComponent(data.quotationNo)}';
  }

  /// Builds the message the customer receives.
  ///
  /// Deliberately plain text: WhatsApp renders no markup, and a bare URL on its
  /// own line is what makes WhatsApp generate a tappable link preview. When
  /// [quoteLink] is null we omit the link line entirely rather than ship a
  /// dead one — the PDF still goes out through the share-sheet fallback.
  static String buildMessage({
    required QuotationData data,
    required String companyName,
    required String? quoteLink,
    required String reviewUrl,
  }) {
    final b = StringBuffer()
      ..writeln('Hello ${data.customerName},')
      ..writeln()
      ..writeln('Your quotation ${data.quotationNo} from $companyName is ready.')
      ..writeln('Total: Rs. ${data.grandTotal.toStringAsFixed(2)}');

    if (quoteLink != null) {
      b
        ..writeln()
        ..writeln('View the full quotation, download the PDF and confirm here:')
        ..writeln(quoteLink);
    } else {
      b
        ..writeln()
        ..writeln('Note: secure quotation link could not be created — please share the PDF directly.');
    }

    b
      ..writeln()
      ..writeln('We value your feedback — rate your experience here:')
      ..writeln(reviewUrl);

    return b.toString().trimRight();
  }

  /// Normalises an Indian mobile number to the digits-only, country-coded form
  /// `wa.me` requires (`919876543210`). Returns `''` when the input does not
  /// look like a number we can dial, in which case WhatsApp opens on the
  /// contact picker instead of a specific chat — still useful, never wrong.
  static String normalisePhone(String raw) {
    var digits = raw.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return '';
    // Strip the international-access and trunk prefixes people paste in.
    if (digits.startsWith('00')) digits = digits.substring(2);
    if (digits.length == 11 && digits.startsWith('0')) {
      digits = digits.substring(1);
    }
    if (digits.length == 10) digits = '91$digits';
    // 12 digits = 91 + 10-digit mobile. Anything else we cannot vouch for.
    if (digits.length != 12) return '';
    return digits;
  }

  /// Opens WhatsApp with [text] pre-filled, targeting [phone] when we can.
  ///
  /// WHY A DEEP LINK AND NOT `Share.shareXFiles`
  /// -------------------------------------------
  /// WhatsApp's Android share-sheet receiver ignores the `EXTRA_TEXT` that
  /// accompanies a file stream — it takes the attachment and silently drops the
  /// caption. That is why the previous implementation "sent the link" and the
  /// customer never saw one. A deep link carries the text reliably, and the
  /// link inside that text leads to a page that offers the PDF download, so the
  /// customer still gets the document.
  ///
  /// Returns true when WhatsApp (or the browser's wa.me handler) was launched.
  static Future<bool> openWhatsApp({
    required String text,
    String phone = '',
  }) async {
    final encoded = Uri.encodeComponent(text);
    final to = normalisePhone(phone);

    // Native scheme first on mobile: it jumps straight into the app and, unlike
    // wa.me, never round-trips through a browser tab.
    final candidates = <Uri>[
      if (!kIsWeb)
        Uri.parse(to.isEmpty
            ? 'whatsapp://send?text=$encoded'
            : 'whatsapp://send?phone=$to&text=$encoded'),
      Uri.parse(to.isEmpty
          ? 'https://wa.me/?text=$encoded'
          : 'https://wa.me/$to?text=$encoded'),
    ];

    for (final uri in candidates) {
      try {
        if (await canLaunchUrl(uri)) {
          if (await launchUrl(uri, mode: LaunchMode.externalApplication)) {
            return true;
          }
        }
      } catch (_) {
        // Try the next candidate.
      }
    }
    return false;
  }

  /// Last-resort delivery: hand the message (and the PDF when we have a file)
  /// to the OS share sheet. Used when WhatsApp is not installed.
  static Future<void> shareViaSheet({
    required String text,
    String? filePath,
  }) async {
    if (filePath != null) {
      await Share.shareXFiles([XFile(filePath)], text: text);
    } else {
      await Share.share(text);
    }
  }
}
