/// OFFLINE TIER — REPORTS / ANALYTICS DATA LAYER.
///
/// ZERO-SERVER CONTRACT: no `supabase_flutter`, no `http`, no `connectivity_plus`,
/// no `lib/services/**`. See `lib/offline/core/models.dart` for the full rule.
///
/// Pure data: every figure below is computed with `SUM`/`COUNT`/`GROUP BY`
/// inside SQLite. Nothing is folded in Dart — loading 5,000 quotations into
/// memory to add them up freezes the UI thread on a cheap phone, which is the
/// exact device this tier is sold for.
library;

import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';

import '../core/models.dart';
import '../data/offline_db.dart';
import '../data/payment_repository.dart';

// ---------------------------------------------------------------------------
// Report value types — all immutable.
// ---------------------------------------------------------------------------

/// The Summary tab: headline figures for the selected date range.
@immutable
class SalesSummary {
  const SalesSummary({
    required this.totalCount,
    required this.totalValue,
    required this.countByStatus,
    required this.valueByStatus,
    required this.winRate,
    required this.averageValue,
    required this.received,
    required this.outstanding,
  });

  final int totalCount;
  final double totalValue;

  /// Count per status. All four statuses are ALWAYS present (0-filled by the
  /// service) so the UI renders fixed tiles without null-guarding each key.
  final Map<String, int> countByStatus;

  /// Value per status. Same guarantee — all four keys present.
  final Map<String, double> valueByStatus;

  /// `won / (won + lost) * 100`, or `null` when nothing has been decided yet.
  /// Showing "0%" before a single deal closes makes the owner look like they
  /// lose everything, so the UI renders a placeholder instead.
  final double? winRate;

  /// `totalValue / totalCount`, or `0` when there are no quotations.
  final double averageValue;

  /// Payments actually received in the selected range.
  final double received;

  /// Money still owed on non-lost quotations (all-time snapshot from the
  /// payment repository — see [PaymentRepository.totalOutstanding]).
  final double outstanding;
}

/// One month of the trend chart.
@immutable
class MonthlyPoint {
  const MonthlyPoint({
    required this.month,
    required this.quotationCount,
    required this.quotedValue,
    required this.receivedValue,
  });

  /// First day of the month (day always 1).
  final DateTime month;
  final int quotationCount;
  final double quotedValue;
  final double receivedValue;
}

/// One row of the "top customers" table.
@immutable
class CustomerReportRow {
  const CustomerReportRow({
    required this.customerId,
    required this.customerName,
    required this.quotationCount,
    required this.totalValue,
    required this.paidValue,
  });

  final String customerId;
  final String customerName;
  final int quotationCount;
  final double totalValue;
  final double paidValue;

  double get balance => totalValue - paidValue;
}

/// One row of the "top products" table.
@immutable
class ProductReportRow {
  const ProductReportRow({
    required this.description,
    required this.lineCount,
    required this.totalUnits,
    required this.totalValue,
  });

  /// Representative (original-cased) description for the group.
  final String description;

  /// How many line items across all quotations rolled into this group.
  final int lineCount;
  final double totalUnits;
  final double totalValue;
}

/// One row of the outstanding-receivables table.
@immutable
class OutstandingRow {
  const OutstandingRow({
    required this.quotationId,
    required this.quoteNo,
    required this.customerName,
    required this.date,
    required this.grandTotal,
    required this.paid,
  });

  final String quotationId;
  final String quoteNo;
  final String customerName;
  final DateTime date;
  final double grandTotal;
  final double paid;

  double get balance => grandTotal - paid;
  int get ageDays => DateTime.now().difference(date).inDays;
}

/// GST taxable/value breakdown for the GST tab.
@immutable
class GstSummary {
  const GstSummary({
    required this.taxableValue,
    required this.gstAmount,
    required this.totalWithGst,
    required this.quotationCount,
  });

  final double taxableValue;
  final double gstAmount;
  final double totalWithGst;
  final int quotationCount;
}

// ---------------------------------------------------------------------------
// Report service
// ---------------------------------------------------------------------------

class ReportService {
  ReportService([OfflineDb? database])
      : _dbc = database ?? OfflineDb.instance,
        _payments = PaymentRepository(database);

  final OfflineDb _dbc;
  final PaymentRepository _payments;

  // -------------------------------------------------------------------------
  // Shared helpers
  // -------------------------------------------------------------------------

  /// Appends a `column >= ? AND column <= ?` date filter (only the bounds that
  /// are supplied) to [clauses]/[args]. Dates compare as the zero-padded
  /// 'yyyy-MM-dd' TEXT the `date` column is stored in, so the comparison is
  /// lexicographically correct and index-friendly — no parsing, no
  /// load-then-filter in Dart.
  void _dateWhere(
    List<String> clauses,
    List<Object?> args,
    DateTime? from,
    DateTime? to, {
    String column = 'date',
  }) {
    if (from != null) {
      clauses.add('$column >= ?');
      args.add(DateFormat('yyyy-MM-dd').format(from));
    }
    if (to != null) {
      clauses.add('$column <= ?');
      args.add(DateFormat('yyyy-MM-dd').format(to));
    }
  }

  /// Runs a raw query and returns the rows. Isolated so every read path has a
  /// single place to log failures without leaking them to the UI.
  Future<List<Map<String, Object?>>> _query(
    String sql, [
    List<Object?>? args,
  ]) async {
    final db = await _dbc.db;
    return db.rawQuery(sql, args);
  }

  // -------------------------------------------------------------------------
  // Sales summary
  // -------------------------------------------------------------------------

  Future<SalesSummary> salesSummary({DateTime? from, DateTime? to}) async {
    final clauses = <String>[];
    final args = <Object?>[];
    _dateWhere(clauses, args, from, to);
    final whereSql = clauses.isEmpty ? '' : 'WHERE ${clauses.join(' AND ')}';

    final rows = await _query(
      'SELECT status, COUNT(*) AS c, COALESCE(SUM(grand_total), 0) AS v '
      'FROM ${OfflineDb.tableQuotations} $whereSql '
      'GROUP BY status',
      args,
    );

    final countByStatus = <String, int>{
      for (final s in OfflineQuotationStatus.values) s.value: 0,
    };
    final valueByStatus = <String, double>{
      for (final s in OfflineQuotationStatus.values) s.value: 0.0,
    };

    var totalCount = 0;
    var totalValue = 0.0;
    for (final row in rows) {
      final status = asText(row['status']);
      final c = asInt(row['c']);
      final v = asDouble(row['v']);
      if (status.isEmpty) continue;
      countByStatus[status] = c;
      valueByStatus[status] = v;
      totalCount += c;
      totalValue += v;
    }

    final won = countByStatus[OfflineQuotationStatus.won.value] ?? 0;
    final lost = countByStatus[OfflineQuotationStatus.lost.value] ?? 0;
    final decided = won + lost;
    final winRate = decided == 0 ? null : (won / decided) * 100.0;
    final averageValue = totalCount == 0 ? 0.0 : totalValue / totalCount;

    final received = await _payments.totalReceived(from: from, to: to);
    final outstanding = await _payments.totalOutstanding();

    return SalesSummary(
      totalCount: totalCount,
      totalValue: totalValue,
      countByStatus: countByStatus,
      valueByStatus: valueByStatus,
      winRate: winRate,
      averageValue: averageValue,
      received: received,
      outstanding: outstanding,
    );
  }

  // -------------------------------------------------------------------------
  // Monthly trend
  // -------------------------------------------------------------------------

  /// Returns one [MonthlyPoint] per month for the last [months] months,
  /// **including empty months** (0 count, 0 value). A `GROUP BY` only returns
  /// months that have data, so the spine is built in Dart first and the SQL
  /// result is left-joined onto it.
  Future<List<MonthlyPoint>> monthlyTrend({int months = 12}) async {
    final now = DateTime.now();

    // Spine: oldest month first so a left-to-right chart reads naturally.
    final spine = <_MonthRef>[];
    for (var i = months - 1; i >= 0; i--) {
      final m = DateTime(now.year, now.month - i, 1);
      spine.add(_MonthRef(m, DateFormat('yyyy-MM').format(m)));
    }

    final fromStr = DateFormat('yyyy-MM-dd').format(spine.first.date);
    final toStr = DateFormat('yyyy-MM-dd').format(
      DateTime(now.year, now.month + 1, 0), // last day of current month
    );

    // Quotations per month. Bucketing uses substr(date,1,7) ('yyyy-MM') — the
    // column is already sortable text, so no strftime/parsing is needed.
    final quoteRows = await _query(
      'SELECT substr(date, 1, 7) AS month, COUNT(*) AS c, '
      'COALESCE(SUM(grand_total), 0) AS v '
      'FROM ${OfflineDb.tableQuotations} '
      'WHERE date >= ? AND date <= ? '
      'GROUP BY substr(date, 1, 7)',
      [fromStr, toStr],
    );
    final quoteMap = <String, _QuoteAgg>{};
    for (final row in quoteRows) {
      final key = asText(row['month']);
      if (key.isEmpty) continue;
      quoteMap[key] = _QuoteAgg(asInt(row['c']), asDouble(row['v']));
    }

    // Payments per month.
    final payRows = await _query(
      'SELECT substr(date, 1, 7) AS month, COALESCE(SUM(amount), 0) AS v '
      'FROM ${OfflineDb.tablePayments} '
      'WHERE date >= ? AND date <= ? '
      'GROUP BY substr(date, 1, 7)',
      [fromStr, toStr],
    );
    final payMap = <String, double>{};
    for (final row in payRows) {
      final key = asText(row['month']);
      if (key.isEmpty) continue;
      payMap[key] = asDouble(row['v']);
    }

    // Left-join SQL results onto the spine. Missing months stay at zero.
    return [
      for (final ref in spine)
        MonthlyPoint(
          month: ref.date,
          quotationCount: quoteMap[ref.key]?.count ?? 0,
          quotedValue: quoteMap[ref.key]?.value ?? 0.0,
          receivedValue: payMap[ref.key] ?? 0.0,
        ),
    ];
  }

  // -------------------------------------------------------------------------
  // Top customers
  // -------------------------------------------------------------------------

  Future<List<CustomerReportRow>> topCustomers({
    DateTime? from,
    DateTime? to,
    int limit = 20,
  }) async {
    final clauses = <String>[];
    final args = <Object?>[];
    _dateWhere(clauses, args, from, to, column: 'q.date');
    final whereSql = clauses.isEmpty ? '' : 'WHERE ${clauses.join(' AND ')}';

    // Customers INNER JOIN quotations (only customers with quotations in range
    // are "top") and LEFT JOIN pre-aggregated payments per quotation so a
    // customer with zero payments still appears with paidValue 0. Payments are
    // pre-aggregated in the subquery so the join does not fan out (which would
    // otherwise multiply grand_total by the number of payment rows).
    final rows = await _query(
      '''
      SELECT c.id AS customer_id, c.name AS customer_name,
        COUNT(q.id) AS quotation_count,
        COALESCE(SUM(q.grand_total), 0) AS total_value,
        COALESCE(SUM(p.paid), 0) AS paid_value
      FROM ${OfflineDb.tableCustomers} c
      INNER JOIN ${OfflineDb.tableQuotations} q ON q.customer_id = c.id
      LEFT JOIN (
        SELECT quotation_id, SUM(amount) AS paid
        FROM ${OfflineDb.tablePayments}
        GROUP BY quotation_id
      ) p ON p.quotation_id = q.id
      $whereSql
      GROUP BY c.id
      ORDER BY total_value DESC
      LIMIT ?
      ''',
      [...args, limit],
    );

    return [
      for (final row in rows)
        CustomerReportRow(
          customerId: asText(row['customer_id']),
          customerName: asText(row['customer_name']),
          quotationCount: asInt(row['quotation_count']),
          totalValue: asDouble(row['total_value']),
          paidValue: asDouble(row['paid_value']),
        ),
    ];
  }

  // -------------------------------------------------------------------------
  // Top products
  // -------------------------------------------------------------------------

  Future<List<ProductReportRow>> topProducts({
    DateTime? from,
    DateTime? to,
    int limit = 20,
  }) async {
    final clauses = <String>[];
    final dateArgs = <Object?>[];
    _dateWhere(clauses, dateArgs, from, to, column: 'q.date');
    final dateWhere = clauses.isEmpty ? '' : 'WHERE ${clauses.join(' AND ')}';

    // Measured + unmeasured line items grouped by TRIMMED, LOWERCASED
    // description (line items carry no product FK — they are free text).
    // Measured value = width/304.8 * height/304.8 * units * rate; the
    // multiplication order is the pricing parity contract in models.dart and
    // MUST NOT be reordered (IEEE-754 float multiplication is not associative;
    // a reorder moves the result by a paisa). The order below is exactly the
    // Dart order `((w/304.8)*(h/304.8))*units*rate`.
    //
    // The date filter references q.date and is applied to BOTH subqueries, so
    // the same [dateArgs] list appears twice in the bound-args array.
    final rows = await _query(
      '''
      SELECT LOWER(TRIM(description)) AS desc_key,
        MAX(TRIM(description)) AS description,
        COUNT(*) AS line_count,
        SUM(units) AS total_units,
        SUM(value) AS total_value
      FROM (
        SELECT mi.description, mi.units,
          (mi.width / 304.8) * (mi.height / 304.8) * mi.units * mi.rate AS value
        FROM ${OfflineDb.tableMeasuredItems} mi
        INNER JOIN ${OfflineDb.tableQuotations} q ON mi.quotation_id = q.id
        $dateWhere
        UNION ALL
        SELECT ui.description, ui.units,
          ui.units * ui.rate AS value
        FROM ${OfflineDb.tableUnmeasuredItems} ui
        INNER JOIN ${OfflineDb.tableQuotations} q ON ui.quotation_id = q.id
        $dateWhere
      )
      GROUP BY desc_key
      ORDER BY total_value DESC
      LIMIT ?
      ''',
      [...dateArgs, ...dateArgs, limit],
    );

    return [
      for (final row in rows)
        ProductReportRow(
          description: asText(row['description']),
          lineCount: asInt(row['line_count']),
          totalUnits: asDouble(row['total_units']),
          totalValue: asDouble(row['total_value']),
        ),
    ];
  }

  // -------------------------------------------------------------------------
  // Outstanding receivables
  // -------------------------------------------------------------------------

  Future<List<OutstandingRow>> outstanding({int limit = 200}) async {
    // A lost deal is not a receivable — it is excluded here. Fully paid
    // quotations (paid >= grand_total) are also excluded: there is nothing
    // outstanding on them.
    final rows = await _query(
      '''
      SELECT q.id AS quotation_id, q.quote_no, q.customer_name, q.date,
        q.grand_total, COALESCE(p.paid, 0) AS paid
      FROM ${OfflineDb.tableQuotations} q
      LEFT JOIN (
        SELECT quotation_id, SUM(amount) AS paid
        FROM ${OfflineDb.tablePayments}
        GROUP BY quotation_id
      ) p ON p.quotation_id = q.id
      WHERE q.status != 'lost'
        AND COALESCE(p.paid, 0) < q.grand_total
      ORDER BY q.date ASC
      LIMIT ?
      ''',
      [limit],
    );

    return [
      for (final row in rows)
        OutstandingRow(
          quotationId: asText(row['quotation_id']),
          quoteNo: asText(row['quote_no']),
          customerName: asText(row['customer_name']),
          date: DateTime.tryParse(asText(row['date'])) ?? DateTime.now(),
          grandTotal: asDouble(row['grand_total']),
          paid: asDouble(row['paid']),
        ),
    ];
  }

  // -------------------------------------------------------------------------
  // GST summary
  // -------------------------------------------------------------------------

  Future<GstSummary> gstSummary({DateTime? from, DateTime? to}) async {
    // Only quotations where include_gst = 1. The GST component is back-derived
    // from the stored grand_total (the number the customer was actually shown,
    // so it is the one that must reconcile):
    //   igst = (actual + transport) * pct/100
    //   grandTotal = actual + transport + igst = (actual+transport)*(1+pct/100)
    //   => gstAmount = grandTotal * pct / (100 + pct)
    //   => taxableValue = grandTotal - gstAmount.
    // We compute gstAmount per-row in SQL, then taxableValue = total - gst in
    // Dart so the two are guaranteed to reconcile (one division, then a
    // subtraction — no double rounding).
    //
    // The division is guarded: a zero denominator (pct == -100, nonsensical
    // data) would otherwise produce NaN and corrupt the SUM.
    final clauses = <String>['include_gst = 1'];
    final args = <Object?>[];
    _dateWhere(clauses, args, from, to);
    final whereSql = 'WHERE ${clauses.join(' AND ')}';

    final rows = await _query(
      '''
      SELECT COUNT(*) AS c,
        COALESCE(SUM(
          CASE WHEN (100.0 + gst_percentage) = 0 THEN 0
          ELSE grand_total * gst_percentage / (100.0 + gst_percentage) END
        ), 0) AS gst_amount,
        COALESCE(SUM(grand_total), 0) AS total_with_gst
      FROM ${OfflineDb.tableQuotations}
      $whereSql
      ''',
      args,
    );

    final row = rows.first;
    final totalWithGst = asDouble(row['total_with_gst']);
    final gstAmount = asDouble(row['gst_amount']);
    final taxableValue = totalWithGst - gstAmount;

    return GstSummary(
      taxableValue: taxableValue,
      gstAmount: gstAmount,
      totalWithGst: totalWithGst,
      quotationCount: asInt(row['c']),
    );
  }
}

// ---------------------------------------------------------------------------
// Small private aggregation structs.
// ---------------------------------------------------------------------------

class _MonthRef {
  const _MonthRef(this.date, this.key);
  final DateTime date;
  final String key;
}

class _QuoteAgg {
  const _QuoteAgg(this.count, this.value);
  final int count;
  final double value;
}
