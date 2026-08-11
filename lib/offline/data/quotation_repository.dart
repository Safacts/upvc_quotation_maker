/// OFFLINE TIER — QUOTATION PERSISTENCE.
///
/// ZERO-SERVER CONTRACT: no `supabase_flutter`, no `http`, no `connectivity_plus`,
/// no `lib/services/**`. See `lib/offline/core/models.dart` for the full rule.
library;

import 'package:flutter/foundation.dart';
import 'package:sqflite/sqflite.dart';

import '../core/models.dart';
import 'offline_db.dart';

/// One row of the quotation list screen.
///
/// WHY a separate class instead of reusing [OfflineQuotation]: rendering the
/// list from full domain objects means loading every measured and unmeasured
/// item of every quotation just to draw a number that is already stored on the
/// header. At 5,000 quotations that is tens of thousands of wasted rows per
/// scroll. This type is exactly what the list cell paints and nothing more.
@immutable
class QuotationSummary {
  const QuotationSummary({
    required this.id,
    required this.quoteNo,
    required this.customerName,
    required this.date,
    required this.status,
    required this.grandTotal,
    required this.itemCount,
  });

  final String id;
  final String quoteNo;
  final String customerName;
  final DateTime date;
  final OfflineQuotationStatus status;

  /// Read from the denormalised `grand_total` column — never recomputed here,
  /// because recomputing would require the child rows this type exists to avoid.
  final double grandTotal;

  /// measured + unmeasured line count, from a correlated subquery.
  final int itemCount;

  /// Tolerant of malformed rows: every field goes through the coercion helpers
  /// in models.dart so one bad row cannot blank the whole list screen.
  factory QuotationSummary.fromRow(Map<String, Object?> m) => QuotationSummary(
        id: asText(m['id']),
        quoteNo: asText(m['quote_no']),
        customerName: asText(m['customer_name']),
        date: DateTime.tryParse(asText(m['date'])) ?? DateTime.now(),
        status: OfflineQuotationStatusX.fromString(m['status'] as String?),
        grandTotal: asDouble(m['grand_total']),
        itemCount: asInt(m['item_count']),
      );
}

/// All reads and writes of quotations and their line items.
class QuotationRepository {
  QuotationRepository([OfflineDb? database])
      : _dbc = database ?? OfflineDb.instance;

  final OfflineDb _dbc;

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  /// Page of list rows, newest first.
  ///
  /// Deliberately ONE query with a correlated subquery for the item count and
  /// zero child-row loading — this is what makes the list screen open instantly
  /// on an old Android phone holding years of history. Paginate with
  /// [limit]/[offset]; loading everything defeats the purpose.
  Future<List<QuotationSummary>> list({
    String? search,
    OfflineQuotationStatus? status,
    int limit = 50,
    int offset = 0,
  }) async {
    final db = await _dbc.db;

    final where = <String>[];
    final args = <Object?>[];

    if (status != null) {
      where.add('q.status = ?');
      args.add(status.value);
    }

    final term = search?.trim() ?? '';
    if (term.isNotEmpty) {
      // Escaped so a customer called "50% Traders" or a quote number with an
      // underscore searches for the literal text instead of a wildcard.
      final pattern = '%${OfflineDb.escapeLike(term)}%';
      // LIKE is already case-insensitive for ASCII in SQLite; LOWER() on both
      // sides keeps it predictable for mixed-case stored data.
      where.add(
        "(LOWER(q.quote_no) LIKE LOWER(?) ESCAPE '\\' "
        "OR LOWER(q.customer_name) LIKE LOWER(?) ESCAPE '\\' "
        "OR LOWER(q.contact_no) LIKE LOWER(?) ESCAPE '\\')",
      );
      args.addAll([pattern, pattern, pattern]);
    }

    final whereSql = where.isEmpty ? '' : 'WHERE ${where.join(' AND ')}';

    final rows = await db.rawQuery(
      '''
      SELECT
        q.id, q.quote_no, q.customer_name, q.date, q.status, q.grand_total,
        (
          (SELECT COUNT(*) FROM ${OfflineDb.tableMeasuredItems} mi
             WHERE mi.quotation_id = q.id)
          +
          (SELECT COUNT(*) FROM ${OfflineDb.tableUnmeasuredItems} ui
             WHERE ui.quotation_id = q.id)
        ) AS item_count
      FROM ${OfflineDb.tableQuotations} q
      $whereSql
      ORDER BY q.created_at DESC
      LIMIT ? OFFSET ?
      ''',
      [...args, limit, offset],
    );

    return rows.map(QuotationSummary.fromRow).toList(growable: false);
  }

  /// Full quotation including both item lists, ordered by `position`.
  ///
  /// `position` is what preserves the order the fabricator typed the windows in
  /// — that order matches the physical site walk-through, so a PDF that
  /// reshuffles it is actively confusing on site.
  Future<OfflineQuotation?> getById(String id) async {
    if (id.isEmpty) return null;
    final db = await _dbc.db;

    final headers = await db.query(
      OfflineDb.tableQuotations,
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );
    if (headers.isEmpty) return null;

    final quotation = OfflineQuotation.fromDb(headers.first);

    final measured = await db.query(
      OfflineDb.tableMeasuredItems,
      where: 'quotation_id = ?',
      whereArgs: [id],
      orderBy: 'position ASC',
    );
    final unmeasured = await db.query(
      OfflineDb.tableUnmeasuredItems,
      where: 'quotation_id = ?',
      whereArgs: [id],
      orderBy: 'position ASC',
    );

    quotation
      ..measuredItems =
          measured.map(OfflineMeasuredItem.fromDb).toList(growable: true)
      ..unmeasuredItems =
          unmeasured.map(OfflineUnmeasuredItem.fromDb).toList(growable: true);

    return quotation;
  }

  // ---------------------------------------------------------------------------
  // Write
  // ---------------------------------------------------------------------------

  /// Insert or update [q] and its items atomically. Returns the id.
  ///
  /// Three deliberate choices:
  /// 1. ONE transaction. A crash between writing the header and the items would
  ///    otherwise leave a quotation whose total says Rs.2,00,000 and whose item
  ///    list is empty — which the owner would send to a customer.
  /// 2. `grand_total` is recomputed from the model getters, never taken from a
  ///    caller. The denormalised column is what the list screen and the
  ///    dashboard totals trust; letting a stale UI value in makes the dashboard
  ///    disagree with the PDF, and the customer believes the PDF.
  /// 3. Delete-then-reinsert the children rather than diffing. Rows are freely
  ///    reordered, inserted and removed in the editor, so a diff would need
  ///    stable ids the UI does not guarantee. Inside a transaction the delete is
  ///    never observable.
  ///
  /// ⚠️ The header is written as an explicit UPDATE-else-INSERT, NOT with
  /// `ConflictAlgorithm.replace`. `INSERT OR REPLACE` resolves a UNIQUE
  /// conflict by DELETING the conflicting row — so saving a new quotation that
  /// reused an existing `quote_no` would have silently destroyed the original
  /// quotation and cascaded away its line items, instead of raising
  /// [DuplicateQuoteNumberException]. The duplicate must fail loudly; it must
  /// never overwrite a document the owner has already sent to a customer.
  Future<String> save(OfflineQuotation q) async {
    final id = (q.id != null && q.id!.isNotEmpty) ? q.id! : OfflineDb.newId();
    q.id = id;
    q.updatedAt = DateTime.now();

    final header = q.toDb()
      ..['id'] = id
      // Recomputed from the items, not trusted from the caller. See above.
      ..['grand_total'] = q.grandTotal;

    try {
      await _dbc.transaction<void>((txn) async {
        // UPDATE first; a 0-row result means this id is new and needs an
        // INSERT. Both statements let a duplicate quote_no hit the UNIQUE
        // index and throw, which is exactly what we want.
        final updated = await txn.update(
          OfflineDb.tableQuotations,
          header,
          where: 'id = ?',
          whereArgs: [id],
        );
        if (updated == 0) {
          // A brand-new row has never been near a server.
          await txn.insert(OfflineDb.tableQuotations, <String, Object?>{
            ...header,
            'sync_status': OfflineDb.defaultSyncStatus,
          });
        } else {
          // Applied as a SEPARATE statement because `header` deliberately
          // carries no `sync_status` key — letting the model's map own that
          // column would let a stale in-memory value overwrite the real sync
          // state. The CASE keeps a never-pushed row on `pending_created`
          // instead of demoting it to `pending_updated`, which would make a
          // future sync engine PATCH a row that does not exist server-side.
          await txn.rawUpdate(
            'UPDATE ${OfflineDb.tableQuotations} '
            'SET ${OfflineDb.syncStatusOnUpdateSql} WHERE id = ?',
            [id],
          );
        }

        await txn.delete(
          OfflineDb.tableMeasuredItems,
          where: 'quotation_id = ?',
          whereArgs: [id],
        );
        await txn.delete(
          OfflineDb.tableUnmeasuredItems,
          where: 'quotation_id = ?',
          whereArgs: [id],
        );

        for (var i = 0; i < q.measuredItems.length; i++) {
          final item = q.measuredItems[i]
            ..position = i
            ..id = (q.measuredItems[i].id?.isNotEmpty ?? false)
                ? q.measuredItems[i].id
                : OfflineDb.newId();
          await txn.insert(OfflineDb.tableMeasuredItems, item.toDb(id));
        }

        for (var i = 0; i < q.unmeasuredItems.length; i++) {
          final item = q.unmeasuredItems[i]
            ..position = i
            ..id = (q.unmeasuredItems[i].id?.isNotEmpty ?? false)
                ? q.unmeasuredItems[i].id
                : OfflineDb.newId();
          await txn.insert(OfflineDb.tableUnmeasuredItems, item.toDb(id));
        }
      });
    } on DatabaseException catch (e) {
      // Translate the storage guarantee into something the UI can act on.
      if (OfflineDb.isDuplicateQuoteNoError(e)) {
        debugPrint('QuotationRepository: duplicate quote_no "${q.quotationNo}"');
        throw DuplicateQuoteNumberException(q.quotationNo);
      }
      rethrow;
    }

    return id;
  }

  /// Remove a quotation. Its item rows go with it via `ON DELETE CASCADE`
  /// (which only works because `PRAGMA foreign_keys = ON` is set on open).
  ///
  /// HARD delete, on purpose — no `pending_deleted` tombstone. See
  /// `OfflineDb.usesSoftDelete` for the full rationale: there is no server to
  /// notify, so a tombstone would only bloat the file and add a
  /// `WHERE deleted_at IS NULL` to every query that somebody will eventually
  /// forget, resurrecting a quotation the owner deleted.
  Future<void> delete(String id) async {
    if (id.isEmpty) return;
    final db = await _dbc.db;
    await db.delete(
      OfflineDb.tableQuotations,
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  // ---------------------------------------------------------------------------
  // Dashboard aggregates
  // ---------------------------------------------------------------------------

  /// Total number of quotations. Aggregated in SQL so the dashboard never has
  /// to page the table into memory to count it.
  Future<int> count() async {
    final db = await _dbc.db;
    final rows = await db
        .rawQuery('SELECT COUNT(*) AS c FROM ${OfflineDb.tableQuotations}');
    return Sqflite.firstIntValue(rows) ?? 0;
  }

  /// Sum of every quotation's grand total (pipeline value).
  ///
  /// Uses the denormalised column — consistent with the list screen by
  /// construction, because [save] is the only writer of that column.
  Future<double> totalValue() async {
    final db = await _dbc.db;
    final rows = await db.rawQuery(
      'SELECT COALESCE(SUM(grand_total), 0) AS t '
      'FROM ${OfflineDb.tableQuotations}',
    );
    return rows.isEmpty ? 0.0 : asDouble(rows.first['t']);
  }

  /// Count per status, with every status present.
  ///
  /// Absent statuses are filled with 0 so the dashboard can render a fixed set
  /// of tiles without null-guarding each one (a missing key rendered as a blank
  /// tile reads as "broken", not as "zero").
  Future<Map<String, int>> countsByStatus() async {
    final db = await _dbc.db;
    final rows = await db.rawQuery(
      'SELECT status, COUNT(*) AS c FROM ${OfflineDb.tableQuotations} '
      'GROUP BY status',
    );

    final result = <String, int>{
      for (final s in OfflineQuotationStatus.values) s.value: 0,
    };
    for (final row in rows) {
      final key = asText(row['status']);
      if (key.isEmpty) continue;
      result[key] = asInt(row['c']);
    }
    return result;
  }

  /// Whether [quoteNo] is already taken, optionally ignoring [exceptId].
  ///
  /// This is a UI convenience for showing "number already used" BEFORE the user
  /// hits save. It is NOT the guarantee — two saves can still interleave between
  /// this check and the insert. The UNIQUE index is the guarantee; this only
  /// makes the common case a friendlier message instead of a caught exception.
  /// [exceptId] exists so re-saving an existing quotation does not collide with
  /// its own row.
  Future<bool> quoteNoExists(String quoteNo, {String? exceptId}) async {
    final trimmed = quoteNo.trim();
    if (trimmed.isEmpty) return false;

    final db = await _dbc.db;
    final where = StringBuffer('quote_no = ?');
    final args = <Object?>[trimmed];
    if (exceptId != null && exceptId.isNotEmpty) {
      where.write(' AND id != ?');
      args.add(exceptId);
    }

    final rows = await db.query(
      OfflineDb.tableQuotations,
      columns: ['id'],
      where: where.toString(),
      whereArgs: args,
      limit: 1,
    );
    return rows.isNotEmpty;
  }
}
