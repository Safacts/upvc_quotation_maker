/// WhatsApp / OS-share plumbing for the Rs.10,000 "Low" OFFLINE tier.
///
/// ---------------------------------------------------------------------------
/// 🔴 READ THIS BEFORE CHANGING ANYTHING IN THIS FILE
/// ---------------------------------------------------------------------------
/// **Sharing the FILE and sending the MESSAGE are two SEPARATE operations.**
///
/// WhatsApp's Android share receiver takes the file stream from an `ACTION_SEND`
/// intent and **silently DISCARDS `EXTRA_TEXT`**. That means:
///
///     SharePlus.instance.share(ShareParams(files: [...], text: 'Total: ...'))
///
/// delivers the PDF to the customer with **NO MESSAGE AT ALL**. There is no
/// error, no warning, and the owner sees a normal "shared" confirmation — so the
/// failure is invisible on the sending side and total on the receiving side.
///
/// This is not theoretical. It shipped to production twice on the online tier
/// (fixed 06-08-2026 with a deep link, regressed back to `shareXFiles(text:)`,
/// re-fixed 09-08-2026 in `lib/quote_share.dart`) and real customers received
/// bare, contextless PDF files from real quotations.
///
/// Therefore:
///   * [WhatsAppShare.sharePdf]  -> the FILE, via the OS share sheet.
///   * [WhatsAppShare.openChat]  -> the TEXT, via a `whatsapp://send` /
///                                  `https://wa.me/` deep link.
///
/// **Never** assume one call does both. If you find yourself adding `text:` to a
/// [ShareParams] that also carries `files:`, you are re-introducing the bug.
///
/// ---------------------------------------------------------------------------
/// ZERO NETWORK
/// ---------------------------------------------------------------------------
/// This file makes no network calls. Launching a `whatsapp://` or `https://wa.me/`
/// URL is a **hand-off to another application** via the platform's URL launcher —
/// the OS (or WhatsApp) performs whatever I/O it wants; this app fetches nothing
/// and opens no socket. That distinction is what keeps the tier's contractual
/// zero-network promise intact while still shipping the killer feature.
///
/// Allowed imports here: dart:io, dart:async, flutter/foundation, share_plus,
/// url_launcher, and siblings under lib/offline/. Banned: supabase_flutter,
/// package:http, anything under lib/services/.
library;

import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/brand_config.dart';
import '../core/models.dart';

/// Raised when a share cannot even be attempted (missing/empty PDF).
///
/// Exists so the caller can show a sentence a fabricator understands instead of
/// letting a `PathNotFoundException` or a platform `ArgumentError` bubble into a
/// red error screen.
class WhatsAppShareException implements Exception {
  const WhatsAppShareException(this.message);

  final String message;

  @override
  String toString() => message;
}

class WhatsAppShare {
  const WhatsAppShare._();

  /// Deep-link scheme WhatsApp (and WhatsApp Business) register on mobile.
  static const String _nativeScheme = 'whatsapp';

  /// Universal fallback. Works on desktop, in a browser, and on any device where
  /// the native scheme is not resolvable.
  static const String _webHost = 'https://wa.me/';

  /// Injection seam for tests. Production leaves these alone.
  @visibleForTesting
  static Future<bool> Function(Uri url, {LaunchMode mode}) launcher =
      (Uri url, {LaunchMode mode = LaunchMode.platformDefault}) =>
          launchUrl(url, mode: mode);

  @visibleForTesting
  static Future<bool> Function(Uri url) canLaunch = canLaunchUrl;

  // ---------------------------------------------------------------------------
  // 1. FILE
  // ---------------------------------------------------------------------------

  /// Shares the PDF file itself via the OS share sheet.
  ///
  /// This sends **only the file**. See the file header: any `text:` passed
  /// alongside `files:` is dropped by WhatsApp. Send the message with
  /// [openChat] / [sendQuotationMessage] as a separate step.
  ///
  /// Throws [WhatsAppShareException] when [pdf] is missing or zero bytes — the
  /// platform channel would otherwise throw something unreadable, or (worse, on
  /// some OEM builds) open a share sheet that silently shares nothing.
  static Future<void> sharePdf({
    required File pdf,
    required OfflineQuotation quotation,
    required BrandConfig brand,
    String? subject,
  }) async {
    // Validate BEFORE handing anything to the platform channel.
    bool exists;
    try {
      exists = await pdf.exists();
    } on FileSystemException catch (e) {
      throw WhatsAppShareException(
        'Could not read the quotation PDF (${e.osError?.message ?? e.message}). '
        'Open the quotation and generate it again.',
      );
    }
    if (!exists) {
      throw const WhatsAppShareException(
        'The quotation PDF is no longer on this device. '
        'Open the quotation and generate it again, then share.',
      );
    }

    int length;
    try {
      length = await pdf.length();
    } on FileSystemException catch (e) {
      throw WhatsAppShareException(
        'Could not read the quotation PDF (${e.osError?.message ?? e.message}). '
        'Open the quotation and generate it again.',
      );
    }
    if (length <= 0) {
      throw const WhatsAppShareException(
        'The quotation PDF is empty (0 KB), so there is nothing to send. '
        'Open the quotation and generate it again.',
      );
    }

    final String line = subject?.trim().isNotEmpty == true
        ? subject!.trim()
        : defaultSubject(quotation: quotation, brand: brand);

    // share_plus 11: the `Share` class is @Deprecated('Use SharePlus instead').
    // `SharePlus.instance.share(ShareParams(...))` is the supported call.
    //
    // NOTE the deliberate absence of `text:`. Adding it here re-creates the
    // production bug documented at the top of this file.
    await SharePlus.instance.share(
      ShareParams(
        files: <XFile>[XFile(pdf.path, mimeType: 'application/pdf')],
        subject: line,
        // `title` is the chooser heading on Android; `subject` is EXTRA_SUBJECT
        // which mail clients use. Neither is a message body.
        title: line,
      ),
    );
  }

  /// Share-sheet heading / e-mail subject for a quotation. ASCII only.
  @visibleForTesting
  static String defaultSubject({
    required OfflineQuotation quotation,
    required BrandConfig brand,
  }) {
    final String company = _clean(brand.companyName);
    final String no = _clean(quotation.quotationNo);
    if (no.isEmpty) {
      return company.isEmpty ? 'Quotation' : 'Quotation from $company';
    }
    return company.isEmpty ? 'Quotation $no' : 'Quotation $no - $company';
  }

  // ---------------------------------------------------------------------------
  // 2. TEXT
  // ---------------------------------------------------------------------------

  /// Opens a WhatsApp chat with [phone] prefilled with [message].
  ///
  /// Returns `false` when WhatsApp could not be opened, so the caller can fall
  /// back to the plain share sheet. **Never throws** — a failed share must not
  /// take the app down in front of a customer.
  ///
  /// Behaviour when [phone] cannot be normalised (garbage, landline, empty):
  /// we deliberately open WhatsApp with the TEXT ONLY and no recipient, which
  /// lands the owner on WhatsApp's contact picker with the message already
  /// typed. Sending a malformed number instead produces WhatsApp's
  /// "phone number ... is not on WhatsApp" dead-end, which owners read as
  /// "the app is broken". A contact picker is never wrong, only one tap slower.
  static Future<bool> openChat({
    required String phone,
    required String message,
  }) async {
    final String? number = normaliseIndianPhone(phone);

    // Percent-encode. A raw '&' (e.g. "Sharma & Sons"), '#', '+' or newline in
    // the query string TRUNCATES the message at that character — the customer
    // gets half a sentence and no total.
    final String encodedText = Uri.encodeComponent(message);

    final List<Uri> candidates = <Uri>[
      // Native scheme first: opens the installed app directly and does not
      // bounce through a browser.
      Uri.parse(
        number == null
            ? '$_nativeScheme://send?text=$encodedText'
            : '$_nativeScheme://send?phone=$number&text=$encodedText',
      ),
      // Universal fallback. WhatsApp Business registers a different package
      // (com.whatsapp.w4b) than the com.whatsapp entry declared in
      // AndroidManifest's <queries>, so `canLaunchUrl` on the native scheme can
      // report false on a device where WhatsApp Business is the only client.
      // https://wa.me/ is an https URL and always resolvable.
      Uri.parse(
        number == null
            ? '$_webHost?text=$encodedText'
            : '$_webHost$number?text=$encodedText',
      ),
    ];

    for (final Uri uri in candidates) {
      if (await _tryLaunch(uri)) return true;
    }
    return false;
  }

  /// Convenience: builds the message from the quotation + brand and opens the
  /// chat. [phoneOverride] wins over `quotation.contactNo` when supplied.
  static Future<bool> sendQuotationMessage({
    required OfflineQuotation quotation,
    required BrandConfig brand,
    String? phoneOverride,
  }) {
    final String phone = (phoneOverride ?? quotation.contactNo).trim();
    return openChat(
      phone: phone,
      message: buildMessage(quotation: quotation, brand: brand),
    );
  }

  /// Attempts one URL. `canLaunchUrl` is treated as ADVISORY ONLY.
  ///
  /// On Android 11+ `canLaunchUrl` returns false for any scheme/package missing
  /// from the manifest `<queries>` block — including WhatsApp Business — even
  /// though `launchUrl` would succeed. So a false answer is not accepted as
  /// final: we still attempt the launch and let the real result decide.
  static Future<bool> _tryLaunch(Uri uri) async {
    try {
      // Advisory probe; failures here are meaningless and must not abort.
      try {
        await canLaunch(uri);
      } catch (_) {
        // Ignored on purpose — see doc comment.
      }
      return await launcher(uri, mode: LaunchMode.externalApplication);
    } catch (e) {
      // ActivityNotFoundException / PlatformException / MissingPluginException
      // on an unsupported host all land here. Falling through to the next
      // candidate (or returning false) is always better than throwing.
      debugPrint('WhatsAppShare: launch failed for ${uri.scheme} -> $e');
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // 3. HELPERS (visible for testing — these carry the sharp edges)
  // ---------------------------------------------------------------------------

  /// Normalises an Indian phone number to the bare `91XXXXXXXXXX` form that
  /// `wa.me` requires: **digits only, country code included, NO leading `+`**.
  ///
  /// Returns `null` for anything unusable, so the caller can fall back rather
  /// than firing a deep link that dead-ends on WhatsApp's
  /// "phone number is not on WhatsApp" screen.
  ///
  /// Accepted:
  ///   * 10 digits starting 6-9            -> prefixed with `91`
  ///   * 11 digits, leading trunk `0`      -> `0` dropped, then as above
  ///   * 12 digits already starting `91`   -> used as-is (subscriber must be 6-9)
  ///   * any of the above wrapped in `+`, `00`, spaces, dashes, dots, brackets
  ///
  /// Rejected (-> null): empty, non-numeric, too short, too long, and landlines
  /// whose subscriber digit is outside 6-9 (`040-2345 6789`).
  ///
  /// KNOWN LIMIT: an 11-digit landline whose STD code starts 7-9 (e.g. Bangalore
  /// `080-2345 6789`) is indistinguishable from a mobile after the trunk `0` is
  /// dropped, because India assigns both from the same digit space. It will be
  /// accepted and WhatsApp will report it as not registered. There is no local,
  /// offline way to do better than this.
  @visibleForTesting
  static String? normaliseIndianPhone(String raw) {
    // Strip every separator a human might type or paste from a contact card.
    var s = raw.replaceAll(RegExp(r'[\s\-().\u2013\u2014/]'), '');
    if (s.isEmpty) return null;

    // Leading '+' or the '00' international prefix.
    if (s.startsWith('+')) {
      s = s.substring(1);
    } else if (s.startsWith('00')) {
      s = s.substring(2);
    }

    // Anything non-numeric left over means we do not understand the input.
    // Guessing here is how a wrong customer gets a quotation.
    if (!RegExp(r'^\d+$').hasMatch(s)) return null;

    // Trunk prefix on a domestic number: 0 98765 43210.
    if (s.length == 11 && s.startsWith('0')) {
      s = s.substring(1);
    }

    if (s.length == 10) {
      return _isMobileStart(s) ? '91$s' : null;
    }

    if (s.length == 12 && s.startsWith('91')) {
      final String subscriber = s.substring(2);
      return _isMobileStart(subscriber) ? s : null;
    }

    // 13 digits starting 091 — some address books store it this way.
    if (s.length == 13 && s.startsWith('091')) {
      final String subscriber = s.substring(3);
      return _isMobileStart(subscriber) ? '91$subscriber' : null;
    }

    return null;
  }

  static bool _isMobileStart(String tenDigits) {
    if (tenDigits.length != 10) return false;
    final int c = tenDigits.codeUnitAt(0);
    // '6'..'9'
    return c >= 0x36 && c <= 0x39;
  }

  /// Builds the WhatsApp message body for a quotation.
  ///
  /// Plain text only — WhatsApp renders no markup, and `*bold*` in a
  /// percent-encoded URL is just noise if the receiver's client is old.
  ///
  /// 🔴 CURRENCY IS ASCII. [formatInr] emits the rupee sign U+20B9, which is
  /// stripped to `Rs.` here. Reasons: (a) the same string is reused for the PDF
  /// share subject, and the offline PDF is drawn with Helvetica, a LATIN-1 font
  /// whose encoder THROWS on U+20B9; (b) the glyph is missing on older Android
  /// keyboards/fonts and renders as a tofu box in the chat. Typographic
  /// characters (smart quotes, en/em dashes, ellipsis, NBSP) are transliterated
  /// for the same reason.
  ///
  /// User-supplied non-ASCII (a Telugu customer name, for example) is
  /// deliberately PRESERVED, not mangled to '?': [Uri.encodeComponent] encodes
  /// it as UTF-8 percent-escapes and WhatsApp decodes it correctly. Destroying a
  /// customer's actual name would be a worse bug than the one we are avoiding.
  @visibleForTesting
  static String buildMessage({
    required OfflineQuotation quotation,
    required BrandConfig brand,
  }) {
    final String company = _clean(brand.companyName);
    final String customer = _clean(quotation.customerName);
    final String quoteNo = _clean(quotation.quotationNo);
    final String total = _asciiMoney(formatInr(quotation.grandTotal));

    final StringBuffer b = StringBuffer();

    b.writeln(customer.isEmpty ? 'Hello,' : 'Hello $customer,');
    b.writeln();

    if (quoteNo.isEmpty) {
      b.writeln(company.isEmpty
          ? 'Your quotation is ready.'
          : 'Your quotation from $company is ready.');
    } else {
      b.writeln(company.isEmpty
          ? 'Your quotation $quoteNo is ready.'
          : 'Your quotation $quoteNo from $company is ready.');
    }

    b.writeln('Date: ${formatQuoteDate(quotation.date)}');
    b.writeln('Total: $total');
    b.writeln();

    // The PDF travels as a SEPARATE share action (see the file header), so the
    // wording says "sharing"/"attached in this chat" rather than promising an
    // attachment inside this very message.
    b.writeln('The detailed quotation PDF is attached in this chat.');
    b.writeln();
    b.writeln('Please review it and let us know if you would like any changes.');

    if (company.isNotEmpty) {
      b.writeln();
      b.writeln('Regards,');
      b.writeln(company);
      final String phone = _clean(brand.phone);
      if (phone.isNotEmpty) b.writeln(phone);
    }

    return b.toString().trimRight();
  }

  /// `\u20B9 1,20,360.00` -> `Rs. 1,20,360.00`. Never leaves the glyph behind.
  static String _asciiMoney(String formatted) {
    final String swapped =
        formatted.replaceAll('\u20B9', 'Rs. ').replaceAll('INR', 'Rs.');
    // Collapse the double space that appears when the source already had one
    // after the symbol.
    return swapped.replaceAll(RegExp(r'Rs\.\s+'), 'Rs. ').trim();
  }

  /// Trims and transliterates the typographic characters that break Latin-1
  /// encoders and older chat fonts. Leaves all other user text intact.
  static String _clean(String raw) {
    return raw
        .replaceAll('\u00A0', ' ') // non-breaking space
        .replaceAll('\u2018', "'")
        .replaceAll('\u2019', "'")
        .replaceAll('\u201C', '"')
        .replaceAll('\u201D', '"')
        .replaceAll('\u2013', '-')
        .replaceAll('\u2014', '-')
        .replaceAll('\u2026', '...')
        .replaceAll('\u20B9', 'Rs.')
        .trim();
  }
}
