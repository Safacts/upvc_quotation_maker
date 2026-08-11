/// OFFLINE TIER — CUSTOMER PERSISTENCE.
///
/// ZERO-SERVER CONTRACT: no `supabase_flutter`, no `http`, no `connectivity_plus`,
/// no `lib/services/**`. See `lib/offline/core/models.dart` for the full rule.
library;

import 'package:flutter/foundation.dart';
import 'package:sqflite/sqflite.dart';

import '../core/models.dart';
import 'offline_db.dart';

/// The customer address book.
///
/// Customers exist purely to save re-typing a name, phone and address onto
/// every quotation. They are NOT the owner of a quotation's customer details:
/// a quotation stores its own copy as text so an old PDF stays reproducible
/// after the address book row is edited or deleted.
class CustomerRepository {
  CustomerRepository([OfflineDb? database])
      : _dbc = database ?? OfflineDb.instance;

  final OfflineDb _dbc;

  /// Alphabetical list, optionally filtered.
  ///
  /// Search covers name, phone and email because the owner remembers a walk-in
  /// customer by whichever of the three they happen to have to hand.
  Future<List<OfflineCustomer>> list({String? search}) async {
    final db = await _dbc.db;

    final term = search?.trim() ?? '';
    String? where;
    List<Object?>? args;

    if (term.isNotEmpty) {
      // Escaped so "M/s. R_K Traders" matches the literal underscore.
      final pattern = '%${OfflineDb.escapeLike(term)}%';
      where = "(LOWER(name) LIKE LOWER(?) ESCAPE '\\' "
          "OR LOWER(phone) LIKE LOWER(?) ESCAPE '\\' "
          "OR LOWER(email) LIKE LOWER(?) ESCAPE '\\')";
      args = [pattern, pattern, pattern];
    }

    final rows = await db.query(
      OfflineDb.tableCustomers,
      where: where,
      whereArgs: args,
      // name_lower, not name: ordering by the raw column puts every
      // capitalised name above every lowercase one (ASCII order), which looks
      // like a broken sort to the user.
      orderBy: 'name_lower ASC',
    );

    return rows.map(OfflineCustomer.fromDb).toList(growable: false);
  }

  /// A single customer, or null when the id is unknown.
  Future<OfflineCustomer?> getById(String id) async {
    if (id.isEmpty) return null;
    final db = await _dbc.db;
    final rows = await db.query(
      OfflineDb.tableCustomers,
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );
    return rows.isEmpty ? null : OfflineCustomer.fromDb(rows.first);
  }

  /// Insert or update, merging on name. Returns the id actually written.
  ///
  /// WHY merge instead of throwing on the UNIQUE `name_lower` conflict: the
  /// commonest path into this table is the quotation editor's "save this
  /// customer" checkbox. The same walk-in gets typed again months later and the
  /// owner has no idea a row already exists. Surfacing a constraint error there
  /// blocks a save that has nothing to do with the address book; creating a
  /// duplicate splits their history across two rows. Merging is the only
  /// behaviour that matches what the owner meant.
  ///
  /// NOTE: the merge keeps the EXISTING row's id, so quotations already
  /// pointing at that customer keep resolving. Only non-empty incoming fields
  /// overwrite — a quick quotation that captured just a phone number must not
  /// wipe the address typed in full last year.
  Future<String> save(OfflineCustomer customer) async {
    final db = await _dbc.db;

    final name = customer.name.trim();
    final nameLower = name.toLowerCase();

    final existing = nameLower.isEmpty
        ? const <Map<String, Object?>>[]
        : await db.query(
            OfflineDb.tableCustomers,
            where: 'name_lower = ?',
            whereArgs: [nameLower],
            limit: 1,
          );

    final now = DateTime.now();

    if (existing.isNotEmpty) {
      final current = OfflineCustomer.fromDb(existing.first);
      final id = asText(existing.first['id']);

      // Same row being re-saved by id, or a genuine name collision: either way
      // the surviving id is the existing one.
      final merged = OfflineCustomer(
        id: id,
        name: name.isEmpty ? current.name : name,
        phone: customer.phone.trim().isEmpty ? current.phone : customer.phone,
        email: customer.email.trim().isEmpty ? current.email : customer.email,
        address:
            customer.address.trim().isEmpty ? current.address : customer.address,
        gstin: customer.gstin.trim().isEmpty ? current.gstin : customer.gstin,
        notes: customer.notes.trim().isEmpty ? current.notes : customer.notes,
        createdAt: current.createdAt,
        updatedAt: now,
      );

      await db.update(
        OfflineDb.tableCustomers,
        merged.toDb(),
        where: 'id = ?',
        whereArgs: [id],
      );

      // Separate statement: `toDb()` deliberately does not carry `sync_status`,
      // so a stale in-memory model can never overwrite the real sync state.
      // The CASE keeps a row that has never been pushed on `pending_created`
      // rather than demoting it to `pending_updated` — a future sync engine
      // must POST it, not PATCH a server row that does not exist.
      await db.rawUpdate(
        'UPDATE ${OfflineDb.tableCustomers} '
        'SET ${OfflineDb.syncStatusOnUpdateSql} WHERE id = ?',
        [id],
      );

      // Reflect the surviving identity back to the caller's object so the UI
      // does not keep holding a phantom id that was never written.
      customer
        ..id = id
        ..createdAt = current.createdAt
        ..updatedAt = now;

      debugPrint('CustomerRepository: merged into existing customer $id');
      return id;
    }

    final id = (customer.id != null && customer.id!.isNotEmpty)
        ? customer.id!
        : OfflineDb.newId();
    customer
      ..id = id
      ..name = name
      ..updatedAt = now;

    // Explicit rather than relying on the column DEFAULT: `ConflictAlgorithm
    // .replace` is a DELETE + INSERT, so on the replace path the previous row's
    // sync_status is gone anyway. A brand-new address-book entry has never been
    // near a server, so `pending_created` is correct either way.
    await db.insert(
      OfflineDb.tableCustomers,
      customer.toDb()
        ..['id'] = id
        ..['sync_status'] = OfflineDb.defaultSyncStatus,
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
    return id;
  }

  /// Remove an address-book entry.
  ///
  /// HARD delete — no tombstone. See `OfflineDb.usesSoftDelete`.
  ///
  /// Their quotations are deliberately untouched: there is no foreign key from
  /// `quotations.customer_id`, and each quotation carries its own copy of the
  /// name/address text. Deleting a customer must never rewrite or remove a
  /// document that was already sent — for the owner that would look like
  /// history being destroyed.
  Future<void> delete(String id) async {
    if (id.isEmpty) return;
    final db = await _dbc.db;
    await db.delete(
      OfflineDb.tableCustomers,
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  /// Exact (case-insensitive, trimmed) name lookup.
  ///
  /// Used by the quotation editor to auto-fill address/phone the moment a known
  /// name is typed, and to decide insert-vs-merge before calling [save].
  Future<OfflineCustomer?> findByName(String name) async {
    final key = name.trim().toLowerCase();
    if (key.isEmpty) return null;

    final db = await _dbc.db;
    final rows = await db.query(
      OfflineDb.tableCustomers,
      where: 'name_lower = ?',
      whereArgs: [key],
      limit: 1,
    );
    return rows.isEmpty ? null : OfflineCustomer.fromDb(rows.first);
  }

  /// Address-book size, counted in SQL for the dashboard tile.
  Future<int> count() async {
    final db = await _dbc.db;
    final rows = await db
        .rawQuery('SELECT COUNT(*) AS c FROM ${OfflineDb.tableCustomers}');
    return Sqflite.firstIntValue(rows) ?? 0;
  }
}
