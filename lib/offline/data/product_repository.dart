/// OFFLINE TIER — PRODUCT (RATE CARD) PERSISTENCE.
///
/// ZERO-SERVER CONTRACT: no `supabase_flutter`, no `http`, no `connectivity_plus`,
/// no `lib/services/**`. See `lib/offline/core/models.dart` for the full rule.
library;

import 'package:sqflite/sqflite.dart';

import '../core/models.dart';
import 'offline_db.dart';

/// The rate card the quotation editor picks from.
///
/// The `unit` column drives which section of a quotation a product belongs to:
/// `sft` products are priced by area and feed the MEASURED table, everything
/// else is priced per piece and feeds the UNMEASURED table. That split mirrors
/// `OfflineProduct.isMeasured`, and both must agree or a window ends up priced
/// as a single item.
class ProductRepository {
  ProductRepository([OfflineDb? database])
      : _dbc = database ?? OfflineDb.instance;

  final OfflineDb _dbc;

  /// The rate card, filtered.
  ///
  /// [activeOnly] defaults to true because the picker must never offer a
  /// discontinued product; the settings screen passes false to let the owner
  /// see and reactivate them. Deactivation is used instead of deletion so old
  /// quotations remain explicable.
  Future<List<OfflineProduct>> list({
    bool activeOnly = true,
    String? unit,
    String? search,
  }) async {
    final db = await _dbc.db;

    final where = <String>[];
    final args = <Object?>[];

    if (activeOnly) {
      where.add('is_active = 1');
    }

    if (unit != null) {
      final u = unit.trim().toLowerCase();
      if (u == 'sft') {
        where.add("LOWER(unit) = 'sft'");
      } else if (u.isNotEmpty) {
        where.add('LOWER(unit) = ?');
        args.add(u);
      }
    }

    final term = search?.trim() ?? '';
    if (term.isNotEmpty) {
      // Escaped: a product coded "SW_2T" must not wildcard-match everything.
      final pattern = '%${OfflineDb.escapeLike(term)}%';
      where.add(
        "(LOWER(name) LIKE LOWER(?) ESCAPE '\\' "
        "OR LOWER(code) LIKE LOWER(?) ESCAPE '\\' "
        "OR LOWER(category) LIKE LOWER(?) ESCAPE '\\')",
      );
      args.addAll([pattern, pattern, pattern]);
    }

    final rows = await db.query(
      OfflineDb.tableProducts,
      where: where.isEmpty ? null : where.join(' AND '),
      whereArgs: args.isEmpty ? null : args,
      orderBy: 'category ASC, name ASC',
    );

    return rows.map(OfflineProduct.fromDb).toList(growable: false);
  }

  /// Products priced by area — the MEASURED picker.
  Future<List<OfflineProduct>> measured({
    bool activeOnly = true,
    String? search,
  }) =>
      list(activeOnly: activeOnly, unit: 'sft', search: search);

  /// Products priced per piece — the UNMEASURED picker.
  ///
  /// Written as a raw query rather than via [list] because it is a negation.
  /// SQLITE GOTCHA: the string literal MUST use single quotes. `unit != ""` is
  /// parsed as a comparison against an *identifier* named `unit`, which is
  /// always false — so the filter silently returns nothing (or, under SQLite's
  /// legacy double-quote fallback, quietly works on some builds and not others).
  Future<List<OfflineProduct>> unmeasured({
    bool activeOnly = true,
    String? search,
  }) async {
    final db = await _dbc.db;

    final where = <String>["LOWER(unit) != 'sft'", "unit != ''"];
    final args = <Object?>[];

    if (activeOnly) where.add('is_active = 1');

    final term = search?.trim() ?? '';
    if (term.isNotEmpty) {
      final pattern = '%${OfflineDb.escapeLike(term)}%';
      where.add(
        "(LOWER(name) LIKE LOWER(?) ESCAPE '\\' "
        "OR LOWER(code) LIKE LOWER(?) ESCAPE '\\' "
        "OR LOWER(category) LIKE LOWER(?) ESCAPE '\\')",
      );
      args.addAll([pattern, pattern, pattern]);
    }

    final rows = await db.query(
      OfflineDb.tableProducts,
      where: where.join(' AND '),
      whereArgs: args.isEmpty ? null : args,
      orderBy: 'category ASC, name ASC',
    );

    return rows.map(OfflineProduct.fromDb).toList(growable: false);
  }

  /// A single product, or null when the id is unknown.
  Future<OfflineProduct?> getById(String id) async {
    if (id.isEmpty) return null;
    final db = await _dbc.db;
    final rows = await db.query(
      OfflineDb.tableProducts,
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );
    return rows.isEmpty ? null : OfflineProduct.fromDb(rows.first);
  }

  /// Insert or update a rate-card entry. Returns the id.
  ///
  /// `unit` is normalised to lowercase on the way in: the seed writes `sft` but
  /// a hand-typed `SFT` would fail the measured/unmeasured split and land a
  /// window in the per-piece table with a per-sqft rate — a silent, large
  /// mispricing rather than a visible error.
  Future<String> save(OfflineProduct product) async {
    final db = await _dbc.db;

    final id = (product.id != null && product.id!.isNotEmpty)
        ? product.id!
        : OfflineDb.newId();

    final unit = product.unit.trim().toLowerCase();
    product
      ..id = id
      ..unit = unit.isEmpty ? 'sft' : unit
      ..updatedAt = DateTime.now();

    final row = product.toDb()..['id'] = id;

    // UPDATE-else-INSERT rather than `ConflictAlgorithm.replace`.
    //
    // WHY the change (10-08-2026, offline DB v2): `INSERT OR REPLACE` resolves
    // a conflict by DELETING the existing row and inserting a new one, which
    // would destroy that row's `sync_status` and `server_updated_at` on every
    // rate edit. A product already pushed to a server would silently come back
    // as `pending_created`, and a future sync engine would try to CREATE a
    // duplicate of it. Updating in place keeps the sync state intact.
    final updated = await db.update(
      OfflineDb.tableProducts,
      row,
      where: 'id = ?',
      whereArgs: [id],
    );

    if (updated == 0) {
      // Never been near a server.
      await db.insert(OfflineDb.tableProducts, <String, Object?>{
        ...row,
        'sync_status': OfflineDb.defaultSyncStatus,
      });
    } else {
      // Separate statement so `toDb()` never owns the sync column. The CASE
      // keeps a never-pushed row on `pending_created` instead of demoting it
      // to `pending_updated`, which would make a future sync engine PATCH a
      // row that does not exist server-side.
      await db.rawUpdate(
        'UPDATE ${OfflineDb.tableProducts} '
        'SET ${OfflineDb.syncStatusOnUpdateSql} WHERE id = ?',
        [id],
      );
    }

    return id;
  }

  /// Hard-remove a rate-card entry.
  ///
  /// HARD delete — no tombstone. See `OfflineDb.usesSoftDelete`. Prefer
  /// deactivation (below) for anything already used on a quotation.
  ///
  /// Prefer setting `isActive = false` via [save] for anything already used on
  /// a quotation: quotations copy the description and rate at the time of
  /// writing, so a delete does not corrupt them, but it does destroy the
  /// owner's ability to explain where an old line item's price came from.
  Future<void> delete(String id) async {
    if (id.isEmpty) return;
    final db = await _dbc.db;
    await db.delete(
      OfflineDb.tableProducts,
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  /// Number of ACTIVE products — what the dashboard tile means by "products".
  /// Counted in SQL so an inactive-heavy rate card stays cheap to summarise.
  Future<int> count() async {
    final db = await _dbc.db;
    final rows = await db.rawQuery(
      'SELECT COUNT(*) AS c FROM ${OfflineDb.tableProducts} WHERE is_active = 1',
    );
    return Sqflite.firstIntValue(rows) ?? 0;
  }
}
