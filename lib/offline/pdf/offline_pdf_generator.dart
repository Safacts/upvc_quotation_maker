/// OFFLINE TIER (Rs.10,000 "Low") — FULLY OFFLINE QUOTATION PDF.
///
/// ZERO-NETWORK CONTRACT
/// ---------------------
/// This file may not import `supabase_flutter`, `package:http/http.dart`,
/// `../../supabase_config.dart`, or anything from `lib/services/`. It must also
/// never fetch a FONT or an IMAGE at runtime. `lib/pdf_generator.dart` (the
/// online document this one mirrors visually) does BOTH — it calls
/// `PdfGoogleFonts.robotoRegular()` and `networkImage(...)`. Copying either
/// would produce a generator that renders on the developer's Wi-Fi and hangs on
/// a fabricator's phone in a half-built site with no signal. That is the exact
/// failure this tier is sold to avoid, so everything here is local.
///
/// WHY HELVETICA, AND WHY THERE IS NO RUPEE SIGN ANYWHERE IN THIS FILE
/// -------------------------------------------------------------------
/// `assets/` contains exactly one file (`logo.png`) — there is no bundled TTF,
/// and we are not allowed to add a dependency or an asset. So the only fonts
/// available with zero network are the PDF standard Type1 faces:
/// [pw.Font.helvetica] / [pw.Font.helveticaBold] / [pw.Font.helveticaOblique].
///
/// Type1 fonts are LATIN-1 ONLY (`PdfType1Font.isRuneSupported` accepts
/// 0x00..0xFF and `PdfFont.putText` runs the string through `latin1.encode`).
/// Two consequences, both load-bearing:
///
///   1. The rupee sign U+20B9 is NOT in latin1. Printing it does not "look a
///      bit wrong" — `latin1.encode` THROWS and the whole PDF fails to build.
///      Every money value here is therefore a plain grouped number produced by
///      [formatAmount] (`1,20,000.00`), and the currency is communicated with
///      the ASCII text `Rs.` or an `Amount (INR)` column header.
///      DO NOT "fix" this by adding `\u20B9` — you will ship a crash.
///   2. Any user-typed character above U+00FF (a smart quote pasted from
///      WhatsApp, a Devanagari address, an em dash) would throw the same way.
///      Every string that reaches the document goes through [_latin1Safe].
library;

import 'dart:io';
import 'dart:math' as math;

import 'package:barcode/barcode.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../core/brand_config.dart';
import '../core/models.dart';

/// Builds the offline quotation PDF. Pure function of its inputs — no I/O other
/// than the optional temp-file write in [saveToTemp].
class OfflinePdfGenerator {
  const OfflinePdfGenerator._();

  /// Renders [quotation] using [brand] and returns the PDF bytes.
  ///
  /// [logoBytes] is whatever `BrandService.instance.loadLogoBytes()` returned
  /// (it is cached there, never throws, and is null when there is no logo). We
  /// take it as a parameter rather than calling the service so this function
  /// stays synchronous-in-spirit, testable, and free of a singleton dependency.
  ///
  /// [onWarning] is invoked (possibly more than once) with a human-readable
  /// message when part of the document had to degrade — today that means the
  /// logo. See [_resolveLogo] for why silence is not an option.
  static Future<Uint8List> build({
    required OfflineQuotation quotation,
    required BrandConfig brand,
    Uint8List? logoBytes,
    void Function(String warning)? onWarning,
  }) async {
    // --- Fonts -------------------------------------------------------------
    // Built-in Type1 faces: no asset, no network, no decode cost.
    final base = pw.Font.helvetica();
    final bold = pw.Font.helveticaBold();
    final italic = pw.Font.helveticaOblique();

    // --- Brand colours -----------------------------------------------------
    // Force the alpha byte on. A stored colour of 0x00636361 (bare RGB with no
    // alpha) is FULLY TRANSPARENT — that exact bug shipped an invisible theme
    // once already (config loader, 09-08-2026). An invisible table header on a
    // customer-facing quotation is worse: it looks like a printing fault.
    final primary = PdfColor.fromInt(0xFF000000 | brand.primaryColorValue);
    final onPrimary = _readableOn(primary);
    final tint = _tint(primary, 0.90); // very light wash for zebra/detail fills
    final softTint = _tint(primary, 0.80);

    // --- Text styles -------------------------------------------------------
    // Hoisted ONCE. Building a pw.TextStyle inside the row loop allocates a new
    // style object (and a new font resolution) per cell; on a 40-line quotation
    // that is 400+ throwaway objects for zero benefit. Keeps a 20-line quote
    // comfortably inside the 200 ms budget.
    final cellStyle = pw.TextStyle(font: base, fontSize: 8);
    final cellBoldStyle = pw.TextStyle(font: bold, fontSize: 8);
    final headerStyle =
        pw.TextStyle(font: bold, fontSize: 8, color: onPrimary);
    final labelStyle = pw.TextStyle(font: bold, fontSize: 9);
    final valueStyle = pw.TextStyle(font: base, fontSize: 9);
    final smallStyle =
        pw.TextStyle(font: base, fontSize: 7.5, color: PdfColors.grey700);
    final sectionStyle = pw.TextStyle(font: bold, fontSize: 10, color: onPrimary);
    final totalStyle = pw.TextStyle(font: bold, fontSize: 11, color: primary);
    final italicStyle = pw.TextStyle(font: italic, fontSize: 8);

    final companyName = _latin1Safe(
      brand.companyName.trim().isEmpty ? 'Quotation' : brand.companyName.trim(),
    );

    // --- Logo (decoded exactly once) ---------------------------------------
    final logo = _resolveLogo(logoBytes, brand, onWarning);

    final doc = pw.Document(
      title: 'Quotation ${_latin1Safe(quotation.quotationNo)}',
      author: companyName,
    );

    final pageTheme = pw.PageTheme(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.fromLTRB(28, 28, 28, 24),
      theme: pw.ThemeData.withFont(base: base, bold: bold, italic: italic),
    );

    doc.addPage(
      // MultiPage, never Page: a 40-line quotation is the NORMAL case for a
      // whole-house uPVC job. A single Page silently clips the overflow, so the
      // customer receives a quotation that is missing windows and a total that
      // does not match the visible rows.
      pw.MultiPage(
        pageTheme: pageTheme,
        // Default is 20; a very long itemised quote with photos of terms can
        // legitimately exceed that and would throw TooManyPagesException.
        maxPages: 200,
        header: (ctx) => ctx.pageNumber == 1
            ? pw.SizedBox.shrink()
            : _continuationHeader(
                companyName: companyName,
                quoteNo: _latin1Safe(quotation.quotationNo),
                primary: primary,
                style: smallStyle,
              ),
        footer: (ctx) => _footer(
          context: ctx,
          companyName: companyName,
          style: smallStyle,
          primary: primary,
        ),
        build: (ctx) => <pw.Widget>[
          _header(
            brand: brand,
            quotation: quotation,
            logo: logo,
            companyName: companyName,
            primary: primary,
            bold: bold,
            base: base,
            valueStyle: valueStyle,
            smallStyle: smallStyle,
          ),
          pw.SizedBox(height: 10),
          _billTo(
            quotation: quotation,
            fill: tint,
            border: softTint,
            labelStyle: labelStyle,
            valueStyle: valueStyle,
          ),
          if (quotation.measuredItems.isNotEmpty) ...[
            pw.SizedBox(height: 12),
            _sectionTitle('Measured Items', primary, sectionStyle),
            pw.SizedBox(height: 4),
            _measuredTable(
              items: quotation.measuredItems,
              primary: primary,
              tint: tint,
              headerStyle: headerStyle,
              cellStyle: cellStyle,
              cellBoldStyle: cellBoldStyle,
            ),
          ],
          if (quotation.unmeasuredItems.isNotEmpty) ...[
            pw.SizedBox(height: 12),
            _sectionTitle('Other Items', primary, sectionStyle),
            pw.SizedBox(height: 4),
            _unmeasuredTable(
              items: quotation.unmeasuredItems,
              primary: primary,
              tint: tint,
              headerStyle: headerStyle,
              cellStyle: cellStyle,
              cellBoldStyle: cellBoldStyle,
            ),
          ],
          pw.SizedBox(height: 10),
          _totals(
            quotation: quotation,
            primary: primary,
            fill: tint,
            labelStyle: labelStyle,
            valueStyle: valueStyle,
            totalStyle: totalStyle,
          ),
          pw.SizedBox(height: 8),
          _amountInWords(quotation, softTint, labelStyle, cellBoldStyle),
          if (brand.hasBankDetails || brand.hasUpi) ...[
            pw.SizedBox(height: 12),
            _paymentBlock(
              brand: brand,
              quotation: quotation,
              primary: primary,
              border: softTint,
              labelStyle: labelStyle,
              valueStyle: valueStyle,
              smallStyle: smallStyle,
              sectionStyle: sectionStyle,
              onWarning: onWarning,
            ),
          ],
          if (brand.termsAndConditions.isNotEmpty) ...[
            pw.SizedBox(height: 12),
            _sectionTitle('Terms & Conditions', primary, sectionStyle),
            pw.SizedBox(height: 4),
            _terms(brand.termsAndConditions, cellStyle),
          ],
          pw.SizedBox(height: 24),
          _signatures(companyName, labelStyle, italicStyle),
        ],
      ),
    );

    return doc.save();
  }

  /// Writes [bytes] to `<temp>/<sanitised quote no>.pdf` and returns the file.
  ///
  /// The share sheet needs a real path on disk. Temp (not documents) because
  /// this copy is disposable — the quotation itself lives in SQLite and can be
  /// re-rendered at any time, so letting the OS reclaim it is correct.
  static Future<File> saveToTemp(Uint8List bytes, String quoteNo) async {
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}${Platform.pathSeparator}'
        '${sanitiseFileName(quoteNo)}.pdf');
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  /// Quote numbers are user-defined (`SVU/2026-27/0348`) and routinely contain
  /// `/`, which would be read as a directory separator and throw.
  @visibleForTesting
  static String sanitiseFileName(String quoteNo) {
    final cleaned = quoteNo
        .trim()
        .replaceAll(RegExp(r'[^A-Za-z0-9._-]+'), '_')
        .replaceAll(RegExp(r'_+'), '_')
        .replaceAll(RegExp(r'^_|_$'), '');
    return cleaned.isEmpty ? 'quotation' : cleaned;
  }

  // =========================================================================
  // Logo
  // =========================================================================

  /// Decodes the logo ONCE into a reusable [pw.MemoryImage].
  ///
  /// Two production lessons are encoded here:
  ///
  ///  * EMBED ONCE. The web version called `embedPng` twice on the same bytes
  ///    (header + watermark), which writes the image object into the PDF twice
  ///    and doubles the file size. A single [pw.MemoryImage] is resolved and
  ///    cached by the `pdf` package per document, so reusing this one instance
  ///    embeds one image object no matter how many times it is drawn.
  ///  * [pw.MemoryImage] sniffs the real format itself (via `findDecoderForData`),
  ///    so it handles PNG and JPEG alike. That is exactly why we use it instead
  ///    of a format-specific `embedPng`: a `.png` file that was actually JPEG
  ///    silently broke one client's logo for MONTHS. If you ever drop down to
  ///    the `PdfImage`-level API you MUST branch on `BrandService.isPng` /
  ///    `BrandService.isJpeg` first — never trust the extension.
  ///  * NEVER SWALLOW A FAILURE. That same client shipped logo-less quotations
  ///    for months because the exception was caught and ignored. Failures fall
  ///    back to the company name AND are reported through [onWarning] so the UI
  ///    can show it before the quote is sent to a customer.
  ///  * VALIDATE EAGERLY — see [_isDecodable]. `pw.MemoryImage()` is NOT a
  ///    decode; wrapping it in try/catch alone is not enough.
  static pw.MemoryImage? _resolveLogo(
    Uint8List? bytes,
    BrandConfig brand,
    void Function(String)? onWarning,
  ) {
    if (bytes == null || bytes.isEmpty) {
      // Configured but unreadable (file deleted / storage cleared) is a real
      // problem worth surfacing. Never configured is simply a design choice.
      if (brand.hasLogo) {
        onWarning?.call(
          'Your logo could not be read from storage, so the company name was '
          'printed instead. Re-upload it in Settings > Branding.',
        );
      }
      return null;
    }
    try {
      final image = pw.MemoryImage(bytes);
      // The constructor above has only read the file HEADER. Force the real
      // decode now, while we can still fall back.
      if (!_isDecodable(bytes)) {
        throw const FormatException('image body failed to decode');
      }
      return image;
    } catch (e) {
      debugPrint('OfflinePdfGenerator: logo decode failed: $e');
      onWarning?.call(
        'Your logo could not be added to this PDF (unsupported or damaged '
        'image), so the company name was printed instead.',
      );
      return null;
    }
  }

  /// Proves the logo can survive `doc.save()` BEFORE it is attached to the real
  /// document.
  ///
  /// ####################################################################
  /// # `pw.MemoryImage(bytes)` DOES NOT DECODE THE IMAGE.               #
  /// # It calls `findDecoderForData` + `startDecode`, which read only    #
  /// # the PNG IHDR / JPEG SOF header to learn the dimensions. The pixel #
  /// # data is decoded LAZILY, inside `doc.save()`, via                  #
  /// # `PdfImage.file` -> `im.decodeImage`.                              #
  /// #                                                                   #
  /// # So a logo with a valid header and a corrupt body (interrupted     #
  /// # copy, storage full, truncated download) sails past the try/catch  #
  /// # in [_resolveLogo] and throws `ImageException: Invalid IDAT        #
  /// # checksum` from `save()` — far away from any fallback, taking the  #
  /// # ENTIRE QUOTATION down at the customer's site. Reproduced against  #
  /// # pdf 3.11.3 on 10-08-2026; there is a regression test for it in    #
  /// # test/offline_pdf_test.dart.                                       #
  /// #                                                                   #
  /// # DO NOT delete this call to "save a decode". The duplicate decode  #
  /// # of one small logo is the price of never shipping a PDF that will  #
  /// # not open.                                                         #
  /// ####################################################################
  ///
  /// The decode is aimed at a THROWAWAY document so that a failure part-way
  /// through cannot leave a half-registered image object inside the real one.
  static bool _isDecodable(Uint8List bytes) {
    try {
      PdfImage.file(pw.Document().document, bytes: bytes);
      return true;
    } catch (e) {
      debugPrint('OfflinePdfGenerator: logo body is not decodable: $e');
      return false;
    }
  }

  // =========================================================================
  // Layout pieces
  // =========================================================================

  static pw.Widget _header({
    required BrandConfig brand,
    required OfflineQuotation quotation,
    required pw.MemoryImage? logo,
    required String companyName,
    required PdfColor primary,
    required pw.Font bold,
    required pw.Font base,
    required pw.TextStyle valueStyle,
    required pw.TextStyle smallStyle,
  }) {
    final lines = <String>[
      if (brand.address.trim().isNotEmpty) _latin1Safe(brand.address.trim()),
      if (brand.phone.trim().isNotEmpty)
        'Phone: ${_latin1Safe(brand.phone.trim())}',
      if (brand.email.trim().isNotEmpty)
        'Email: ${_latin1Safe(brand.email.trim())}',
      if (brand.gstin.trim().isNotEmpty)
        'GSTIN: ${_latin1Safe(brand.gstin.trim())}',
    ];

    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        pw.Row(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            if (logo != null)
              pw.Container(
                width: 100,
                height: 60,
                margin: const pw.EdgeInsets.only(right: 12),
                // BoxFit.contain: a client logo can be any aspect ratio and
                // stretching someone's brand mark is unforgivable.
                child: pw.Image(logo, fit: pw.BoxFit.contain),
              ),
            pw.Expanded(
              child: pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Text(
                    companyName,
                    style: pw.TextStyle(
                      font: bold,
                      fontSize: 15,
                      color: primary,
                    ),
                  ),
                  if (brand.proprietorName.trim().isNotEmpty)
                    pw.Text(
                      'Prop: ${_latin1Safe(brand.proprietorName.trim())}',
                      style: smallStyle,
                    ),
                  for (final line in lines)
                    pw.Text(line, style: smallStyle),
                ],
              ),
            ),
            pw.SizedBox(width: 10),
            pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.end,
              children: [
                pw.Text(
                  'QUOTATION',
                  style: pw.TextStyle(
                    font: bold,
                    fontSize: 20,
                    color: primary,
                    letterSpacing: 1.2,
                  ),
                ),
                pw.SizedBox(height: 6),
                pw.Text(
                  'Quote No: ${_latin1Safe(quotation.quotationNo)}',
                  style: valueStyle,
                ),
                pw.Text(
                  'Date: ${formatQuoteDate(quotation.date)}',
                  style: valueStyle,
                ),
              ],
            ),
          ],
        ),
        pw.SizedBox(height: 8),
        pw.Container(height: 2, color: primary),
      ],
    );
  }

  /// Pages 2+ get a slim identity bar so a printed stack of pages cannot be
  /// mixed up between two customers.
  static pw.Widget _continuationHeader({
    required String companyName,
    required String quoteNo,
    required PdfColor primary,
    required pw.TextStyle style,
  }) {
    return pw.Container(
      margin: const pw.EdgeInsets.only(bottom: 8),
      padding: const pw.EdgeInsets.only(bottom: 4),
      decoration: pw.BoxDecoration(
        border: pw.Border(bottom: pw.BorderSide(color: primary, width: 1)),
      ),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text(companyName, style: style),
          pw.Text('Quotation $quoteNo (continued)', style: style),
        ],
      ),
    );
  }

  static pw.Widget _footer({
    required pw.Context context,
    required String companyName,
    required pw.TextStyle style,
    required PdfColor primary,
  }) {
    return pw.Container(
      margin: const pw.EdgeInsets.only(top: 8),
      padding: const pw.EdgeInsets.only(top: 4),
      decoration: pw.BoxDecoration(
        border: pw.Border(
          top: pw.BorderSide(color: PdfColors.grey400, width: 0.5),
        ),
      ),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text('Generated by $companyName', style: style),
          pw.Text(
            'Page ${context.pageNumber} of ${context.pagesCount}',
            style: style,
          ),
        ],
      ),
    );
  }

  static pw.Widget _sectionTitle(
    String text,
    PdfColor primary,
    pw.TextStyle style,
  ) {
    return pw.Container(
      width: double.infinity,
      color: primary,
      padding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      child: pw.Text(text, style: style),
    );
  }

  static pw.Widget _billTo({
    required OfflineQuotation quotation,
    required PdfColor fill,
    required PdfColor border,
    required pw.TextStyle labelStyle,
    required pw.TextStyle valueStyle,
  }) {
    pw.Widget row(String label, String value) => pw.Padding(
          padding: const pw.EdgeInsets.symmetric(vertical: 1),
          child: pw.Row(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.SizedBox(
                width: 62,
                child: pw.Text(label, style: labelStyle),
              ),
              pw.Expanded(
                child: pw.Text(_latin1Safe(value), style: valueStyle),
              ),
            ],
          ),
        );

    return pw.Container(
      width: double.infinity,
      decoration: pw.BoxDecoration(
        color: fill,
        border: pw.Border.all(color: border, width: 0.5),
      ),
      padding: const pw.EdgeInsets.all(8),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Text('BILL TO', style: labelStyle),
          pw.SizedBox(height: 3),
          row('Name', quotation.customerName),
          if (quotation.address.trim().isNotEmpty)
            row('Address', quotation.address),
          if (quotation.contactNo.trim().isNotEmpty)
            row('Contact', quotation.contactNo),
          if (quotation.email.trim().isNotEmpty) row('Email', quotation.email),
          if (quotation.reference.trim().isNotEmpty)
            row('Reference', quotation.reference),
        ],
      ),
    );
  }

  static pw.Widget _measuredTable({
    required List<OfflineMeasuredItem> items,
    required PdfColor primary,
    required PdfColor tint,
    required pw.TextStyle headerStyle,
    required pw.TextStyle cellStyle,
    required pw.TextStyle cellBoldStyle,
  }) {
    // Column order is CONTRACTUAL — it must match the online document
    // (lib/pdf_generator.dart) so a customer who has both cannot spot a
    // difference.
    //
    // ####################################################################
    // # SFT and T.SFT are DIFFERENT NUMBERS. DO NOT "SIMPLIFY" THEM.     #
    // #   SFT   = item.sft      -> area of ONE unit   (w/304.8 * h/304.8)#
    // #   T.SFT = item.totalSft -> sft * units                           #
    // # A TypeScript port printed totalSft in BOTH columns (bug found    #
    // # 08-08-2026). For a single-unit line they are equal, which is why #
    // # it passed review — it only diverges on multi-unit lines, i.e. on #
    // # exactly the big-ticket quotations where being wrong costs money. #
    // ####################################################################
    final rows = List<List<String>>.generate(items.length, (i) {
      final item = items[i];
      return <String>[
        '${i + 1}',
        _latin1Safe(item.code),
        _latin1Safe(item.description),
        item.width.toStringAsFixed(0),
        item.height.toStringAsFixed(0),
        '${item.units}',
        item.sft.toStringAsFixed(2), // PER UNIT
        item.totalSft.toStringAsFixed(2), // PER LINE (sft x units)
        formatAmount(item.rate),
        formatAmount(item.total),
      ];
    });

    return pw.TableHelper.fromTextArray(
      headers: const <String>[
        'S.No',
        'Code',
        'Description',
        'Width\n(mm)',
        'Height\n(mm)',
        'Units',
        'SFT',
        'T.SFT',
        'Rate\n(INR)',
        'Amount\n(INR)',
      ],
      data: rows,
      headerStyle: headerStyle,
      headerDecoration: pw.BoxDecoration(color: primary),
      headerAlignment: pw.Alignment.center,
      cellStyle: cellStyle,
      oddCellStyle: cellStyle,
      rowDecoration: const pw.BoxDecoration(color: PdfColors.white),
      oddRowDecoration: pw.BoxDecoration(color: tint),
      cellHeight: 14,
      cellPadding: const pw.EdgeInsets.symmetric(horizontal: 3, vertical: 3),
      border: pw.TableBorder.all(color: PdfColors.grey500, width: 0.4),
      cellAlignment: pw.Alignment.centerRight,
      cellAlignments: const <int, pw.Alignment>{
        0: pw.Alignment.center,
        1: pw.Alignment.centerLeft,
        2: pw.Alignment.centerLeft, // long descriptions read left-aligned
        3: pw.Alignment.center,
        4: pw.Alignment.center,
        5: pw.Alignment.center,
      },
      // Description gets the lion's share so it WRAPS instead of forcing the
      // numeric columns to shrink until the rate is unreadable.
      columnWidths: const <int, pw.TableColumnWidth>{
        0: pw.FlexColumnWidth(0.8),
        1: pw.FlexColumnWidth(1.5),
        2: pw.FlexColumnWidth(5.4),
        3: pw.FlexColumnWidth(1.3),
        4: pw.FlexColumnWidth(1.3),
        5: pw.FlexColumnWidth(1.0),
        6: pw.FlexColumnWidth(1.2),
        7: pw.FlexColumnWidth(1.2),
        8: pw.FlexColumnWidth(1.7),
        9: pw.FlexColumnWidth(2.0),
      },
      // `textStyleBuilder` is only invoked for DATA rows, and rowNum counts the
      // header (rowNum 0), so data rows start at 1. Bold the money column.
      textStyleBuilder: (col, _, rowNum) =>
          (col == 9 && rowNum > 0) ? cellBoldStyle : null,
    );
  }

  static pw.Widget _unmeasuredTable({
    required List<OfflineUnmeasuredItem> items,
    required PdfColor primary,
    required PdfColor tint,
    required pw.TextStyle headerStyle,
    required pw.TextStyle cellStyle,
    required pw.TextStyle cellBoldStyle,
  }) {
    final rows = List<List<String>>.generate(items.length, (i) {
      final item = items[i];
      return <String>[
        '${i + 1}',
        _latin1Safe(item.description),
        '${item.units}',
        formatAmount(item.rate),
        formatAmount(item.total),
      ];
    });

    return pw.TableHelper.fromTextArray(
      headers: const <String>[
        'S.No',
        'Description',
        'Units',
        'Rate\n(INR)',
        'Amount\n(INR)',
      ],
      data: rows,
      headerStyle: headerStyle,
      headerDecoration: pw.BoxDecoration(color: primary),
      headerAlignment: pw.Alignment.center,
      cellStyle: cellStyle,
      oddCellStyle: cellStyle,
      rowDecoration: const pw.BoxDecoration(color: PdfColors.white),
      oddRowDecoration: pw.BoxDecoration(color: tint),
      cellHeight: 14,
      cellPadding: const pw.EdgeInsets.symmetric(horizontal: 3, vertical: 3),
      border: pw.TableBorder.all(color: PdfColors.grey500, width: 0.4),
      cellAlignment: pw.Alignment.centerRight,
      cellAlignments: const <int, pw.Alignment>{
        0: pw.Alignment.center,
        1: pw.Alignment.centerLeft,
        2: pw.Alignment.center,
      },
      columnWidths: const <int, pw.TableColumnWidth>{
        0: pw.FlexColumnWidth(0.8),
        1: pw.FlexColumnWidth(8.0),
        2: pw.FlexColumnWidth(1.2),
        3: pw.FlexColumnWidth(2.0),
        4: pw.FlexColumnWidth(2.2),
      },
      textStyleBuilder: (col, _, rowNum) =>
          (col == 4 && rowNum > 0) ? cellBoldStyle : null,
    );
  }

  static pw.Widget _totals({
    required OfflineQuotation quotation,
    required PdfColor primary,
    required PdfColor fill,
    required pw.TextStyle labelStyle,
    required pw.TextStyle valueStyle,
    required pw.TextStyle totalStyle,
  }) {
    pw.Widget line(String label, String value, {bool emphasise = false}) {
      return pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 2),
        child: pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
          children: [
            pw.Text(label, style: emphasise ? totalStyle : labelStyle),
            pw.Text(value, style: emphasise ? totalStyle : valueStyle),
          ],
        ),
      );
    }

    return pw.Row(
      mainAxisAlignment: pw.MainAxisAlignment.end,
      children: [
        pw.Container(
          width: 250,
          decoration: pw.BoxDecoration(
            color: fill,
            border: pw.Border.all(color: primary, width: 0.6),
          ),
          padding: const pw.EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          child: pw.Column(
            children: [
              line('Total SFT', quotation.totalSft.toStringAsFixed(2)),
              // "Rs." spelled out in ASCII — see the file header for why the
              // rupee glyph can never appear in a Helvetica document.
              line('Amount (Rs.)', formatAmount(quotation.actualAmount)),
              if (quotation.transport != 0)
                line('Transport (Rs.)', formatAmount(quotation.transport)),
              if (quotation.includeGst)
                line(
                  'GST @ ${_percent(quotation.gstPercentage)}% (Rs.)',
                  formatAmount(quotation.igst),
                ),
              pw.Container(
                margin: const pw.EdgeInsets.symmetric(vertical: 4),
                height: 1,
                color: primary,
              ),
              line(
                'Grand Total (Rs.)',
                formatAmount(quotation.grandTotal),
                emphasise: true,
              ),
            ],
          ),
        ),
      ],
    );
  }

  static pw.Widget _amountInWords(
    OfflineQuotation quotation,
    PdfColor border,
    pw.TextStyle labelStyle,
    pw.TextStyle valueStyle,
  ) {
    return pw.Container(
      width: double.infinity,
      decoration: pw.BoxDecoration(
        border: pw.Border.all(color: border, width: 0.5),
      ),
      padding: const pw.EdgeInsets.all(6),
      child: pw.Row(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Text('Amount in Words: ', style: labelStyle),
          pw.Expanded(
            // amountInWords is ASCII by construction and already includes the
            // word "RUPEES", which is the other half of the no-glyph strategy.
            child: pw.Text(quotation.amountInWords, style: valueStyle),
          ),
        ],
      ),
    );
  }

  static pw.Widget _paymentBlock({
    required BrandConfig brand,
    required OfflineQuotation quotation,
    required PdfColor primary,
    required PdfColor border,
    required pw.TextStyle labelStyle,
    required pw.TextStyle valueStyle,
    required pw.TextStyle smallStyle,
    required pw.TextStyle sectionStyle,
    required void Function(String)? onWarning,
  }) {
    final qr = brand.hasUpi
        ? _upiQr(brand: brand, quotation: quotation, onWarning: onWarning)
        : null;

    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        _sectionTitle('Payment Details', primary, sectionStyle),
        pw.SizedBox(height: 4),
        pw.Row(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            if (brand.hasBankDetails)
              pw.Expanded(
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    _kv('Bank', brand.bankName, labelStyle, valueStyle),
                    if (brand.bankBranch.trim().isNotEmpty)
                      _kv('Branch', brand.bankBranch, labelStyle, valueStyle),
                    if (brand.bankAccountName.trim().isNotEmpty)
                      _kv('Account Name', brand.bankAccountName, labelStyle,
                          valueStyle),
                    _kv('Account No', brand.bankAccountNo, labelStyle,
                        valueStyle),
                    if (brand.bankIfsc.trim().isNotEmpty)
                      _kv('IFSC', brand.bankIfsc, labelStyle, valueStyle),
                  ],
                ),
              ),
            if (qr != null) ...[
              if (brand.hasBankDetails) pw.SizedBox(width: 12),
              pw.Container(
                decoration: pw.BoxDecoration(
                  border: pw.Border.all(color: border, width: 0.5),
                ),
                padding: const pw.EdgeInsets.all(6),
                child: pw.Column(
                  children: [
                    pw.SizedBox(
                      width: 120,
                      height: 120,
                      child: pw.SvgImage(svg: qr),
                    ),
                    pw.SizedBox(height: 4),
                    pw.Text('Scan to Pay (UPI)', style: labelStyle),
                    pw.Text(_latin1Safe(brand.upiId), style: smallStyle),
                  ],
                ),
              ),
            ],
          ],
        ),
      ],
    );
  }

  static pw.Widget _kv(
    String label,
    String value,
    pw.TextStyle labelStyle,
    pw.TextStyle valueStyle,
  ) {
    return pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 1),
      child: pw.Row(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.SizedBox(width: 78, child: pw.Text(label, style: labelStyle)),
          pw.Expanded(
            child: pw.Text(_latin1Safe(value.trim()), style: valueStyle),
          ),
        ],
      ),
    );
  }

  static pw.Widget _terms(List<String> terms, pw.TextStyle style) {
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < terms.length; i++)
          pw.Padding(
            padding: const pw.EdgeInsets.only(bottom: 2),
            child: pw.Row(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.SizedBox(
                  width: 16,
                  child: pw.Text('${i + 1}.', style: style),
                ),
                pw.Expanded(
                  child: pw.Text(_latin1Safe(terms[i]), style: style),
                ),
              ],
            ),
          ),
      ],
    );
  }

  static pw.Widget _signatures(
    String companyName,
    pw.TextStyle labelStyle,
    pw.TextStyle italicStyle,
  ) {
    return pw.Row(
      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
      crossAxisAlignment: pw.CrossAxisAlignment.end,
      children: [
        pw.Text('Customer Signature', style: labelStyle),
        pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.end,
          children: [
            pw.Text('For $companyName', style: labelStyle),
            pw.SizedBox(height: 34), // room for a wet signature / stamp
            pw.Text('Authorised Signatory', style: italicStyle),
          ],
        ),
      ],
    );
  }

  // =========================================================================
  // UPI
  // =========================================================================

  /// Builds the NPCI UPI deep link and renders it as an SVG QR, entirely
  /// offline (`barcode` is pure Dart — it computes the module matrix locally).
  ///
  /// Deliberately NOT reusing `lib/services/upi_service.dart`: everything under
  /// `lib/offline/**` is banned from importing `lib/services/`, and the offline
  /// tier must stay independently shippable.
  static String? _upiQr({
    required BrandConfig brand,
    required OfflineQuotation quotation,
    required void Function(String)? onWarning,
  }) {
    final uri = buildUpiUri(
      vpa: brand.upiId,
      payeeName: brand.upiPayeeName,
      amount: quotation.grandTotal,
      note: 'Quote ${quotation.quotationNo}',
      transactionRef: quotation.quotationNo,
    );
    if (uri.isEmpty) return null;
    try {
      return Barcode.qrCode().toSvg(
        uri,
        width: 120,
        height: 120,
        // The payload is a URI — printing it under the QR is noise, and the
        // barcode package would render it in a font the PDF does not have.
        drawText: false,
      );
    } catch (e) {
      debugPrint('OfflinePdfGenerator: UPI QR failed: $e');
      onWarning?.call(
        'The UPI payment QR could not be generated for this quotation.',
      );
      return null;
    }
  }

  /// `upi://pay?pa=..&pn=..&am=..&cu=INR&tn=..&tr=..`
  ///
  /// Returns '' for an unusable VPA so callers can just hide the section.
  @visibleForTesting
  static String buildUpiUri({
    required String vpa,
    required String payeeName,
    double? amount,
    String note = '',
    String transactionRef = '',
  }) {
    final v = vpa.trim();
    if (v.isEmpty || v.contains(' ')) return '';
    final parts = v.split('@');
    if (parts.length != 2 || parts[0].isEmpty || parts[1].isEmpty) return '';

    final params = <String, String>{
      'pa': v,
      'pn': _upiText(payeeName, 40),
      'cu': 'INR',
    };

    // Omit `am` entirely at zero. `am=0.00` is rejected outright by PhonePe and
    // shows an "Enter amount" error on GPay, whereas omitting it yields a
    // perfectly valid open-amount QR.
    if (amount != null && amount > 0) {
      params['am'] = amount.toStringAsFixed(2);
    }

    final n = _upiText(note, 50);
    if (n.isNotEmpty) params['tn'] = n;
    final r = _upiText(transactionRef, 35);
    if (r.isNotEmpty) params['tr'] = r;

    return 'upi://pay?${params.entries.map(
          (e) => '${e.key}=${Uri.encodeComponent(e.value)}',
        ).join('&')}';
  }

  /// Exotic characters are stripped rather than escaped: a percent-encoded
  /// `%26` inside a note is handled inconsistently across PSP apps, whereas a
  /// missing ampersand is harmless.
  static String _upiText(String input, int maxLength) {
    final cleaned = input
        .replaceAll(RegExp(r'[^A-Za-z0-9 .\-_/]'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    return cleaned.length <= maxLength
        ? cleaned
        : cleaned.substring(0, maxLength).trim();
  }

  // =========================================================================
  // Text / colour helpers
  // =========================================================================

  /// Makes any string safe for a Type1 (latin-1) font.
  ///
  /// `PdfFont.putText` runs the string through `latin1.encode`, which THROWS on
  /// any rune above U+00FF. Without this, a customer whose address was pasted
  /// from WhatsApp (curly apostrophe U+2019) or typed in Telugu would make the
  /// PDF fail to build at all. Common typographic characters are transliterated
  /// so the output still reads correctly; anything else becomes '?' — visibly
  /// wrong is far better than a quotation that will not open.
  static String _latin1Safe(String input) {
    if (input.isEmpty) return input;

    var needsWork = false;
    for (final rune in input.runes) {
      if (rune > 0xFF) {
        needsWork = true;
        break;
      }
    }
    if (!needsWork) return input;

    const replacements = <int, String>{
      0x2018: "'", 0x2019: "'", 0x201A: "'", 0x201B: "'", // single quotes
      0x201C: '"', 0x201D: '"', 0x201E: '"', // double quotes
      0x2013: '-', 0x2014: '-', 0x2015: '-', 0x2212: '-', // dashes
      0x2026: '...', // ellipsis
      0x2022: '*', // bullet
      0x00A0: ' ', // nbsp (in latin1, but normalise anyway)
      0x20B9: 'Rs.', // RUPEE SIGN -> the whole reason this file says "Rs."
      0x20AC: 'EUR',
      0x2122: '(TM)',
      0x2044: '/',
    };

    final buffer = StringBuffer();
    for (final rune in input.runes) {
      if (rune <= 0xFF) {
        buffer.writeCharCode(rune);
      } else {
        buffer.write(replacements[rune] ?? '?');
      }
    }
    return buffer.toString();
  }

  /// `18.0` -> `18`, `18.5` -> `18.5`. A header reading "GST @ 18.0%" looks
  /// like a rounding artefact to a customer.
  static String _percent(double value) {
    if (value == value.roundToDouble()) return value.toStringAsFixed(0);
    return value
        .toStringAsFixed(2)
        .replaceAll(RegExp(r'0+$'), '')
        .replaceAll(RegExp(r'\.$'), '');
  }

  /// Picks black or white for text drawn on [background] by comparing the two
  /// WCAG contrast ratios, rather than assuming the brand colour is dark.
  /// Clients pick their own colour in the wizard — a pale yellow brand would
  /// render white header text invisible.
  static PdfColor _readableOn(PdfColor background) {
    final l = _relativeLuminance(background);
    final contrastWithWhite = 1.05 / (l + 0.05);
    final contrastWithBlack = (l + 0.05) / 0.05;
    return contrastWithWhite >= contrastWithBlack
        ? PdfColors.white
        : PdfColors.black;
  }

  static double _relativeLuminance(PdfColor c) {
    double channel(double v) => v <= 0.03928
        ? v / 12.92
        : math.pow((v + 0.055) / 1.055, 2.4).toDouble();
    return 0.2126 * channel(c.red) +
        0.7152 * channel(c.green) +
        0.0722 * channel(c.blue);
  }

  /// Mixes [color] towards white by [amount] (0 = untouched, 1 = white).
  /// Used for zebra rows and panel fills so the document picks up the brand
  /// colour without becoming unreadable.
  static PdfColor _tint(PdfColor color, double amount) {
    final t = amount.clamp(0.0, 1.0);
    return PdfColor(
      color.red + (1 - color.red) * t,
      color.green + (1 - color.green) * t,
      color.blue + (1 - color.blue) * t,
    );
  }
}
