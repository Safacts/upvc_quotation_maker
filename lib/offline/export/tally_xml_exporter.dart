/// OFFLINE TIER — TALLY XML EXPORT.
///
/// ZERO-SERVER CONTRACT: nothing in `lib/offline/**` may import
/// `supabase_flutter`, `package:http/http.dart`, `connectivity_plus` or
/// anything under `lib/services/**`. See `lib/offline/core/models.dart`.
///
/// WHY HAND-ROLLED XML
/// -------------------
/// The `xml` package is NOT a dependency of this project and the offline tier
/// is not allowed to add one. Tally's import format is a small, fixed,
/// well-known shape, so a `StringBuffer` plus a rigorous [escapeXml] is both
/// sufficient and cheaper than pulling in a DOM.
///
/// WHY THIS FILE IS PARANOID ABOUT ARITHMETIC
/// ------------------------------------------
/// Tally validates a voucher as a DOUBLE ENTRY. If the ledger lines of a single
/// voucher do not sum to EXACTLY zero, Tally rejects **the entire file** — not
/// the offending voucher. One 0.01 float residue in quotation 412 therefore
/// costs the owner all 411 good vouchers and produces an error message that
/// says nothing useful. So: every component is rounded to 2 decimals FIRST, the
/// party line is computed as the exact complement of those ROUNDED numbers, and
/// the result is re-verified from the emitted strings before the voucher is
/// allowed into the buffer.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';

import '../core/brand_config.dart';
import '../core/models.dart';
import '../core/payment_models.dart';

/// Thrown when a voucher cannot be produced in a state Tally would accept.
///
/// Deliberately a hard failure rather than a warning: writing an unimportable
/// file is worse than writing none, because the owner discovers it only after
/// carrying the phone to their accountant.
class TallyExportException implements Exception {
  const TallyExportException(this.message, {this.voucherNumber});

  final String message;

  /// Quotation / receipt number the failure belongs to, so the UI can name it.
  final String? voucherNumber;

  @override
  String toString() => voucherNumber == null || voucherNumber!.isEmpty
      ? 'TallyExportException: $message'
      : 'TallyExportException: $message (voucher $voucherNumber)';
}

/// Builds Tally-importable XML from offline quotations and payments.
///
/// All methods are static and pure (except [saveToTemp]); nothing here touches
/// the database, so the caller controls paging.
class TallyXmlExporter {
  TallyXmlExporter._();

  /// Tally's `<DATE>` / `<EFFECTIVEDATE>` wire format.
  static final DateFormat _tallyDateFormat = DateFormat('yyyyMMdd');

  /// Half-a-paisa. Anything below this is float noise, anything at or above it
  /// is a real imbalance that Tally will reject.
  static const double _balanceEpsilon = 0.001;

  /// Ledger a cash receipt is debited to.
  static const String cashLedgerName = 'Cash';

  /// Ledger every non-cash receipt is debited to.
  static const String bankLedgerName = 'Bank';

  /// Transport is its own ledger line, never folded into Sales.
  ///
  /// Folding it in inflates the taxable sales figure the accountant files GST
  /// against, and makes the Tally sales total disagree with the PDF's own
  /// "Sales" subtotal.
  static const String transportLedgerName = 'Transport Charges';

  // -------------------------------------------------------------------------
  // Sales vouchers
  // -------------------------------------------------------------------------

  /// One `Sales` voucher per quotation.
  ///
  /// Sign convention (this is the part that gets it rejected if wrong):
  ///   * Party ledger  = DEBIT  = **NEGATIVE** `<AMOUNT>`, `ISDEEMEDPOSITIVE Yes`
  ///   * Sales/GST/Transport = CREDIT = **POSITIVE** `<AMOUNT>`, `ISDEEMEDPOSITIVE No`
  /// and all `<AMOUNT>` values inside one `<VOUCHER>` sum to exactly 0.00.
  ///
  /// Throws [TallyExportException] naming the quotation if that invariant
  /// cannot be met, rather than emitting a file Tally will refuse wholesale.
  static String buildSalesVouchers({
    required List<OfflineQuotation> quotations,
    required BrandConfig brand,
    String salesLedgerName = 'Sales',
    String gstLedgerName = 'IGST',
  }) {
    final body = StringBuffer();

    for (final q in quotations) {
      body.write(
        _salesVoucher(
          q,
          salesLedgerName: salesLedgerName,
          gstLedgerName: gstLedgerName,
        ),
      );
    }

    return _envelope(companyName: brand.companyName, requestData: body);
  }

  static String _salesVoucher(
    OfflineQuotation q, {
    required String salesLedgerName,
    required String gstLedgerName,
  }) {
    final voucherNo = q.quotationNo.trim();

    // ---- ROUND FIRST -------------------------------------------------------
    // Every credit component is snapped to 2 decimals BEFORE the party line is
    // derived. Deriving the party line from the UNROUNDED total and rounding
    // afterwards is exactly how a voucher ends up 0.01 out: three components
    // each carrying .004 of residue round down individually but their raw sum
    // rounds up.
    final salesAmount = _round2(q.actualAmount);
    final transportAmount = _round2(q.transport);
    final gstAmount = q.includeGst ? _round2(q.igst) : 0.0;

    final credits = <_LedgerLine>[
      _LedgerLine(ledger: salesLedgerName, amount: salesAmount, debit: false),
      if (transportAmount != 0.0)
        _LedgerLine(
          ledger: transportLedgerName,
          amount: transportAmount,
          debit: false,
        ),
      // GST line only when the quotation actually carries tax. An IGST line of
      // 0.00 on a non-GST bill makes the quotation look taxable in Tally's GST
      // reports, which is a filing problem, not a cosmetic one.
      if (q.includeGst && gstAmount > 0)
        _LedgerLine(ledger: gstLedgerName, amount: gstAmount, debit: false),
    ];

    // Party is the exact complement of the ROUNDED credits.
    final creditTotal = _round2(
      credits.fold<double>(0.0, (s, l) => s + l.amount),
    );

    final party = _LedgerLine(
      ledger: _partyLedgerName(q),
      amount: -creditTotal,
      debit: true,
    );

    final lines = <_LedgerLine>[party, ...credits];
    _assertBalanced(lines, voucherNo);

    final sb = StringBuffer();
    sb.write('<TALLYMESSAGE xmlns:UDF="TallyUDF">');
    sb.write('<VOUCHER VCHTYPE="Sales" ACTION="Create" '
        'OBJVIEW="Invoice Voucher">');
    sb.write(_tag('DATE', tallyDate(q.date)));
    sb.write(_tag('EFFECTIVEDATE', tallyDate(q.date)));
    sb.write(_tag('VOUCHERTYPENAME', 'Sales'));
    sb.write(_tag('VOUCHERNUMBER', voucherNo));
    sb.write(_tag('PARTYLEDGERNAME', party.ledger));
    sb.write(_tag('PARTYNAME', party.ledger));
    sb.write(_tag('REFERENCE', q.reference.isEmpty ? voucherNo : q.reference));
    sb.write(_tag('REFERENCEDATE', tallyDate(q.date)));
    sb.write(_tag('PERSISTEDVIEW', 'Invoice Voucher'));
    sb.write(_tag('ISINVOICE', 'Yes'));
    if (q.notes.trim().isNotEmpty) {
      sb.write(_tag('NARRATION', q.notes.trim()));
    }

    for (final line in lines) {
      sb.write(_ledgerEntry(line));
    }

    sb.write('</VOUCHER>');
    sb.write('</TALLYMESSAGE>');
    return sb.toString();
  }

  // -------------------------------------------------------------------------
  // Receipt vouchers
  // -------------------------------------------------------------------------

  /// One `Receipt` voucher per payment.
  ///
  /// Mirror image of a sales voucher: money came IN, so the cash/bank ledger is
  /// DEBITED (negative amount) and the party is CREDITED (positive amount).
  /// Getting this backwards imports every receipt as though the business PAID
  /// the customer, which silently doubles the apparent receivable.
  ///
  /// [quotationNoById] / [customerNameById] are lookups the caller builds while
  /// paging — this class never queries.
  static String buildReceiptVouchers({
    required List<OfflinePayment> payments,
    required Map<String, String> quotationNoById,
    required Map<String, String> customerNameById,
    required BrandConfig brand,
  }) {
    final body = StringBuffer();

    for (final p in payments) {
      body.write(
        _receiptVoucher(
          p,
          quotationNo: quotationNoById[p.quotationId] ?? '',
          customerName: customerNameById[p.customerId] ?? '',
        ),
      );
    }

    return _envelope(companyName: brand.companyName, requestData: body);
  }

  static String _receiptVoucher(
    OfflinePayment p, {
    required String quotationNo,
    required String customerName,
  }) {
    // A receipt's own identity: its reference if it has one, else the quotation
    // it settles, else its row id. Tally tolerates a blank VOUCHERNUMBER but the
    // owner then cannot tell two receipts apart in their own ledger.
    final voucherNo = p.reference.trim().isNotEmpty
        ? p.reference.trim()
        : (quotationNo.isNotEmpty ? quotationNo : (p.id ?? ''));

    final amount = _round2(p.amount);
    if (amount <= 0) {
      throw TallyExportException(
        'Receipt amount must be greater than zero.',
        voucherNumber: voucherNo,
      );
    }

    // Cash goes to Cash; everything else (UPI, NEFT, cheque, card) lands in the
    // bank account. `other` is treated as bank because an unclassified receipt
    // that is not physically in the till is, in practice, a bank credit.
    final depositLedger =
        p.method == PaymentMethod.cash ? cashLedgerName : bankLedgerName;

    final partyName =
        customerName.trim().isNotEmpty ? customerName.trim() : 'Sundry Debtors';

    final lines = <_LedgerLine>[
      // Debit the money-in ledger.
      _LedgerLine(ledger: depositLedger, amount: -amount, debit: true),
      // Credit the customer — their outstanding goes down.
      _LedgerLine(ledger: partyName, amount: amount, debit: false),
    ];
    _assertBalanced(lines, voucherNo);

    final narration = StringBuffer();
    if (quotationNo.isNotEmpty) narration.write('Against $quotationNo. ');
    narration.write('Received by ${p.method.label}.');
    if (p.notes.trim().isNotEmpty) narration.write(' ${p.notes.trim()}');

    final sb = StringBuffer();
    sb.write('<TALLYMESSAGE xmlns:UDF="TallyUDF">');
    sb.write('<VOUCHER VCHTYPE="Receipt" ACTION="Create" '
        'OBJVIEW="Accounting Voucher View">');
    sb.write(_tag('DATE', tallyDate(p.date)));
    sb.write(_tag('EFFECTIVEDATE', tallyDate(p.date)));
    sb.write(_tag('VOUCHERTYPENAME', 'Receipt'));
    sb.write(_tag('VOUCHERNUMBER', voucherNo));
    sb.write(_tag('PARTYLEDGERNAME', partyName));
    sb.write(_tag('PARTYNAME', partyName));
    sb.write(_tag('REFERENCE', quotationNo.isEmpty ? voucherNo : quotationNo));
    sb.write(_tag('NARRATION', narration.toString()));

    for (final line in lines) {
      sb.write(_ledgerEntry(line));
    }

    sb.write('</VOUCHER>');
    sb.write('</TALLYMESSAGE>');
    return sb.toString();
  }

  // -------------------------------------------------------------------------
  // Envelope + primitives
  // -------------------------------------------------------------------------

  static String _envelope({
    required String companyName,
    required StringBuffer requestData,
  }) {
    final sb = StringBuffer();
    sb.write('<?xml version="1.0" encoding="UTF-8"?>');
    sb.write('<ENVELOPE>');
    sb.write('<HEADER>');
    sb.write(_tag('TALLYREQUEST', 'Import Data'));
    sb.write('</HEADER>');
    sb.write('<BODY>');
    sb.write('<IMPORTDATA>');
    sb.write('<REQUESTDESC>');
    sb.write(_tag('REPORTNAME', 'Vouchers'));
    sb.write('<STATICVARIABLES>');
    // Tally imports into whichever company this names. An empty value makes
    // Tally fall back to the currently open company, which is the least
    // surprising behaviour when the owner never set a company name.
    sb.write(_tag('SVCURRENTCOMPANY', companyName));
    sb.write('</STATICVARIABLES>');
    sb.write('</REQUESTDESC>');
    sb.write('<REQUESTDATA>');
    sb.write(requestData.toString());
    sb.write('</REQUESTDATA>');
    sb.write('</IMPORTDATA>');
    sb.write('</BODY>');
    sb.write('</ENVELOPE>');
    return sb.toString();
  }

  /// A single `<ALLLEDGERENTRIES.LIST>` block.
  static String _ledgerEntry(_LedgerLine line) {
    final sb = StringBuffer();
    sb.write('<ALLLEDGERENTRIES.LIST>');
    sb.write(_tag('LEDGERNAME', line.ledger));
    // ISDEEMEDPOSITIVE and the AMOUNT sign must AGREE. Tally reads the flag for
    // presentation and the sign for arithmetic; disagreeing values import a
    // voucher that balances numerically but shows the debit/credit columns
    // swapped in the owner's ledger.
    sb.write(_tag('ISDEEMEDPOSITIVE', line.debit ? 'Yes' : 'No'));
    sb.write(_tag('LEDGERFROMITEM', 'No'));
    sb.write(_tag('REMOVEZEROENTRIES', 'No'));
    sb.write(_tag('ISPARTYLEDGER', line.debit ? 'Yes' : 'No'));
    sb.write(_tag('AMOUNT', line.amount.toStringAsFixed(2)));
    sb.write('</ALLLEDGERENTRIES.LIST>');
    return sb.toString();
  }

  static String _tag(String name, String value) =>
      '<$name>${escapeXml(value)}</$name>';

  /// Party ledger for a quotation.
  ///
  /// Falls back to Tally's own default group name rather than emitting an empty
  /// `<PARTYLEDGERNAME>`, which Tally rejects with a message that does not
  /// mention which voucher caused it.
  static String _partyLedgerName(OfflineQuotation q) {
    final name = q.customerName.trim();
    return name.isEmpty ? 'Sundry Debtors' : name;
  }

  /// Snap to paise. `toStringAsFixed(2)` then re-parse, so the double we go on
  /// to add is byte-identical to the one we will print.
  static double _round2(double v) {
    if (v.isNaN || v.isInfinite) return 0.0;
    return double.parse(v.toStringAsFixed(2));
  }

  /// Re-derives the balance from the STRINGS that will actually be written.
  ///
  /// Checking the doubles would test the wrong thing — Tally reads the text.
  static void _assertBalanced(List<_LedgerLine> lines, String voucherNo) {
    var sum = 0.0;
    for (final l in lines) {
      sum += double.parse(l.amount.toStringAsFixed(2));
    }
    if (sum.abs() >= _balanceEpsilon) {
      throw TallyExportException(
        'Voucher does not balance (out by ${sum.toStringAsFixed(4)}). '
        'Tally would reject the whole file, so nothing was written.',
        voucherNumber: voucherNo,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Public helpers
  // -------------------------------------------------------------------------

  /// Writes [xml] to the temp directory as UTF-8 and returns the file.
  ///
  /// Temp, not documents: the export is a disposable artefact handed straight
  /// to the share sheet. The data of record lives in SQLite.
  static Future<File> saveToTemp(String xml, String fileName) async {
    final dir = await getTemporaryDirectory();
    final safe = sanitiseFileName(fileName);
    final file = File('${dir.path}${Platform.pathSeparator}$safe');
    // Explicit UTF-8 bytes. `writeAsString` defaults to UTF-8 today, but this
    // file declares `encoding="UTF-8"` in its own prologue — a future default
    // change would produce a file that lies about itself.
    await file.writeAsBytes(utf8.encode(xml), flush: true);
    return file;
  }

  /// XML-escapes [raw] and strips characters XML 1.0 cannot represent.
  ///
  /// ORDER IS LOAD-BEARING: `&` MUST be replaced FIRST. Replacing `<` first
  /// produces `&lt;`, and a later `&` pass then rewrites that ampersand into
  /// `&amp;lt;`, so the customer's name imports into Tally as literal `&lt;`.
  ///
  /// The control-character strip is not theoretical: addresses and notes are
  /// routinely pasted out of WhatsApp and Excel, which carry stray 0x0B / 0x1F
  /// bytes. A single one of them makes the entire file unparseable, and Tally's
  /// error points at the byte offset, not the customer.
  @visibleForTesting
  static String escapeXml(String raw) {
    if (raw.isEmpty) return '';

    final sb = StringBuffer();
    for (final rune in raw.runes) {
      // XML 1.0 legal: 0x09, 0x0A, 0x0D, 0x20-0xD7FF, 0xE000-0xFFFD, 0x10000+.
      final isIllegalControl = (rune < 0x20 &&
              rune != 0x09 &&
              rune != 0x0A &&
              rune != 0x0D) ||
          rune == 0x7F ||
          (rune >= 0xD800 && rune <= 0xDFFF) ||
          rune == 0xFFFE ||
          rune == 0xFFFF;
      if (isIllegalControl) continue;

      switch (rune) {
        case 0x26: // &  — FIRST, always.
          sb.write('&amp;');
        case 0x3C: // <
          sb.write('&lt;');
        case 0x3E: // >
          sb.write('&gt;');
        case 0x22: // "
          sb.write('&quot;');
        case 0x27: // '
          sb.write('&apos;');
        default:
          sb.writeCharCode(rune);
      }
    }
    return sb.toString();
  }

  /// `yyyyMMdd` — the only date format Tally's importer accepts here.
  @visibleForTesting
  static String tallyDate(DateTime d) => _tallyDateFormat.format(d);

  /// Makes [raw] safe to use as a file name on Android, Windows and iOS.
  ///
  /// Quote numbers look like `SVU/25-26/0007`. A `/` is fine inside XML but is
  /// a PATH SEPARATOR in a file name — `File('.../SVU/25-26/0007.xml')` throws
  /// because the intermediate directories do not exist. Windows additionally
  /// rejects `\ : * ? " < > |`.
  @visibleForTesting
  static String sanitiseFileName(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return 'export';

    final sb = StringBuffer();
    for (final rune in trimmed.runes) {
      final isReserved = rune == 0x2F || // /
          rune == 0x5C || // \
          rune == 0x3A || // :
          rune == 0x2A || // *
          rune == 0x3F || // ?
          rune == 0x22 || // "
          rune == 0x3C || // <
          rune == 0x3E || // >
          rune == 0x7C || // |
          rune < 0x20;
      sb.writeCharCode(isReserved ? 0x5F : rune); // _
    }

    // A trailing dot or space is silently dropped by Windows, which turns
    // "report .xml" into a name that does not match what we return.
    var out = sb.toString().replaceAll(RegExp(r'[. ]+$'), '');
    if (out.isEmpty) out = 'export';
    return out;
  }
}

/// One `<ALLLEDGERENTRIES.LIST>` worth of data, before it is rendered.
@immutable
class _LedgerLine {
  const _LedgerLine({
    required this.ledger,
    required this.amount,
    required this.debit,
  });

  final String ledger;

  /// Signed as Tally expects: negative = debit, positive = credit.
  final double amount;

  final bool debit;
}
