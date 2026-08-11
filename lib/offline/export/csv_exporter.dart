/// OFFLINE TIER — CSV EXPORT.
///
/// ZERO-SERVER CONTRACT: no `supabase_flutter`, no `http`, no
/// `connectivity_plus`, nothing from `lib/services/**`.
/// See `lib/offline/core/models.dart` for the full rule.
///
/// WHY HAND-ROLLED
/// ---------------
/// The `csv` package is not a dependency and the offline tier may not add one.
/// RFC4180 quoting is ten lines; the risk is not the algorithm, it is
/// forgetting to apply it — so EVERY cell in this file goes through [csvCell]
/// and nothing writes a raw value into the buffer.
///
/// THREE RULES THIS FILE EXISTS TO ENFORCE
/// ---------------------------------------
/// 1. RFC4180 quoting. An address containing a comma ("Plot 4, Road 12")
///    shifts every subsequent column of that row — the file still opens, so
///    nobody notices until the accountant reconciles a total against phone
///    numbers.
/// 2. Formula-injection guarding. These files are opened in Excel. A product
///    description beginning `=` is EXECUTED by Excel; `=1+1` is harmless,
///    `=cmd|'/c ...'!A1` is not. Everything starting `= + - @ TAB CR` gets a
///    leading apostrophe.
/// 3. UTF-8 **with BOM**. Excel on an Indian Windows install reads a BOM-less
///    UTF-8 file as ANSI, so every non-ASCII customer name is mangled and the
///    owner concludes the app corrupted their data.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';

import '../core/models.dart';
import '../core/payment_models.dart';
import '../data/quotation_repository.dart' show QuotationSummary;

class CsvExporter {
  CsvExporter._();

  /// RFC4180 says CRLF. Excel is happy either way; Notepad is not.
  static const String _eol = '\r\n';

  /// U+FEFF. Without it Excel-in-India mangles every non-ASCII name.
  static const String utf8Bom = '\uFEFF';

  /// Plain `dd-MM-yyyy`, matching what the app shows on screen.
  static final DateFormat _dateFormat = DateFormat('dd-MM-yyyy');

  // -------------------------------------------------------------------------
  // Sheets
  // -------------------------------------------------------------------------

  /// One row per quotation — the list screen, exported.
  static String quotations(List<QuotationSummary> rows) {
    final sb = StringBuffer(utf8Bom);
    _writeRow(sb, const <String>[
      'Quotation No',
      'Date',
      'Customer',
      'Status',
      'Items',
      'Grand Total',
    ]);

    for (final r in rows) {
      _writeRow(sb, <String>[
        r.quoteNo,
        _date(r.date),
        r.customerName,
        r.status.label,
        r.itemCount.toString(),
        _money(r.grandTotal),
      ]);
    }
    return sb.toString();
  }

  /// One row per LINE ITEM, measured and unmeasured, flattened.
  ///
  /// ⚠️ `SFT` and `T.SFT` are SEPARATE columns and are NOT the same number.
  ///   * `SFT`   = [OfflineMeasuredItem.sft]      — area of ONE unit
  ///   * `T.SFT` = [OfflineMeasuredItem.totalSft] — that area x units
  /// They are equal only when `units == 1`, which is why a previous port
  /// shipped both columns reading `totalSft` and nobody caught it for months:
  /// every single-window test case passed. Any fixture testing this MUST use
  /// units > 1.
  static String quotationLineItems(List<OfflineQuotation> quotations) {
    final sb = StringBuffer(utf8Bom);
    _writeRow(sb, const <String>[
      'Quotation No',
      'Date',
      'Customer',
      'Status',
      'Section',
      'Sl No',
      'Code',
      'Description',
      'Glass',
      'Width (mm)',
      'Height (mm)',
      'Units',
      'SFT',
      'T.SFT',
      'Rate',
      'Amount',
    ]);

    for (final q in quotations) {
      final quoteNo = q.quotationNo;
      final date = _date(q.date);
      final customer = q.customerName;
      final status = q.status.label;

      var sl = 0;
      for (final item in q.measuredItems) {
        sl++;
        _writeRow(sb, <String>[
          quoteNo,
          date,
          customer,
          status,
          'Measured',
          sl.toString(),
          item.code,
          item.description,
          item.glass,
          _number(item.width),
          _number(item.height),
          item.units.toString(),
          // Per-unit area.
          item.sft.toStringAsFixed(3),
          // Area x units. Deliberately a different getter — see the doc above.
          item.totalSft.toStringAsFixed(3),
          _money(item.rate),
          _money(item.total),
        ]);
      }

      sl = 0;
      for (final item in q.unmeasuredItems) {
        sl++;
        _writeRow(sb, <String>[
          quoteNo,
          date,
          customer,
          status,
          'Unmeasured',
          sl.toString(),
          '',
          item.description,
          '',
          // Blank, not 0 — a per-piece item has no dimensions, and a literal 0
          // would be averaged into any SFT pivot the accountant builds.
          '',
          '',
          item.units.toString(),
          '',
          '',
          _money(item.rate),
          _money(item.total),
        ]);
      }
    }
    return sb.toString();
  }

  /// The address book.
  static String customers(List<OfflineCustomer> rows) {
    final sb = StringBuffer(utf8Bom);
    _writeRow(sb, const <String>[
      'Name',
      'Phone',
      'Email',
      'Address',
      'GSTIN',
      'Notes',
    ]);

    for (final c in rows) {
      _writeRow(sb, <String>[
        c.name,
        c.phone,
        c.email,
        c.address,
        c.gstin,
        c.notes,
      ]);
    }
    return sb.toString();
  }

  /// Receipts. [quotationNoById] is built by the caller while paging.
  static String payments({
    required List<OfflinePayment> payments,
    required Map<String, String> quotationNoById,
  }) {
    final sb = StringBuffer(utf8Bom);
    _writeRow(sb, const <String>[
      'Date',
      'Quotation No',
      'Amount',
      'Method',
      'Reference',
      'Notes',
    ]);

    for (final p in payments) {
      _writeRow(sb, <String>[
        _date(p.date),
        quotationNoById[p.quotationId] ?? '',
        _money(p.amount),
        p.method.label,
        p.reference,
        p.notes,
      ]);
    }
    return sb.toString();
  }

  // -------------------------------------------------------------------------
  // Primitives
  // -------------------------------------------------------------------------

  static void _writeRow(StringBuffer sb, List<String> cells) {
    for (var i = 0; i < cells.length; i++) {
      if (i > 0) sb.write(',');
      sb.write(csvCell(cells[i]));
    }
    sb.write(_eol);
  }

  static String _date(DateTime d) => _dateFormat.format(d);

  /// Money for MACHINES.
  ///
  /// Deliberately NOT `formatAmount`/`formatInr`: Indian grouping produces
  /// "1,20,000.00", and a comma inside a numeric field makes every spreadsheet
  /// and every accounting importer read it as text — the accountant's SUM()
  /// then quietly returns 0. Grouping is a display concern; this is a data file.
  static String _money(double v) {
    if (v.isNaN || v.isInfinite) return '0.00';
    return v.toStringAsFixed(2);
  }

  /// Dimensions: no grouping either, and no trailing `.0` noise on whole mm.
  static String _number(double v) {
    if (v.isNaN || v.isInfinite) return '0';
    if (v == v.roundToDouble()) return v.toStringAsFixed(0);
    return v.toStringAsFixed(2);
  }

  /// One RFC4180 field, hardened against Excel formula injection.
  ///
  /// Two independent jobs, in this order:
  ///   1. Neutralise a leading `= + - @ TAB CR` with a `'` prefix. Excel treats
  ///      those as the start of a formula. The apostrophe is Excel's own
  ///      "this is text" marker and is not shown in the cell.
  ///   2. Quote per RFC4180 when the value contains `,`, `"`, CR or LF, and
  ///      double any embedded `"`.
  ///
  /// The guard has to run BEFORE the quoting decision, because prefixing can
  /// only add a character that never itself requires quoting — doing it the
  /// other way round would insert the apostrophe INSIDE the quotes after the
  /// decision was made, which is still correct but harder to reason about, and
  /// one refactor away from being wrong.
  @visibleForTesting
  static String csvCell(String raw) {
    var value = raw;

    if (value.isNotEmpty) {
      final first = value.codeUnitAt(0);
      final dangerous = first == 0x3D || // =
          first == 0x2B || // +
          first == 0x2D || // -
          first == 0x40 || // @
          first == 0x09 || // TAB
          first == 0x0D; // CR
      if (dangerous) value = "'$value";
    }

    final needsQuotes = value.contains(',') ||
        value.contains('"') ||
        value.contains('\n') ||
        value.contains('\r');

    if (!needsQuotes) return value;
    return '"${value.replaceAll('"', '""')}"';
  }

  /// Writes [csv] to the temp directory as UTF-8 and returns the file.
  ///
  /// The BOM is already part of the string (the sheet builders prepend it), so
  /// it is encoded as bytes here like any other character — encoding it twice
  /// would put a visible `ï»¿` in the first cell.
  static Future<File> saveToTemp(String csv, String fileName) async {
    final dir = await getTemporaryDirectory();
    final safe = _sanitiseFileName(fileName);
    final file = File('${dir.path}${Platform.pathSeparator}$safe');
    await file.writeAsBytes(utf8.encode(csv), flush: true);
    return file;
  }

  /// Same reasoning as the Tally exporter's: a `/` in a name is a path
  /// separator and `File(...)` throws on the missing intermediate directory.
  static String _sanitiseFileName(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return 'export.csv';
    final cleaned = trimmed
        .replaceAll(RegExp(r'[\\/:*?"<>|\x00-\x1F]'), '_')
        .replaceAll(RegExp(r'[. ]+$'), '');
    return cleaned.isEmpty ? 'export.csv' : cleaned;
  }
}
