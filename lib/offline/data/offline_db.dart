/// OFFLINE TIER (Rs.10,000 "Low") — SQLITE OPEN/SCHEMA MANAGER.
///
/// ZERO-SERVER CONTRACT
/// --------------------
/// This file (and everything else under `lib/offline/**`) must never import
/// `supabase_flutter`, `../../supabase_config.dart`, `package:http/http.dart`,
/// `connectivity_plus`, or anything under `lib/services/`. The Low tier is sold
/// on a contractual promise of ZERO network calls which Bugsy verifies with a
/// packet capture. A stray import here is a breach of contract, not a bug.
///
/// This is deliberately NOT `lib/services/offline_database.dart`. That class is
/// the ONLINE app's sync cache (client_id scoped, sync_status columns, write
/// queue). The offline tier has exactly one tenant per install, no sync, and no
/// server — so it gets its own file, its own database file, and no shared code.
library;

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';
import 'package:uuid/uuid.dart';

/// Thrown when a write would create a second quotation carrying an existing
/// quote number.
///
/// WHY a typed exception: the UNIQUE index on `quotations.quote_no` is the real
/// guarantee behind the numbering feature — it is enforced by storage, not by a
/// hopeful read-then-write in Dart (which races). But a raw `DatabaseException`
/// reaching the UI is unreadable and untestable, so the repository translates
/// the constraint failure into this type. The save screen catches it, asks the
/// numbering service for the next free number and retries.
class DuplicateQuoteNumberException implements Exception {
  const DuplicateQuoteNumberException(this.quoteNo);

  /// The number that was rejected.
  final String quoteNo;

  @override
  String toString() =>
      'DuplicateQuoteNumberException: quotation number "$quoteNo" is already '
      'used by another quotation.';
}

/// Thrown by [OfflineDb.db] when the offline entrypoint is run on Flutter Web.
///
/// WHY its own type: `sqflite` has no web implementation, so the failure would
/// otherwise surface as a `MissingPluginException` deep inside a widget build —
/// which reads like a broken app rather than an unsupported platform. The Low
/// tier ships as an Android APK only; fail loudly and legibly instead.
class OfflineDbUnsupportedPlatformException extends UnsupportedError {
  OfflineDbUnsupportedPlatformException()
      : super(
          'The offline (Low tier) database is Android-only. sqflite has no '
          'Flutter Web implementation, so `OfflineDb` cannot be opened in a '
          'browser. Run the online entrypoint (lib/main.dart) on web.',
        );
}

/// Single owner of the offline SQLite file: opening, schema, migrations.
///
/// WHY a singleton: SQLite allows exactly one writer. Two `openDatabase` calls
/// on the same path produce two handles that can deadlock each other on a write
/// transaction, and the resulting `database is locked` is intermittent and
/// nearly impossible to reproduce on a customer's phone. One handle, one owner.
class OfflineDb {
  OfflineDb._();

  /// The one and only instance. Repositories default to this.
  static final OfflineDb instance = OfflineDb._();

  /// Database file name. Deliberately different from the online app's
  /// `vitharn_offline.db` so an install that has run both entrypoints cannot
  /// end up with two incompatible schemas in one file.
  static const String dbFileName = 'offline_upvc.db';

  /// Schema version.
  ///
  /// ⚠️ ANY schema change MUST bump this AND add a matching branch in
  /// [_onUpgrade] IN THE SAME COMMIT. `onCreate` only ever runs on a fresh
  /// install, so a new column added to [_onCreate] without a migration branch
  /// is invisible to every existing install — and every query touching that
  /// column then throws `no such column` on exactly the devices that already
  /// hold the customer's data. An empty `onUpgrade` is a silent data outage.
  static const int _dbVersion = 1;

  // Table names — referenced by the repositories so a rename is one edit.
  static const String tableQuotations = 'quotations';
  static const String tableMeasuredItems = 'measured_items';
  static const String tableUnmeasuredItems = 'unmeasured_items';
  static const String tableCustomers = 'customers';
  static const String tableProducts = 'products';
  static const String tablePayments = 'payments';

  /// Sync status constants for the future sync engine.
  /// A brand-new row that has never been near a server takes this default.
  static const String defaultSyncStatus = 'pending_created';

  /// SQL fragment used in rawUpdate: keeps a never-pushed row on
  /// `pending_created` instead of demoting it to `pending_updated`, which would
  /// make a future sync engine PATCH a row that does not exist server-side.
  static const String syncStatusOnUpdateSql =
      "sync_status = CASE WHEN sync_status = 'pending_created' "
      "THEN 'pending_created' ELSE 'pending_updated' END";

  static const Uuid _uuid = Uuid();

  Database? _database;

  /// The single in-flight `openDatabase` call.
  ///
  /// WHY a nullable Future instead of a Completer: `lib/services/offline_database.dart`
  /// used a `Completer` created up front and (in earlier revisions) completed it
  /// with an error on failure. A Completer can only complete ONCE, so every
  /// later access re-awaited the same already-failed future and re-threw the
  /// original error forever — the app could never recover, even after the
  /// transient cause (no storage permission yet, disk full, first-run race) had
  /// cleared. Here the field is simply nulled on failure so the next caller
  /// gets a clean retry.
  Future<Database>? _opening;

  /// The open database, opening it on first use.
  ///
  /// Concurrent callers share one open attempt: repositories are constructed
  /// freely across the widget tree and several screens hit the DB in the same
  /// frame, so without this guard the first frame could race two opens.
  Future<Database> get db async {
    if (kIsWeb) {
      // Fail loudly rather than weirdly. See the exception's own doc comment.
      throw OfflineDbUnsupportedPlatformException();
    }

    final existing = _database;
    if (existing != null && existing.isOpen) return existing;

    return _opening ??= _openGuarded();
  }

  Future<Database> _openGuarded() async {
    try {
      final opened = await _open();
      _database = opened;
      return opened;
    } catch (e, st) {
      // Drop the failed attempt so the NEXT caller retries from scratch.
      _opening = null;
      _database = null;
      debugPrint('OfflineDb: open failed: $e\n$st');
      rethrow;
    }
  }

  Future<Database> _open() async {
    final dir = await getDatabasesPath();
    final path = p.join(dir, dbFileName);
    debugPrint('OfflineDb: opening $path (v$_dbVersion)');

    return openDatabase(
      path,
      version: _dbVersion,
      onConfigure: _onConfigure,
      onCreate: _onCreate,
      onUpgrade: _onUpgrade,
    );
  }

  /// Foreign keys are OFF by default in SQLite and the pragma is per-connection,
  /// so it must be set here on every open. Without it `ON DELETE CASCADE` is
  /// inert and deleting a quotation silently orphans its item rows, which then
  /// bloat the file forever and are counted by nothing.
  Future<void> _onConfigure(Database db) async {
    await db.execute('PRAGMA foreign_keys = ON');
  }

  Future<void> _onCreate(Database db, int version) async {
    await db.execute('''
      CREATE TABLE quotations (
        id TEXT PRIMARY KEY,
        quote_no TEXT NOT NULL,
        date TEXT NOT NULL,
        customer_name TEXT NOT NULL DEFAULT '',
        customer_id TEXT NOT NULL DEFAULT '',
        reference TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        contact_no TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        transport_cost REAL NOT NULL DEFAULT 0,
        include_gst INTEGER NOT NULL DEFAULT 0,
        gst_percentage REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft',
        notes TEXT NOT NULL DEFAULT '',
        grand_total REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'pending_created'
      )
    ''');

    // NOTE: no FK from quotations.customer_id to customers.id, on purpose.
    // A quotation is a historical document: the name/address printed on last
    // year's PDF must survive the customer record being edited or deleted.
    // That is why the customer fields are duplicated as plain text above.

    await db.execute('''
      CREATE TABLE measured_items (
        id TEXT PRIMARY KEY,
        quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        code TEXT,
        description TEXT,
        width REAL,
        height REAL,
        units INTEGER,
        glass TEXT,
        rate REAL,
        position INTEGER NOT NULL DEFAULT 0
      )
    ''');

    await db.execute('''
      CREATE TABLE unmeasured_items (
        id TEXT PRIMARY KEY,
        quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        description TEXT,
        units INTEGER,
        rate REAL,
        position INTEGER NOT NULL DEFAULT 0
      )
    ''');

    await db.execute('''
      CREATE TABLE customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_lower TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        address TEXT,
        gstin TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'pending_created'
      )
    ''');

    await db.execute('''
      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        code TEXT,
        name TEXT NOT NULL,
        description TEXT,
        unit TEXT NOT NULL DEFAULT 'sft',
        rate REAL NOT NULL DEFAULT 0,
        glass TEXT,
        category TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'pending_created'
      )
    ''');

    await db.execute('''
      CREATE TABLE payments (
        id TEXT PRIMARY KEY,
        quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        amount REAL NOT NULL DEFAULT 0,
        method TEXT NOT NULL DEFAULT 'cash',
        reference TEXT NOT NULL DEFAULT '',
        paid_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'pending_created'
      )
    ''');

    await _createIndexes(db);
    await _seedProducts(db);

    debugPrint('OfflineDb: schema created (v$version) + rate card seeded');
  }

  /// Indexes are not optional polish here.
  ///
  /// The list screen sorts by `created_at DESC` and filters by status; without
  /// these SQLite full-scans and re-sorts the whole table on every keystroke,
  /// which is invisible at 20 rows and a visible freeze at the 5,000 rows a
  /// three-year-old fabricator install accumulates.
  Future<void> _createIndexes(Database db) async {
    await db.execute(
        'CREATE INDEX idx_quot_created ON quotations (created_at DESC)');
    await db.execute('CREATE INDEX idx_quot_status ON quotations (status)');
    await db
        .execute('CREATE INDEX idx_quot_customer ON quotations (customer_id)');

    // The storage-level guarantee behind the numbering feature. A read-then-write
    // "is this number free?" check in Dart races itself; this cannot.
    await db.execute(
        'CREATE UNIQUE INDEX idx_quot_no ON quotations (quote_no)');

    // Without these the cascade delete and the per-quotation item load both
    // degrade to full scans of every item ever created.
    await db.execute(
        'CREATE INDEX idx_meas_q ON measured_items (quotation_id)');
    await db.execute(
        'CREATE INDEX idx_unmeas_q ON unmeasured_items (quotation_id)');

    // Case-folded uniqueness: "Sri Ram Traders" and "sri ram traders" are the
    // same walk-in customer, and two rows for them means two rate histories.
    await db.execute(
        'CREATE UNIQUE INDEX idx_cust_name_lower ON customers (name_lower)');

    // The quotation editor's two product pickers are exactly
    // (is_active = 1, unit = 'sft') and (is_active = 1, unit != 'sft').
    await db
        .execute('CREATE INDEX idx_prod_active ON products (is_active, unit)');
  }

  /// Seed a realistic uPVC rate card.
  ///
  /// WHY seed at all: the Low tier has no server to pull a catalogue from, and a
  /// fabricator handed an empty product list on day one cannot make a quotation
  /// without first doing data entry — the single biggest cause of a trial never
  /// converting. These rates are typical Indian market rates and are meant to be
  /// edited, not treated as authoritative.
  ///
  /// WHY only in onCreate: seeding on open would resurrect rows the owner
  /// deliberately deleted and overwrite the rates they carefully corrected.
  Future<void> _seedProducts(Database db) async {
    final now = DateTime.now().toIso8601String();

    // code, name, description, unit, rate, glass, category
    const seed = <List<Object>>[
      [
        'SW2T',
        '2 Track Sliding Window',
        'uPVC 2 track sliding window with mesh provision',
        'sft',
        420.0,
        '5mm Plain',
        'Windows',
      ],
      [
        'SW3T',
        '3 Track Sliding Window',
        'uPVC 3 track sliding window, 2 shutters + 1 mesh',
        'sft',
        480.0,
        '5mm Plain',
        'Windows',
      ],
      [
        'CW',
        'Casement Window',
        'uPVC openable casement window with multipoint lock',
        'sft',
        550.0,
        '5mm Toughened',
        'Windows',
      ],
      [
        'FG',
        'Fixed Glazing',
        'uPVC fixed glass panel, non-openable',
        'sft',
        350.0,
        '5mm Plain',
        'Glazing',
      ],
      [
        'VNT',
        'Ventilator',
        'uPVC top hung ventilator with louvers',
        'sft',
        450.0,
        '5mm Frosted',
        'Ventilators',
      ],
      [
        'SD2T',
        '2 Track Sliding Door',
        'uPVC 2 track sliding door with heavy duty rollers',
        'sft',
        620.0,
        '8mm Toughened',
        'Doors',
      ],
      [
        'MSH',
        'Mesh Shutter',
        'uPVC mosquito mesh shutter for sliding track',
        'sft',
        700.0,
        'SS Mesh',
        'Accessories',
      ],
      [
        'HDL',
        'Door Handle',
        'Aluminium alloy door handle set, both sides',
        'nos',
        450.0,
        '',
        'Hardware',
      ],
      [
        'LCK',
        'Multipoint Lock',
        'Multipoint locking system with keys',
        'nos',
        850.0,
        '',
        'Hardware',
      ],
      [
        'SIL',
        'Silicone Sealant',
        'Weatherproof silicone sealant cartridge',
        'nos',
        320.0,
        '',
        'Consumables',
      ],
    ];

    final batch = db.batch();
    for (final row in seed) {
      batch.insert(tableProducts, {
        'id': _uuid.v4(),
        'code': row[0],
        'name': row[1],
        'description': row[2],
        'unit': row[3],
        'rate': row[4],
        'glass': row[5],
        'category': row[6],
        'is_active': 1,
        'created_at': now,
        'updated_at': now,
      });
    }
    await batch.commit(noResult: true);
  }

  /// Schema migrations.
  ///
  /// ⚠️ READ [_dbVersion] BEFORE EDITING. Every version bump needs a branch
  /// here in the SAME commit. Branches must be additive (`ALTER TABLE ... ADD
  /// COLUMN`, `CREATE INDEX IF NOT EXISTS`) or must rebuild only derived data.
  /// There is NO server behind this tier: a dropped table is the customer's
  /// data gone for good, with no re-sync to recover it.
  Future<void> _onUpgrade(Database db, int oldVersion, int newVersion) async {
    debugPrint('OfflineDb: upgrading v$oldVersion -> v$newVersion');

    // Stepwise so an install that skipped several releases still applies every
    // intermediate migration in order.
    for (var v = oldVersion + 1; v <= newVersion; v++) {
      switch (v) {
        // case 2:
        //   await db.execute('ALTER TABLE quotations ADD COLUMN discount REAL '
        //       'NOT NULL DEFAULT 0');
        //   break;
        default:
          debugPrint(
            'OfflineDb: no migration branch for v$v — if the schema changed in '
            'this release, the branch is MISSING and existing installs will '
            'fail on the new column.',
          );
      }
    }
  }

  /// Run [action] inside a single SQLite transaction.
  ///
  /// Exposed so a repository can make a multi-table write (header + item rows)
  /// atomic: a crash halfway through a save must leave the previous version of
  /// the quotation intact rather than a header with no items.
  Future<T> transaction<T>(Future<T> Function(Transaction txn) action) async {
    final database = await db;
    return database.transaction<T>(action);
  }

  /// Close the handle and reset state so a later access can re-open cleanly.
  Future<void> close() async {
    final open = _database;
    _database = null;
    _opening = null;
    try {
      await open?.close();
    } catch (e) {
      // Closing an already-closed handle must not take the app down.
      debugPrint('OfflineDb: close failed: $e');
    }
  }

  /// Delete the database file entirely — backs the "reset all data" action.
  ///
  /// The handle is closed first because deleting a file that is still open
  /// leaves Android's SQLite with a stale handle whose next write recreates a
  /// half-empty file, producing a "reset" that did not actually reset.
  /// The next [db] access recreates the schema and re-seeds the rate card.
  Future<void> deleteDatabaseFile() async {
    if (kIsWeb) throw OfflineDbUnsupportedPlatformException();
    await close();
    final dir = await getDatabasesPath();
    final path = p.join(dir, dbFileName);
    await deleteDatabase(path);
    debugPrint('OfflineDb: deleted $path');
  }

  /// A fresh v4 id. Central so every table generates ids the same way.
  static String newId() => _uuid.v4();

  /// True when [error] is the UNIQUE-constraint failure raised by
  /// `idx_quot_no`. Kept here because it is knowledge about THIS schema.
  static bool isDuplicateQuoteNoError(Object error) {
    if (error is DatabaseException && error.isUniqueConstraintError()) {
      final message = error.toString().toLowerCase();
      return message.contains('quote_no') || message.contains('idx_quot_no');
    }
    return false;
  }

  /// Escapes a user-typed LIKE pattern.
  ///
  /// WHY: a customer named "50% Discount Traders" or a quote number containing
  /// `_` would otherwise be interpreted as wildcards, silently returning the
  /// wrong rows. Callers must pair this with `ESCAPE '\'` in the SQL.
  static String escapeLike(String input) => input
      .replaceAll('\\', '\\\\')
      .replaceAll('%', '\\%')
      .replaceAll('_', '\\_');
}
