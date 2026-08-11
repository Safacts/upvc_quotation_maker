/// OFFLINE TIER — PAYMENT / RECEIVABLES PERSISTENCE.
///
/// ZERO-SERVER CONTRACT: no `supabase_flutter`, no `http`, no
/// `connectivity_plus`, no `lib/services/**`, no `../../supabase_config.dart`.
/// See `lib/offline/core/models.dart` for the full rule; the build fails on a
/// violation via `test/offline_no_network_test.dart`.
///
/// EVERY AGGREGATE IN THIS FILE IS COMPUTED IN SQL, NOT IN DART.
/// These figures back the dashboard's "outstanding" KPI and the per-row paid
/// badge on the quotation list. Doing them in Dart means loading every receipt
/// the business has ever taken into memory on every dashboard build, which is
/// invisible at 20 rows and a multi-second freeze at the 5,000 a three-year-old
/// fabricator install accumulates.
library;

import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import 'package:sqflite/sqflite.dart';

import '../core/models.dart';
import '../core/payment_models.dart';
import 'offline_db.dart';

/// Thrown by [PaymentRepository.save] when the target quotation does not exist.
///
/// WHY this is a typed, LOUD failure instead of a best-effort write: the
/// `payments.quotation_id` FK would reject the insert anyway, but only as an
/// opaque `DatabaseException` — and only while `PRAGMA foreign_keys = ON` holds
/// (it is per-connection; one missing pragma and SQLite accepts the row
/// silently). An orphan receipt is the worst possible outcome in this tier: it
/// belongs to no document, appears on no screen, is excluded from every
/// per-quotation total, yet still inflates `totalReceived()`. The owner's books
/// then disagree with their own app and nobody can explain why. Checking first
/// turns that into a message the UI can actually show.
class UnknownQuotationException implements Exception {
  const UnknownQuotationException(this.quotationId);

  /// The id that could not be resolved. Empty means none was supplied at all.
  final String quotationId;

  @override
  String toString() => quotationId.isEmpty
      ? 'UnknownQuotationException: a payment must belong to a quotation, but '
          'no quotation id was supplied.'
      : 'UnknownQuotationException: no quotation with id "$quotationId" '
          'exists, so a payment cannot be recorded against it.';
}

/// All reads and writes of payments, plus the receivables aggregates derived
/// from them.
class PaymentRepository {
  PaymentRepository([OfflineDb? database])
      : _dbc = database ?? OfflineDb.instance;

  final OfflineDb _dbc;

  /// SQLite's default `SQLITE_MAX_VARIABLE_NUMBER` is 999.
  ///
  /// ⚠️ Exceeding it does NOT fail at compile time or in a small test — it
  /// throws `too many SQL variables` at RUNTIME, and only once a real install
  /// has accumulated enough rows. That is a crash that appears months after
  /// release, on the client's phone, on the busiest screen. 900 leaves headroom
  /// for the handful of extra bound arguments a query may carry alongside the
  /// id list.
  ///
  /// (SQLite >= 3.32 raised the compiled default to 32766, but `sqflite` uses
  /// the OS-provided SQLite and Android has long shipped the classic 999 cap.
  /// The target device is what matters, not the dev machine — verified against
  /// a limit pinned to 999: a 1,200-variable query throws, a 900 one does not.)
  static const int _maxVariablesPerQuery = 900;

  /// The one date format written to and compared against `payments.date` and
  /// `quotations.date`. Zero-padded `yyyy-MM-dd` is why TEXT comparison is
  /// chronological. See [_dateArg].
  static final DateFormat _dateFmt = DateFormat('yyyy-MM-dd');

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  /// Every receipt against one quotation, oldest first.
  ///
  /// ASC (not DESC like the global list) because this renders the instalment
  /// history on the quotation detail screen, and a payment schedule reads
  /// forwards: advance, then delivery, then completion. `created_at` is the
  /// tie-breaker so two receipts entered on the same DAY keep the order they
  /// were entered in — `date` is date-only, so without it their relative order
  /// is whatever SQLite feels like.
  Future<List<OfflinePayment>> listForQuotation(String quotationId) async {
    if (quotationId.isEmpty) return const <OfflinePayment>[];
    final db = await _dbc.db;
    final rows = await db.query(
      OfflineDb.tablePayments,
      where: 'quotation_id = ?',
      whereArgs: <Object?>[quotationId],
      orderBy: 'date ASC, created_at ASC',
    );
    return rows.map(OfflinePayment.fromDb).toList(growable: false);
  }

  /// Every receipt from one customer, oldest first, optionally date-ranged.
  ///
  /// Reads the denormalised `payments.customer_id` rather than joining through
  /// `quotations`. That column is written by [save] from the quotation itself,
  /// so the two cannot drift.
  Future<List<OfflinePayment>> listForCustomer(
    String customerId, {
    DateTime? from,
    DateTime? to,
  }) async {
    if (customerId.isEmpty) return const <OfflinePayment>[];
    final db = await _dbc.db;

    final where = StringBuffer('customer_id = ?');
    final args = <Object?>[customerId];
    _appendDateRange(where, args, from: from, to: to);

    final rows = await db.query(
      OfflineDb.tablePayments,
      where: where.toString(),
      whereArgs: args,
      orderBy: 'date ASC, created_at ASC',
    );
    return rows.map(OfflinePayment.fromDb).toList(growable: false);
  }

  /// Paged list of all receipts, newest first — the "Payments" / collections
  /// screen.
  ///
  /// [search] matches the payment's own reference and notes AND the owning
  /// quotation's number and customer name, because "find the payment from
  /// Ramesh" and "find the payment for SVU-0348" are the two ways anyone
  /// actually looks for a receipt. Paginated for the same reason the quotation
  /// list is: loading three years of receipts to draw ten rows is what makes an
  /// old phone feel broken.
  Future<List<OfflinePayment>> list({
    DateTime? from,
    DateTime? to,
    String? search,
    int limit = 50,
    int offset = 0,
  }) async {
    final db = await _dbc.db;

    final where = StringBuffer('1 = 1');
    final args = <Object?>[];
    _appendDateRange(where, args, from: from, to: to, column: 'p.date');

    final term = search?.trim() ?? '';
    if (term.isNotEmpty) {
      // Escaped + `ESCAPE '\'`: a customer called "50% Traders" or a cheque
      // reference containing `_` would otherwise be read as wildcards and match
      // essentially everything, which looks like the filter is broken.
      final pattern = '%${OfflineDb.escapeLike(term)}%';
      where.write(
        " AND (LOWER(p.reference) LIKE LOWER(?) ESCAPE '\\'"
        " OR LOWER(p.notes) LIKE LOWER(?) ESCAPE '\\'"
        " OR LOWER(q.quote_no) LIKE LOWER(?) ESCAPE '\\'"
        " OR LOWER(q.customer_name) LIKE LOWER(?) ESCAPE '\\')",
      );
      args.addAll(<Object?>[pattern, pattern, pattern, pattern]);
    }

    // LEFT JOIN, never INNER: the join exists only to widen the search. An
    // INNER JOIN would make a receipt disappear from the list if its quotation
    // row were ever missing, hiding money that was genuinely received.
    final rows = await db.rawQuery(
      '''
      SELECT p.*
      FROM ${OfflineDb.tablePayments} p
      LEFT JOIN ${OfflineDb.tableQuotations} q ON q.id = p.quotation_id
      WHERE ${where.toString()}
      ORDER BY p.date DESC, p.created_at DESC
      LIMIT ? OFFSET ?
      ''',
      <Object?>[...args, limit, offset],
    );

    return rows.map(OfflinePayment.fromDb).toList(growable: false);
  }

  Future<OfflinePayment?> getById(String id) async {
    if (id.isEmpty) return null;
    final db = await _dbc.db;
    final rows = await db.query(
      OfflineDb.tablePayments,
      where: 'id = ?',
      whereArgs: <Object?>[id],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return OfflinePayment.fromDb(rows.first);
  }

  // ---------------------------------------------------------------------------
  // Write
  // ---------------------------------------------------------------------------

  /// Insert or update [payment]. Returns its id.
  ///
  /// Four deliberate guards, each protecting against a failure that is silent
  /// rather than loud:
  ///
  /// 1. **Amount validation** — `NaN`, `Infinity` and negatives are rejected
  ///    with an [ArgumentError]. A single NaN row makes `SUM(amount)` return
  ///    NaN, so EVERY balance, the dashboard's outstanding figure and the whole
  ///    customer ledger read `NaN` — and nothing in the UI points at the one
  ///    bad row. A negative "refund" would quietly understate
  ///    [totalReceived]; refunds need their own explicit concept.
  ///
  /// 2. **The quotation must exist** — otherwise [UnknownQuotationException].
  ///    See that class for why an orphan receipt is the worst outcome here.
  ///
  /// 3. **`customer_id` is taken from the QUOTATION, not from the caller.** The
  ///    UI has no reason to know it and a stale value would file the receipt
  ///    under the wrong customer's ledger. Resolved in the same read that
  ///    validates the quotation, so it costs nothing extra.
  ///
  /// 4. **Explicit UPDATE-else-INSERT, NEVER `ConflictAlgorithm.replace`.**
  ///    `INSERT OR REPLACE` resolves a conflict on ANY uniqueness constraint by
  ///    DELETING the conflicting row. That already cost this codebase a
  ///    near-miss on `quotations.quote_no`. On a table whose rows ARE the
  ///    client's money records — with an FK cascade attached — a replace is a
  ///    delete waiting for a constraint to be added later by someone who
  ///    assumes "replace" means "overwrite".
  Future<String> save(OfflinePayment payment) async {
    // --- Guard 1: the amount must be real money. -----------------------------
    final amount = payment.amount;
    if (amount.isNaN || amount.isInfinite) {
      throw ArgumentError.value(
        amount,
        'payment.amount',
        'Payment amount must be a finite number. A NaN or Infinity here '
            'propagates through every SUM and makes the entire ledger unreadable.',
      );
    }
    if (amount < 0) {
      throw ArgumentError.value(
        amount,
        'payment.amount',
        'Payment amount cannot be negative. Record a refund as its own '
            'transaction; a negative receipt silently understates total collections.',
      );
    }

    final quotationId = payment.quotationId.trim();
    if (quotationId.isEmpty) {
      throw const UnknownQuotationException('');
    }

    final db = await _dbc.db;

    // --- Guards 2 + 3: resolve the parent, and take its customer. ------------
    final parent = await db.query(
      OfflineDb.tableQuotations,
      columns: <String>['id', 'customer_id'],
      where: 'id = ?',
      whereArgs: <Object?>[quotationId],
      limit: 1,
    );
    if (parent.isEmpty) {
      throw UnknownQuotationException(quotationId);
    }
    final resolvedCustomerId = asText(parent.first['customer_id']);

    final id = (payment.id != null && payment.id!.isNotEmpty)
        ? payment.id!
        : OfflineDb.newId();
    payment
      ..id = id
      ..quotationId = quotationId
      ..customerId = resolvedCustomerId
      ..updatedAt = DateTime.now();

    final row = payment.toDb()..['id'] = id;

    // --- Guard 4: UPDATE first; 0 rows affected means it is new. -------------
    final updated = await db.update(
      OfflineDb.tablePayments,
      row,
      where: 'id = ?',
      whereArgs: <Object?>[id],
    );

    if (updated == 0) {
      // A brand-new row has never been near a server, so it takes the
      // `pending_created` default rather than anything the model might carry.
      await db.insert(OfflineDb.tablePayments, <String, Object?>{
        ...row,
        'sync_status': OfflineDb.defaultSyncStatus,
      });
    } else {
      // Applied as a SEPARATE statement because `row` deliberately carries no
      // `sync_status` key — letting the model own that column would let a stale
      // in-memory value overwrite the real sync state. The CASE keeps a
      // never-pushed row on `pending_created` instead of demoting it to
      // `pending_updated`, which would make a future sync engine PATCH a row
      // that does not exist server-side.
      await db.rawUpdate(
        'UPDATE ${OfflineDb.tablePayments} '
        'SET ${OfflineDb.syncStatusOnUpdateSql} WHERE id = ?',
        <Object?>[id],
      );
    }

    return id;
  }

  /// Remove one receipt.
  ///
  /// HARD delete, consistent with the rest of this tier — see
  /// `OfflineDb.usesSoftDelete`. Deleting the owning QUOTATION also removes its
  /// payments, via `ON DELETE CASCADE`, which is only live because
  /// `PRAGMA foreign_keys = ON` is set on every connection in
  /// `OfflineDb._onConfigure`.
  Future<void> delete(String id) async {
    if (id.isEmpty) return;
    final db = await _dbc.db;
    await db.delete(
      OfflineDb.tablePayments,
      where: 'id = ?',
      whereArgs: <Object?>[id],
    );
  }

  // ---------------------------------------------------------------------------
  // Aggregates
  // ---------------------------------------------------------------------------

  /// Total collected against one quotation.
  ///
  /// `COALESCE(SUM(amount), 0)`: `SUM` over ZERO ROWS returns **NULL**, not 0.
  /// `asDouble(null)` happens to give 0.0, but relying on that is luck — the
  /// moment this value is used in an arithmetic SQL expression (as it is in
  /// [totalOutstanding]) the NULL propagates and the whole expression becomes
  /// NULL. Be explicit at every SUM.
  Future<double> paidForQuotation(String quotationId) async {
    if (quotationId.isEmpty) return 0.0;
    final db = await _dbc.db;
    final rows = await db.rawQuery(
      'SELECT COALESCE(SUM(amount), 0) AS t FROM ${OfflineDb.tablePayments} '
      'WHERE quotation_id = ?',
      <Object?>[quotationId],
    );
    return rows.isEmpty ? 0.0 : asDouble(rows.first['t']);
  }

  /// Total collected against MANY quotations, in as few queries as possible.
  ///
  /// ⚠️ THIS MUST NEVER BECOME A LOOP OF [paidForQuotation]. The quotation list
  /// screen calls this once per page of 50 rows; the N+1 version is 50 round
  /// trips per page, 500+ while scrolling, each with its own statement prepare
  /// — the classic reason a list screen that is instant in testing stutters on
  /// a real install.
  ///
  /// Two things make it safe at scale:
  ///  * `GROUP BY quotation_id` — one query returns every total at once.
  ///  * **Chunked at [_maxVariablesPerQuery] (900) ids per query.** SQLite's
  ///    default `SQLITE_MAX_VARIABLE_NUMBER` is 999 and blowing past it throws
  ///    `too many SQL variables` at runtime only, only on a large dataset.
  ///
  /// Every requested id is present in the result, pre-filled with 0.0 when it
  /// has no payments, so callers never null-check and never render a blank
  /// where a "Rs.0 received" belongs. Duplicate and empty ids are dropped.
  Future<Map<String, double>> paidForQuotations(
      List<String> quotationIds) async {
    final result = <String, double>{};

    // Deduplicated: the same id twice would waste a bind slot and could push a
    // borderline page over the variable limit for no reason.
    final ids = <String>{
      for (final id in quotationIds)
        if (id.isNotEmpty) id,
    }.toList(growable: false);

    if (ids.isEmpty) return result;

    // Pre-fill FIRST so an id with no receipts still comes back as 0.0.
    for (final id in ids) {
      result[id] = 0.0;
    }

    final db = await _dbc.db;

    for (var start = 0; start < ids.length; start += _maxVariablesPerQuery) {
      final end = (start + _maxVariablesPerQuery) > ids.length
          ? ids.length
          : start + _maxVariablesPerQuery;
      final chunk = ids.sublist(start, end);
      final placeholders = List<String>.filled(chunk.length, '?').join(',');

      final rows = await db.rawQuery(
        'SELECT quotation_id, COALESCE(SUM(amount), 0) AS t '
        'FROM ${OfflineDb.tablePayments} '
        'WHERE quotation_id IN ($placeholders) '
        'GROUP BY quotation_id',
        <Object?>[...chunk],
      );

      for (final row in rows) {
        final key = asText(row['quotation_id']);
        if (key.isEmpty) continue;
        result[key] = asDouble(row['t']);
      }
    }

    return result;
  }

  /// Grand total + amount paid for one quotation, as a [PaymentSummary].
  ///
  /// ONE query joining the two figures rather than two round trips, so the
  /// total and the paid amount are read at the same instant. Two separate
  /// queries can straddle a concurrent write and produce a summary that never
  /// actually existed (paid > total for a moment), which on a money screen
  /// reads as a bug.
  ///
  /// A missing quotation yields a zeroed summary instead of throwing: this is
  /// called while BUILDING a list row, and a throw there blanks the screen.
  Future<PaymentSummary> summaryFor(String quotationId) async {
    if (quotationId.isEmpty) return PaymentSummary.empty(quotationId);

    final db = await _dbc.db;
    final rows = await db.rawQuery(
      '''
      SELECT
        q.grand_total AS grand_total,
        (SELECT COALESCE(SUM(p.amount), 0)
           FROM ${OfflineDb.tablePayments} p
          WHERE p.quotation_id = q.id) AS paid
      FROM ${OfflineDb.tableQuotations} q
      WHERE q.id = ?
      LIMIT 1
      ''',
      <Object?>[quotationId],
    );

    if (rows.isEmpty) {
      debugPrint(
          'PaymentRepository: summaryFor("$quotationId") — no such quotation');
      return PaymentSummary.empty(quotationId);
    }

    return PaymentSummary(
      quotationId: quotationId,
      grandTotal: asDouble(rows.first['grand_total']),
      paid: asDouble(rows.first['paid']),
    );
  }

  /// All money received, optionally within a date range.
  ///
  /// The range is a TEXT comparison on the zero-padded `yyyy-MM-dd` column and
  /// is INCLUSIVE at both ends — "collections for August" must include the 1st
  /// and the 31st. Filtering in SQL, not in Dart, is the whole reason that
  /// column is stored in a sortable format.
  Future<double> totalReceived({DateTime? from, DateTime? to}) async {
    final db = await _dbc.db;

    final where = StringBuffer('1 = 1');
    final args = <Object?>[];
    _appendDateRange(where, args, from: from, to: to);

    final rows = await db.rawQuery(
      'SELECT COALESCE(SUM(amount), 0) AS t FROM ${OfflineDb.tablePayments} '
      'WHERE ${where.toString()}',
      args,
    );
    return rows.isEmpty ? 0.0 : asDouble(rows.first['t']);
  }

  /// Money still owed to the business across every live quotation.
  ///
  /// `SUM(grand_total) - SUM(payments)` over all quotations whose status is NOT
  /// `lost`.
  ///
  /// ⚠️ **EXCLUDING `lost` IS NOT OPTIONAL.** A lost deal is not a receivable —
  /// nobody is going to pay it. Counting it makes the dashboard's outstanding
  /// figure permanently and increasingly wrong (it can only grow, since lost
  /// quotations are never paid off), and the owner learns to distrust the whole
  /// number. Draft and sent ARE included: a draft is a real intention to bill,
  /// and excluding it would make the figure jump the moment a status changes
  /// without any money moving.
  ///
  /// Computed as a scalar subquery over the SAME filtered set, not as a join —
  /// a `LEFT JOIN` + `SUM(q.grand_total)` would multiply each quotation's total
  /// by its number of payment rows, so a job paid in three instalments would
  /// report three times its value. That is the single easiest way to get this
  /// query wrong and it looks correct until someone pays twice. (Verified: the
  /// join form returns 3x on a 3-instalment job; this form returns the truth.)
  Future<double> totalOutstanding() async {
    final db = await _dbc.db;
    final rows = await db.rawQuery(
      '''
      SELECT
        COALESCE(SUM(q.grand_total), 0)
        - COALESCE((
            SELECT SUM(p.amount)
              FROM ${OfflineDb.tablePayments} p
              JOIN ${OfflineDb.tableQuotations} pq ON pq.id = p.quotation_id
             WHERE pq.status != ?
          ), 0) AS t
      FROM ${OfflineDb.tableQuotations} q
      WHERE q.status != ?
      ''',
      <Object?>[
        OfflineQuotationStatus.lost.value,
        OfflineQuotationStatus.lost.value,
      ],
    );
    return rows.isEmpty ? 0.0 : asDouble(rows.first['t']);
  }

  /// Number of receipts recorded. Counted in SQL so the dashboard never pages
  /// the table into memory just to size it.
  Future<int> count() async {
    final db = await _dbc.db;
    final rows = await db
        .rawQuery('SELECT COUNT(*) AS c FROM ${OfflineDb.tablePayments}');
    return Sqflite.firstIntValue(rows) ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Customer ledger
  // ---------------------------------------------------------------------------

  /// A full customer statement: every quotation raised (debit) and every rupee
  /// received (credit), merged into one chronological list with a running
  /// balance.
  ///
  /// Ordering rules, both of which matter:
  ///  * **date ASC** — a statement reads forwards.
  ///  * **quotation BEFORE payment on the SAME date.** `payments.date` is
  ///    date-only, so a job quoted and paid in full the same day has two
  ///    entries on one date. Payment-first would show the running balance
  ///    dipping to -Rs.50,000 and back to zero, which reads as though the
  ///    business took money it had not billed for. Quotation-first reads
  ///    +50,000 then 0.
  ///
  /// `lost` quotations are EXCLUDED from the debit side, for the same reason
  /// [totalOutstanding] excludes them — the customer was never billed for a
  /// deal that did not happen. Any payment that somehow exists against a lost
  /// quotation is still counted as a credit: the money really was received, and
  /// hiding it would make the statement disagree with the bank.
  ///
  /// [customerName] resolves from the `customers` table, falling back to the
  /// most recent quotation's `customer_name`. Quotations deliberately carry NO
  /// FK to customers (a quotation is a historical document and keeps its own
  /// copy of the name), so a customer deleted from the address book still has a
  /// perfectly valid, fully-named ledger.
  Future<CustomerLedger> customerLedger(
    String customerId, {
    DateTime? from,
    DateTime? to,
  }) async {
    if (customerId.isEmpty) return CustomerLedger.empty(customerId);

    final db = await _dbc.db;

    // --- Debits: quotations raised. -----------------------------------------
    final qWhere = StringBuffer('customer_id = ? AND status != ?');
    final qArgs = <Object?>[customerId, OfflineQuotationStatus.lost.value];
    _appendDateRange(qWhere, qArgs, from: from, to: to);

    final quotationRows = await db.query(
      OfflineDb.tableQuotations,
      columns: <String>[
        'id',
        'quote_no',
        'date',
        'grand_total',
        'status',
        'customer_name',
        'created_at',
      ],
      where: qWhere.toString(),
      whereArgs: qArgs,
      orderBy: 'date ASC, created_at ASC',
    );

    // --- Credits: payments received. ----------------------------------------
    final pWhere = StringBuffer('p.customer_id = ?');
    final pArgs = <Object?>[customerId];
    _appendDateRange(pWhere, pArgs, from: from, to: to, column: 'p.date');

    final paymentRows = await db.rawQuery(
      '''
      SELECT p.*, q.quote_no AS quote_no
      FROM ${OfflineDb.tablePayments} p
      LEFT JOIN ${OfflineDb.tableQuotations} q ON q.id = p.quotation_id
      WHERE ${pWhere.toString()}
      ORDER BY p.date ASC, p.created_at ASC
      ''',
      pArgs,
    );

    // --- Merge. --------------------------------------------------------------
    // Sorted as one list rather than interleaved by hand: `date` is date-only,
    // so the two streams genuinely overlap and a manual merge would need the
    // same comparator anyway.
    final staged = <_LedgerStage>[];

    for (final row in quotationRows) {
      final date = parsePaymentDate(row['date']);
      final quoteNo = asText(row['quote_no']);
      staged.add(_LedgerStage(
        date: date,
        // 0 sorts before 1 -> quotation before payment on the same date.
        typeOrder: 0,
        tieBreak: asText(row['created_at']),
        type: kLedgerTypeQuotation,
        ref: quoteNo.isEmpty ? '(no number)' : quoteNo,
        description: 'Quotation${quoteNo.isEmpty ? '' : ' $quoteNo'}',
        debit: asDouble(row['grand_total']),
        credit: 0,
      ));
    }

    for (final row in paymentRows) {
      final payment = OfflinePayment.fromDb(row);
      final quoteNo = asText(row['quote_no']);
      // A cheque number is what the owner recognises; the method label is the
      // fallback so the column is never blank (a blank ref reads as data loss).
      final ref = payment.reference.trim().isNotEmpty
          ? payment.reference.trim()
          : payment.method.label;
      staged.add(_LedgerStage(
        date: payment.date,
        typeOrder: 1,
        tieBreak: payment.createdAt.toIso8601String(),
        type: kLedgerTypePayment,
        ref: ref,
        description: 'Payment received (${payment.method.label})'
            '${quoteNo.isEmpty ? '' : ' against $quoteNo'}',
        debit: 0,
        credit: payment.amount,
      ));
    }

    staged.sort(_LedgerStage.compare);

    var running = 0.0;
    var totalDebit = 0.0;
    var totalCredit = 0.0;
    final entries = <LedgerEntry>[];

    for (final s in staged) {
      totalDebit += s.debit;
      totalCredit += s.credit;
      // Accumulated on the running value rather than recomputed as
      // (totalDebit - totalCredit) so the intent — "balance after this row" —
      // is explicit and cannot drift if a future entry type touches both sides.
      running += s.debit - s.credit;
      entries.add(LedgerEntry(
        date: s.date,
        type: s.type,
        ref: s.ref,
        description: s.description,
        debit: s.debit,
        credit: s.credit,
        runningBalance: running,
      ));
    }

    return CustomerLedger(
      customerId: customerId,
      customerName: await _resolveCustomerName(customerId, quotationRows),
      entries: List<LedgerEntry>.unmodifiable(entries),
      totalDebit: totalDebit,
      totalCredit: totalCredit,
    );
  }

  /// Name for the statement header.
  ///
  /// Address book first; then the most recent quotation's stored name (which
  /// survives the customer being deleted); then a placeholder, because a
  /// statement with a blank header is unusable as a document.
  Future<String> _resolveCustomerName(
    String customerId,
    List<Map<String, Object?>> quotationRows,
  ) async {
    final db = await _dbc.db;
    final rows = await db.query(
      OfflineDb.tableCustomers,
      columns: <String>['name'],
      where: 'id = ?',
      whereArgs: <Object?>[customerId],
      limit: 1,
    );
    if (rows.isNotEmpty) {
      final name = asText(rows.first['name']).trim();
      if (name.isNotEmpty) return name;
    }

    // Fallback: latest quotation wins, so a corrected spelling is the one shown.
    for (final row in quotationRows.reversed) {
      final name = asText(row['customer_name']).trim();
      if (name.isNotEmpty) return name;
    }

    // Last resort: the ledger may be date-filtered to a window containing no
    // quotations at all (payments only), so ask the table directly.
    // NOTE the SINGLE quotes in `customer_name != ''`. Double quotes in SQLite
    // denote an IDENTIFIER, so `customer_name != ""` compares the column to
    // ITSELF — always false — and this clause would silently match nothing.
    // That exact bug has already been fixed once in this repo.
    final any = await db.query(
      OfflineDb.tableQuotations,
      columns: <String>['customer_name'],
      where: "customer_id = ? AND customer_name != ''",
      whereArgs: <Object?>[customerId],
      orderBy: 'date DESC, created_at DESC',
      limit: 1,
    );
    if (any.isNotEmpty) {
      final name = asText(any.first['customer_name']).trim();
      if (name.isNotEmpty) return name;
    }

    return 'Unknown customer';
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /// Append an INCLUSIVE `date >= ? AND date <= ?` filter.
  ///
  /// ⚠️ Compares TEXT, and the arguments are formatted with the SAME
  /// `yyyy-MM-dd` pattern the column is written with. That is the entire reason
  /// the column stores a zero-padded, sortable format: `'2026-08-09' <
  /// '2026-08-10'` is true as a string. Never "fix" this by loading rows and
  /// comparing parsed `DateTime`s in Dart — that pulls every receipt ever taken
  /// into memory to answer a question SQLite answers from an index.
  void _appendDateRange(
    StringBuffer where,
    List<Object?> args, {
    DateTime? from,
    DateTime? to,
    String column = 'date',
  }) {
    if (from != null) {
      where.write(' AND $column >= ?');
      args.add(_dateArg(from));
    }
    if (to != null) {
      // `<=` and date-only on both sides, so a payment taken on the last day of
      // the range is included. Comparing against an ISO timestamp instead would
      // silently drop it.
      where.write(' AND $column <= ?');
      args.add(_dateArg(to));
    }
  }

  static String _dateArg(DateTime d) => _dateFmt.format(d);
}

/// A ledger row before its running balance is known.
///
/// Private staging type: [LedgerEntry] is immutable and requires
/// `runningBalance`, which only exists once the whole list is ordered.
@immutable
class _LedgerStage {
  const _LedgerStage({
    required this.date,
    required this.typeOrder,
    required this.tieBreak,
    required this.type,
    required this.ref,
    required this.description,
    required this.debit,
    required this.credit,
  });

  final DateTime date;

  /// 0 = quotation, 1 = payment. Orders a bill before its same-day settlement.
  final int typeOrder;

  /// `created_at`, the final tie-break so two same-day, same-type rows keep
  /// entry order instead of an arbitrary one.
  final String tieBreak;

  final String type;
  final String ref;
  final String description;
  final double debit;
  final double credit;

  static int compare(_LedgerStage a, _LedgerStage b) {
    // Compared as DAYS: `payments.date` is date-only (parsed to midnight) while
    // a quotation's date may carry a time from a legacy ISO value. Comparing
    // raw DateTimes would then sort a 14:30 quotation AFTER a midnight payment
    // on the same day, defeating the typeOrder rule entirely.
    final byDate = paymentDateOnly(a.date).compareTo(paymentDateOnly(b.date));
    if (byDate != 0) return byDate;
    final byType = a.typeOrder.compareTo(b.typeOrder);
    if (byType != 0) return byType;
    return a.tieBreak.compareTo(b.tieBreak);
  }
}
