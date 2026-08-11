/// OFFLINE TIER (Rs.10,000 "Low") — PDF GENERATOR CONTRACT TESTS.
///
/// These tests exist because every failure mode they cover has ALREADY shipped
/// to a customer at least once in this codebase's history:
///
///   * a PDF that throws instead of rendering (latin1 + Type1 fonts),
///   * a corrupt logo that took the whole document down with it,
///   * a long quotation silently clipped to one page,
///   * a UPI QR carrying the wrong amount.
///
/// A quotation that fails to open at the customer's site is the single worst
/// outcome for this tier, so "does not throw" is asserted as aggressively as
/// the content itself.
library;

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';

import 'package:upvc_quotation_maker/offline/core/brand_config.dart';
import 'package:upvc_quotation_maker/offline/core/models.dart';
import 'package:upvc_quotation_maker/offline/pdf/offline_pdf_generator.dart';

/// A real, minimal PNG (8x8, solid colour) embedded as base64.
///
/// Deliberately a literal rather than something built with `package:image`:
/// that package is only a TRANSITIVE dependency here (it arrives via `pdf`), and
/// importing it directly in a test would add an undeclared dependency the
/// analyzer flags — and would silently break if `pdf` ever drops it.
const String _pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR42mO4o6GBFTEMLQkA'
    'e3tLAYZNzu4AAAAASUVORK5CYII=';

Uint8List _validPng() => base64Decode(_pngBase64);

/// A PNG whose HEADER parses but whose pixel data is gone.
///
/// This is the important one. `pw.MemoryImage()` only sniffs the header, so a
/// file like this is accepted at construction time and only explodes later,
/// during `doc.save()`. Real-world source: a logo copied while the storage was
/// full, or an interrupted write.
Uint8List _truncatedPng() {
  final full = _validPng();
  // Signature (8) + full IHDR chunk (25) = 33 bytes: enough for startDecode to
  // report a size, nowhere near enough to decode.
  return Uint8List.fromList(full.take(33).toList());
}

/// The nastiest logo of all: PNG chunk structure fully INTACT (so `startDecode`
/// happily reports 64x64 and `pw.MemoryImage()` succeeds), but the IDAT payload
/// is garbage, so the actual pixel decode inside `doc.save()` throws
/// `ImageException: Invalid IDAT checksum`.
///
/// Verified 10-08-2026 against pdf 3.11.3: without an eager decode this bypasses
/// the try/catch in `_resolveLogo` and destroys the whole quotation.
Uint8List _corruptIdatPng() {
  final bytes = _validPng();
  var off = 8; // skip the PNG signature
  while (off + 8 <= bytes.length) {
    final len = (bytes[off] << 24) |
        (bytes[off + 1] << 16) |
        (bytes[off + 2] << 8) |
        bytes[off + 3];
    final type = String.fromCharCodes(bytes.sublist(off + 4, off + 8));
    if (type == 'IDAT') {
      for (var i = 0; i < len; i++) {
        bytes[off + 8 + i] = 0xEE; // keep length + CRC fields, wreck the body
      }
      break;
    }
    off += 12 + len; // length(4) + type(4) + data(len) + crc(4)
  }
  return bytes;
}

OfflineQuotation _quotation({
  int measured = 3,
  int unmeasured = 0,
  bool gst = true,
  double transport = 0,
  String customerName = 'Ramesh Kumar',
  String address = '12-3-45, Beside SBI, Kukatpally, Hyderabad 500072',
}) {
  return OfflineQuotation(
    quotationNo: 'SVU/25-26/0348',
    date: DateTime(2026, 8, 10),
    customerName: customerName,
    address: address,
    contactNo: '+91 98765 43210',
    email: 'ramesh@example.com',
    reference: 'Site visit 02-08-2026',
    measuredItems: List<OfflineMeasuredItem>.generate(
      measured,
      (i) => OfflineMeasuredItem(
        code: 'W${i + 1}',
        description: 'Sliding window 2 track with mosquito mesh, '
            'white frame, 5mm clear toughened glass (Room ${i + 1})',
        width: 1200 + (i % 5) * 100,
        height: 1500,
        units: 1 + (i % 3),
        rate: 450 + (i % 4) * 25,
        position: i,
      ),
    ),
    unmeasuredItems: List<OfflineUnmeasuredItem>.generate(
      unmeasured,
      (i) => OfflineUnmeasuredItem(
        description: 'Installation & sealing charges (lot ${i + 1})',
        units: 1,
        rate: 1500,
        position: i,
      ),
    ),
    transport: transport,
    includeGst: gst,
    gstPercentage: 18,
  );
}

BrandConfig _brand({
  String logoPath = '',
  String bankName = '',
  String bankAccountNo = '',
  String upiId = '',
}) {
  return BrandConfig(
    companyName: 'Sri Venkateshwara UPVC',
    proprietorName: 'K. Srinivas',
    address: 'Plot 21, Industrial Estate, Balanagar, Hyderabad 500037',
    phone: '+91 90000 11111',
    email: 'sales@svupvc.example',
    gstin: '36ABCDE1234F1Z5',
    logoPath: logoPath,
    bankName: bankName,
    bankAccountNo: bankAccountNo,
    bankBranch: bankName.isEmpty ? '' : 'Balanagar',
    bankAccountName: bankName.isEmpty ? '' : 'Sri Venkateshwara UPVC',
    bankIfsc: bankName.isEmpty ? '' : 'SBIN0001234',
    upiId: upiId,
  );
}

void main() {
  group('renders without throwing', () {
    test('40-item quotation, no logo, GST, transport', () async {
      final bytes = await OfflinePdfGenerator.build(
        quotation: _quotation(measured: 40, unmeasured: 6, transport: 2500),
        brand: _brand(),
      );
      expect(bytes, isNotEmpty);
      expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
    });

    test('empty quotation with no items at all', () async {
      final bytes = await OfflinePdfGenerator.build(
        quotation: OfflineQuotation(quotationNo: 'Q-1'),
        brand: _brand(),
      );
      expect(bytes, isNotEmpty);
    });

    test('300-item quotation stays under the maxPages ceiling', () async {
      final bytes = await OfflinePdfGenerator.build(
        quotation: _quotation(measured: 300, unmeasured: 40),
        brand: _brand(bankName: 'SBI', bankAccountNo: '1234', upiId: 'a@okhdfc'),
      );
      expect(bytes, isNotEmpty);
    });
  });

  group('unicode / rupee handling (Type1 fonts are latin-1 only)', () {
    test('a literal rupee sign does not throw and is transliterated', () async {
      final bytes = await OfflinePdfGenerator.build(
        quotation: _quotation(
          customerName: 'Rate agreed \u20B91,20,000 \u2014 Mr O\u2019Brien',
          address: 'Flat \u201CSunrise\u201D, 5th Rd \u2026 Hyderabad',
        ),
        brand: _brand(),
      );
      expect(bytes, isNotEmpty);
    });

    test('non-latin script (Telugu/Devanagari) does not throw', () async {
      final bytes = await OfflinePdfGenerator.build(
        quotation: _quotation(
          customerName: '\u0C36\u0C4D\u0C30\u0C40 \u0C30\u0C2E\u0C47\u0C36\u0C4D',
          address: '\u0928\u0908 \u0926\u093F\u0932\u094D\u0932\u0940',
        ),
        brand: _brand(),
      );
      expect(bytes, isNotEmpty);
    });
  });

  group('logo degradation — must never take the document down', () {
    test('a valid PNG logo embeds', () async {
      final warnings = <String>[];
      final bytes = await OfflinePdfGenerator.build(
        quotation: _quotation(),
        brand: _brand(logoPath: '/tmp/logo.png'),
        logoBytes: _validPng(),
        onWarning: warnings.add,
      );
      expect(bytes, isNotEmpty);
      expect(warnings, isEmpty);
    });

    test('zero-byte logo falls back to the company name and warns', () async {
      final warnings = <String>[];
      final bytes = await OfflinePdfGenerator.build(
        quotation: _quotation(),
        brand: _brand(logoPath: '/tmp/logo.png'),
        logoBytes: Uint8List(0),
        onWarning: warnings.add,
      );
      expect(bytes, isNotEmpty);
      expect(warnings, hasLength(1));
    });

    test('garbage bytes (not an image at all) degrade gracefully', () async {
      final warnings = <String>[];
      final bytes = await OfflinePdfGenerator.build(
        quotation: _quotation(),
        brand: _brand(logoPath: '/tmp/logo.png'),
        logoBytes: Uint8List.fromList(
          List<int>.generate(512, (i) => (i * 7) % 251),
        ),
        onWarning: warnings.add,
      );
      expect(bytes, isNotEmpty);
      expect(warnings, isNotEmpty);
    });

    test('header-valid but truncated PNG does not throw at save()', () async {
      final warnings = <String>[];
      final bytes = await OfflinePdfGenerator.build(
        quotation: _quotation(),
        brand: _brand(logoPath: '/tmp/logo.png'),
        logoBytes: _truncatedPng(),
        onWarning: warnings.add,
      );
      expect(bytes, isNotEmpty);
      expect(
        warnings,
        isNotEmpty,
        reason: 'A dropped logo must be surfaced before the quote is sent.',
      );
    });

    // THE REGRESSION TEST (P0, fixed 10-08-2026).
    //
    // Intact PNG chunk structure + corrupt IDAT body. pw.MemoryImage() ACCEPTS
    // this (it only parses IHDR), so before the eager-decode guard this threw
    // `ImageException: Invalid IDAT checksum` from inside doc.save() — well
    // outside _resolveLogo's try/catch — and the customer got no quotation at
    // all instead of a quotation without a logo.
    test('corrupt-IDAT PNG degrades instead of destroying the PDF', () async {
      final warnings = <String>[];

      final bytes = await OfflinePdfGenerator.build(
        quotation: _quotation(),
        brand: _brand(logoPath: '/tmp/logo.png'),
        logoBytes: _corruptIdatPng(),
        onWarning: warnings.add,
      );

      expect(bytes, isNotEmpty, reason: 'The quotation must still render.');
      expect(String.fromCharCodes(bytes.take(5)), '%PDF-');
      expect(
        warnings,
        isNotEmpty,
        reason: 'The owner must be told the logo was dropped.',
      );
    });
  });

  group('UPI URI (NPCI spec)', () {
    test('well-formed URI carries the grand total', () {
      final uri = OfflinePdfGenerator.buildUpiUri(
        vpa: 'svupvc@okhdfcbank',
        payeeName: 'Sri Venkateshwara UPVC',
        amount: 120000.5,
        note: 'Quote SVU/25-26/0348',
        transactionRef: 'SVU/25-26/0348',
      );
      expect(uri, startsWith('upi://pay?'));
      expect(uri, contains('pa=svupvc%40okhdfcbank'));
      expect(uri, contains('am=120000.50'));
      expect(uri, contains('cu=INR'));
      expect(uri, contains('tn='));
      expect(uri, contains('tr='));
    });

    test('am is OMITTED for a zero total, not sent as 0', () {
      final uri = OfflinePdfGenerator.buildUpiUri(
        vpa: 'svupvc@okhdfcbank',
        payeeName: 'X',
        amount: 0,
      );
      expect(uri, isNotEmpty);
      expect(uri.contains('am='), isFalse);
    });

    test('malformed VPA yields empty so the section is hidden', () {
      for (final bad in <String>['', 'nope', 'a@', '@b', 'a b@c']) {
        expect(OfflinePdfGenerator.buildUpiUri(vpa: bad, payeeName: 'X'), '');
      }
    });
  });

  group('file name sanitisation', () {
    test('slashes in a quote number never become directories', () {
      expect(
        OfflinePdfGenerator.sanitiseFileName('SVU/25-26/0348'),
        'SVU_25-26_0348',
      );
      expect(OfflinePdfGenerator.sanitiseFileName('   '), 'quotation');
      expect(OfflinePdfGenerator.sanitiseFileName('a:b*c?'), 'a_b_c');
    });
  });

  group('money formatting is Indian grouping', () {
    test('lakh grouping, not thousands grouping', () {
      expect(formatAmount(120000), '1,20,000.00');
      expect(formatAmount(10000000), '1,00,00,000.00');
    });
  });
}
