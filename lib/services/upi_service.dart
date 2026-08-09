import 'package:flutter/material.dart';
import 'package:qr/qr.dart';

/// UPI deep-link + QR generation.
///
/// Pure Dart — no network, no plugin, no new heavyweight dependency. The `qr`
/// package was already in the lockfile as a transitive dependency of `printing`
/// (which pulls `pdf` -> `barcode` -> `qr`), so the QR module matrix costs us
/// zero extra bytes in the bundle.
///
/// The URI format is the NPCI "UPI Linking Specification" (v1.6). Every Indian
/// UPI app (GPay, PhonePe, Paytm, BHIM, bank apps) understands it, both as a
/// scanned QR and as a tapped `upi://` link:
///
///   upi://pay?pa=<vpa>&pn=<payee>&am=<amount>&cu=INR&tn=<note>&tr=<ref>
///
/// PARAMETER NOTES (learned the hard way — get these wrong and the app either
/// refuses the QR or silently drops the amount):
///   pa  REQUIRED. The payee VPA, e.g. `6304562779@nyes`.
///   pn  REQUIRED in practice. Payee name. Some apps show "Unknown" without it.
///   am  Amount. MUST be plain `123.45` — no currency symbol, no thousands
///       separators, exactly 2 decimals. `1,234.50` is rejected outright.
///   cu  Currency. Only `INR` is accepted by Indian PSPs.
///   tn  Transaction note. Keep it short and ASCII-safe; several apps truncate
///       at ~50 chars and a few choke on non-ASCII.
///   tr  Merchant transaction reference. We pass the quotation number so the
///       fabricator can reconcile the credit against the quote.
class UpiService {
  const UpiService._();

  /// Characters that are safe to leave unencoded inside a UPI parameter value.
  /// We deliberately strip rather than escape anything exotic in `pn`/`tn`,
  /// because a percent-encoded `%26` inside a note is handled inconsistently
  /// across PSP apps, whereas a missing hyphen is harmless.
  static String _sanitiseText(String input, {int maxLength = 50}) {
    final cleaned = input
        .replaceAll(RegExp(r'[^A-Za-z0-9 .\-_/]'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    if (cleaned.length <= maxLength) return cleaned;
    return cleaned.substring(0, maxLength).trim();
  }

  /// A VPA is `handle@psp`. We do not attempt full validation (PSP handles are
  /// unbounded and change constantly) — we only reject the obviously-broken
  /// shapes so the QR is never rendered for a value that cannot possibly work.
  static bool isValidVpa(String vpa) {
    final v = vpa.trim();
    if (v.isEmpty) return false;
    if (!v.contains('@')) return false;
    final parts = v.split('@');
    if (parts.length != 2) return false;
    if (parts[0].isEmpty || parts[1].isEmpty) return false;
    if (v.contains(' ')) return false;
    return true;
  }

  /// Builds the `upi://pay?...` URI.
  ///
  /// Returns an empty string when [vpa] is unusable, so every call site can do
  /// `if (uri.isEmpty) { hide the QR }` instead of catching an exception.
  static String buildUri({
    required String vpa,
    required String payeeName,
    double? amount,
    String note = '',
    String transactionRef = '',
  }) {
    if (!isValidVpa(vpa)) return '';

    final params = <String, String>{
      'pa': vpa.trim(),
      'pn': _sanitiseText(payeeName, maxLength: 40),
      'cu': 'INR',
    };

    // Omit `am` entirely for a zero/absent amount. An `am=0.00` QR is rejected
    // as invalid by PhonePe and shows "Enter amount" as an error on GPay,
    // whereas omitting it produces a perfectly good open-amount QR.
    if (amount != null && amount > 0) {
      params['am'] = amount.toStringAsFixed(2);
    }

    final cleanNote = _sanitiseText(note);
    if (cleanNote.isNotEmpty) params['tn'] = cleanNote;

    final cleanRef = _sanitiseText(transactionRef, maxLength: 35);
    if (cleanRef.isNotEmpty) params['tr'] = cleanRef;

    final query = params.entries
        .map((e) => '${e.key}=${Uri.encodeComponent(e.value)}')
        .join('&');

    return 'upi://pay?$query';
  }

  /// Encodes [data] into a QR module matrix.
  ///
  /// Error-correction level M (15%) is the UPI/BHIM recommendation: L is too
  /// fragile once the QR is printed on a PDF and photographed off a phone
  /// screen, H inflates the module count enough to hurt scan distance.
  static QrImage? encode(String data) {
    if (data.isEmpty) return null;
    try {
      final code = QrCode.fromData(
        data: data,
        errorCorrectLevel: QrErrorCorrectLevel.M,
      );
      return QrImage(code);
    } catch (_) {
      // InputTooLongException — only reachable if a caller passes an enormous
      // note. Degrade to "no QR" rather than crashing the invoice screen.
      return null;
    }
  }
}

/// Renders a [QrImage] module matrix onto a canvas.
///
/// Written as a CustomPainter rather than pulling in `qr_flutter` because
/// qr_flutter is a whole extra package for what is a 20-line paint loop, and
/// its latest release lags the Flutter SDK we build against.
class UpiQrPainter extends CustomPainter {
  UpiQrPainter({
    required this.qrImage,
    this.moduleColor = Colors.black,
    this.backgroundColor = Colors.white,
    this.quietZoneModules = 4,
  });

  final QrImage qrImage;
  final Color moduleColor;
  final Color backgroundColor;

  /// The mandatory white border around a QR. The spec requires 4 modules;
  /// scanners fail intermittently with less, especially against a dark card.
  final int quietZoneModules;

  @override
  void paint(Canvas canvas, Size size) {
    final count = qrImage.moduleCount;
    if (count <= 0) return;

    final totalModules = count + (quietZoneModules * 2);
    final side = size.shortestSide;
    final moduleSize = side / totalModules;

    final bgPaint = Paint()..color = backgroundColor;
    canvas.drawRect(Rect.fromLTWH(0, 0, side, side), bgPaint);

    final modulePaint = Paint()
      ..color = moduleColor
      ..style = PaintingStyle.fill
      // isAntiAlias off: anti-aliased module edges bleed grey into the quiet
      // gaps and measurably reduce scan reliability at small sizes.
      ..isAntiAlias = false;

    for (var row = 0; row < count; row++) {
      for (var col = 0; col < count; col++) {
        if (!qrImage.isDark(row, col)) continue;
        final left = (col + quietZoneModules) * moduleSize;
        final top = (row + quietZoneModules) * moduleSize;
        // +0.5 overdraw closes the sub-pixel hairlines that otherwise appear
        // between adjacent dark modules on fractional-DPR screens.
        canvas.drawRect(
          Rect.fromLTWH(left, top, moduleSize + 0.5, moduleSize + 0.5),
          modulePaint,
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant UpiQrPainter oldDelegate) {
    return oldDelegate.qrImage != qrImage ||
        oldDelegate.moduleColor != moduleColor ||
        oldDelegate.backgroundColor != backgroundColor ||
        oldDelegate.quietZoneModules != quietZoneModules;
  }
}

/// Drop-in scannable UPI QR for any screen.
///
/// Renders nothing (a zero-size box) when the VPA is missing or invalid, so a
/// client that has not configured UPI simply does not see the section.
class UpiQrView extends StatelessWidget {
  const UpiQrView({
    super.key,
    required this.upiUri,
    this.size = 180,
    this.moduleColor = Colors.black,
    this.backgroundColor = Colors.white,
  });

  final String upiUri;
  final double size;
  final Color moduleColor;
  final Color backgroundColor;

  @override
  Widget build(BuildContext context) {
    final image = UpiService.encode(upiUri);
    if (image == null) return const SizedBox.shrink();

    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: UpiQrPainter(
          qrImage: image,
          moduleColor: moduleColor,
          backgroundColor: backgroundColor,
        ),
      ),
    );
  }
}
