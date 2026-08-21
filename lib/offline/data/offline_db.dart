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
  ///
  /// v1 -> v2 (10-08-2026): `sync_status` + `server_updated_at` added to
  /// quotations/customers/products, and the `quote_counters` table added as a
  /// durable mirror of the SharedPreferences quote counters. See [_migrateV2].
  ///
  /// v2 -> v3 (10-08-2026): the `payments` table — receipts against a
  /// quotation, backing the balance/outstanding figures and the customer
  /// ledger. See [_migrateV3].
  static const int _dbVersion = 3;

  // Table names — referenced by the repositories so a rename is one edit.
  static const String tableQuotations = 'quotations';
  static const String tableMeasuredItems = 'measured_items';
  static const String tableUnmeasuredItems = 'unmeasured_items';
  static const String tableCustomers = 'customers';
  static const String tableProducts = 'products';
  static const String tableQuoteCounters = 'quote_counters';
  static const String tablePayments = 'payments';

  // ---------------------------------------------------------------------------
  // sync_status vocabulary (v2)
  // ---------------------------------------------------------------------------

  /// Valid values of the `sync_status` column.
  ///
  /// WHY these EXACT four strings: they are byte-identical to
  /// `OfflineDatabase.statusSynced` &co. in `lib/services/offline_database.dart`
  /// (the ONLINE app's sync cache). That file is deliberately NOT imported —
  /// importing it would drag `supabase_flutter` into the offline tier and break
  /// the zero-network contract. Duplicating four string literals is the cheap
  /// half of that trade; the expensive half would be a translation layer in the
  /// future sync engine, so the vocabulary is copied verbatim instead.
  ///
  /// WHY the offline tier carries these columns at all: a Rs.10,000 "Low" tier
  /// client can upgrade to Base tier later. At that moment every quotation,
  /// customer and product they created offline has to be pushable to the
  /// server. Retro-fitting a sync column onto a phone already holding three
  /// years of invoices is a migration; having the column from day one is not.
  static const String statusSynced = 'synced';
  static const String statusPendingCreated = 'pending_created';
  static const String statusPendingUpdated = 'pending_updated';
  static const String statusPendingDeleted = 'pending_deleted';

  /// Default for every row written by this tier.
  ///
  /// ⚠️ MUST be `pending_created`, NOT `synced`. In an offline-only install
  /// nothing has ever reached a server, so `synced` would be a lie — and a
  /// future first sync would read it, conclude there is nothing to push, and
  /// SILENTLY SKIP the client's entire history. The failure would only surface
  /// months later as "my old quotations are missing from the web app".
  static const String defaultSyncStatus = statusPendingCreated;

  /// The `SET` fragment used whenever an existing row is modified.
  ///
  /// A row that has NEVER been pushed must stay `pending_created`. Demoting it
  /// to `pending_updated` would make a future sync engine issue a PATCH/UPDATE
  /// against a server row that does not exist — which either 404s (the edit is
  /// lost) or, worse, is swallowed as a no-op. Expressed in SQL rather than
  /// read-modify-write in Dart so it is atomic and cannot race a concurrent
  /// write.
  static const String syncStatusOnUpdateSql =
      "sync_status = CASE WHEN sync_status = '$statusPendingCreated' "
      "THEN '$statusPendingCreated' ELSE '$statusPendingUpdated' END";

  /// Tables carrying `sync_status` + `server_updated_at`.
  ///
  /// Child item rows (`measured_items`, `unmeasured_items`) deliberately do NOT
  /// carry sync columns: they have no independent identity, are always written
  /// as a complete replacement set inside the parent's transaction, and would
  /// therefore only ever mirror the parent's status. A future sync engine
  /// pushes a quotation as one document, not as N item rows.
  ///
  /// `payments` (v3) IS listed: unlike an item row, a receipt has independent
  /// identity and its own lifecycle — the owner records one today and another
  /// next month without touching the quotation. A future sync engine must be
  /// able to push each receipt individually, so it needs its own status.
  static const List<String> syncableTables = <String>[
    tableQuotations,
    tableCustomers,
    tableProducts,
    tablePayments,
  ];

  /// The tables that existed when the v2 migration was written.
  ///
  /// A migration is a HISTORICAL statement about a specific version and must
  /// never be driven by a list that later versions extend — see the comment in
  /// [_migrateV2]. This is a snapshot, deliberately duplicated, and must NOT be
  /// updated when a new syncable table is added.
  static const List<String> _v2SyncableTables = <String>[
    tableQuotations,
    tableCustomers,
    tableProducts,
  ];

  /// 🛑 HARD DELETE IS DELIBERATE — DO NOT ADD TOMBSTONES.
  ///
  /// The offline tier deletes rows physically. There is no `pending_deleted`
  /// row and no `deleted_at` column, even though [statusPendingDeleted] exists
  /// in the vocabulary above (it exists ONLY so the string set matches the
  /// online app; nothing in `lib/offline/**` ever writes it).
  ///
  /// Rationale: a tombstone exists to tell a SERVER that a row went away. This
  /// tier has no server, so a tombstone is pure cost — it bloats the file
  /// forever, and every list query, count and aggregate in the app would need a
  /// `WHERE deleted_at IS NULL` that somebody will eventually forget, silently
  /// resurrecting a quotation the owner deleted.
  ///
  /// CONSEQUENCE, accepted knowingly: when a client upgrades Low -> Base, the
  /// rows they deleted BEFORE the upgrade are simply not propagated — there is
  /// nothing left to propagate. Since those rows never existed server-side
  /// either, the two sides still converge correctly. Only the deletion *event*
  /// is lost, not data.
  static const bool usesSoftDelete = false;

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
        sync_status TEXT NOT NULL DEFAULT '$defaultSyncStatus',
        server_updated_at TEXT
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
        sync_status TEXT NOT NULL DEFAULT '$defaultSyncStatus',
        server_updated_at TEXT
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
        sync_status TEXT NOT NULL DEFAULT '$defaultSyncStatus',
        server_updated_at TEXT
      )
    ''');

    // v2 objects. Created here as well as in [_migrateV2] because a FRESH
    // install never runs onUpgrade at all. Keeping onCreate and the migration
    // in agreement is not optional: divergence between the two is the single
    // most common cause of "works on my new install, crashes on the client's
    // phone" — the developer only ever exercises the onCreate path.
    await _createQuoteCountersTable(db);

    // v3 objects. Same reasoning as the v2 line above — a fresh install NEVER
    // runs onUpgrade, so anything created only in [_migrateV3] would exist on
    // every UPGRADED phone and on no NEW one. That asymmetry is invisible in
    // development (the developer's install is always fresh) and shows up as
    // `no such table: payments` on the first client to install the new APK.
    await _createPaymentsTable(db);

    await _createIndexes(db);
    await _seedProducts(db);

    debugPrint('OfflineDb: schema created (v$version) + rate card seeded');
  }

  /// Durable mirror of the quote-number counters.
  ///
  /// `scope_key` MUST match `QuoteNumberScope.key` in
  /// `lib/offline/core/quote_number_service.dart` EXACTLY:
  ///   `<PREFIX>`            for a continuous series      e.g. `SVU`
  ///   `<PREFIX>::<FY>`      for a financial-year series  e.g. `SVU::25-26`
  /// (the SharedPreferences key is that same string behind
  /// `QuoteNumberService.prefsKeyPrefix` = `offline_quote_counter_v1::`). If the
  /// two ever disagreed the mirror would silently track a different counter
  /// than the one actually issuing numbers, which is worse than no mirror.
  ///
  /// `last_issued` = the LAST ISSUED sequence, `0` = nothing issued yet. Same
  /// semantics as the service. Deliberately NOT "next number": a crash between
  /// reserving and saving then loses at most one number, and re-deriving from
  /// the quotations table (where the highest number found IS the last issued)
  /// needs no off-by-one.
  ///
  /// `prefix` and `fy` are stored redundantly alongside the composite key so a
  /// support engineer reading a `.db` pulled off a phone can see the series
  /// without having to know how to split the key.
  Future<void> _createQuoteCountersTable(DatabaseExecutor db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS $tableQuoteCounters (
        scope_key TEXT PRIMARY KEY,
        prefix TEXT NOT NULL,
        fy TEXT,
        last_issued INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )
    ''');
  }

  /// Receipts against a quotation (v3).
  ///
  /// WHY a separate table rather than an `amount_paid` column on `quotations`:
  /// a fabricator is paid in instalments — advance, on delivery, on completion
  /// — and the owner is regularly asked "when did he pay the second one?". A
  /// single running column answers only "how much", loses the dates, methods
  /// and cheque numbers, and cannot be corrected without recomputing a figure
  /// nobody can audit. One row per receipt is also what makes the customer
  /// ledger possible at all.
  ///
  /// `quotation_id` is a REAL FOREIGN KEY with `ON DELETE CASCADE`, so deleting
  /// a quotation removes its receipts. ⚠️ That cascade is only live because
  /// [_onConfigure] runs `PRAGMA foreign_keys = ON` on EVERY connection —
  /// SQLite defaults the pragma OFF and it is per-connection, not per-file.
  /// Remove that line and this clause becomes decorative: the payments survive
  /// as orphans, are counted by no screen, and quietly inflate
  /// `totalReceived()` forever.
  ///
  /// `customer_id` is denormalised from the quotation (and defaults to '') so
  /// the ledger can filter on one indexed column instead of joining. There is
  /// deliberately NO FK on it, matching `quotations.customer_id`: a receipt is
  /// a historical fact and must survive the address-book row being deleted.
  ///
  /// `date` is TEXT `'yyyy-MM-dd'`, byte-compatible with `quotations.date`.
  /// Zero-padded means lexicographic order IS chronological order, which is
  /// what lets every report do its range filter in SQL (`date >= ? AND
  /// date <= ?`) instead of loading the whole table into Dart.
  ///
  /// `amount` is REAL and always `>= 0`; the repository rejects negative and
  /// non-finite values. A refund is NOT a negative payment here — that would
  /// silently distort `totalReceived()` — it is a future, explicit concept.
  Future<void> _createPaymentsTable(DatabaseExecutor db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS $tablePayments (
        id TEXT PRIMARY KEY,
        quotation_id TEXT NOT NULL REFERENCES $tableQuotations(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL DEFAULT '',
        date TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        method TEXT NOT NULL DEFAULT 'cash',
        reference TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT '$defaultSyncStatus',
        server_updated_at TEXT
      )
    ''');

    await _createPaymentIndexes(db);
  }

  /// Indexes for the payments table (v3).
  ///
  /// Split out from [_createIndexes] so [_migrateV3] can create the table and
  /// its indexes as one unit without re-running every other index statement.
  /// All `IF NOT EXISTS`, so calling it from both paths is safe.
  Future<void> _createPaymentIndexes(DatabaseExecutor db) async {
    // The hot one: every quotation row in the list screen asks "how much has
    // been paid against this?". Without it that is a full scan of every receipt
    // the business has ever taken, once per visible row.
    await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_pay_quotation ON $tablePayments (quotation_id)');

    // Backs the customer ledger / per-customer outstanding.
    await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_pay_customer ON $tablePayments (customer_id)');

    // DESC matches the default "latest receipts first" ordering AND serves the
    // date-range collection reports, which are the two ways this table is read.
    await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_pay_date ON $tablePayments (date DESC)');

    // Same purpose as the other sync indexes: a future "waiting to push" count
    // must not full-scan the receipts table on every dashboard build.
    await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_pay_sync ON $tablePayments (sync_status)');
  }

  /// Indexes are not optional polish here.
  ///
  /// The list screen sorts by `created_at DESC` and filters by status; without
  /// these SQLite full-scans and re-sorts the whole table on every keystroke,
  /// which is invisible at 20 rows and a visible freeze at the 5,000 rows a
  /// three-year-old fabricator install accumulates.
  /// Every statement uses `IF NOT EXISTS` so this method is safe to call from
  /// both [_onCreate] and a migration branch without a partially-applied
  /// migration throwing on re-run.
  Future<void> _createIndexes(DatabaseExecutor db) async {
    await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_quot_created ON quotations (created_at DESC)');
    await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_quot_status ON quotations (status)');
    await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_quot_customer ON quotations (customer_id)');

    // The storage-level guarantee behind the numbering feature. A read-then-write
    // "is this number free?" check in Dart races itself; this cannot.
    await db.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_quot_no ON quotations (quote_no)');

    // Without these the cascade delete and the per-quotation item load both
    // degrade to full scans of every item ever created.
    await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_meas_q ON measured_items (quotation_id)');
    await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_unmeas_q ON unmeasured_items (quotation_id)');

    // Case-folded uniqueness: "Sri Ram Traders" and "sri ram traders" are the
    // same walk-in customer, and two rows for them means two rate histories.
    await db.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_cust_name_lower ON customers (name_lower)');

    // The quotation editor's two product pickers are exactly
    // (is_active = 1, unit = 'sft') and (is_active = 1, unit != 'sft').
    await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_prod_active ON products (is_active, unit)');

    await _createSyncIndexes(db);
  }

  /// Indexes backing the future "how many rows are waiting to be pushed?"
  /// badge. Without them that COUNT is a full table scan of every quotation the
  /// business has ever written, run on every dashboard build.
  Future<void> _createSyncIndexes(DatabaseExecutor db) async {
    await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_quot_sync ON quotations (sync_status)');
    await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_cust_sync ON customers (sync_status)');
    await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_prod_sync ON products (sync_status)');
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
        // Seeded rows have never been near a server either. If this install is
        // ever upgraded to Base tier the owner's edited rates must push, and
        // the untouched ones are harmless duplicates of the server catalogue.
        'sync_status': defaultSyncStatus,
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
        case 2:
          await _migrateV2(db);
          break;
        case 3:
          await _migrateV3(db);
          break;
        default:
          debugPrint(
            'OfflineDb: no migration branch for v$v — if the schema changed in '
            'this release, the branch is MISSING and existing installs will '
            'fail on the new column.',
          );
      }
    }
  }

  /// v1 -> v2 (10-08-2026): sync columns + the quote-counter mirror.
  ///
  /// STRICTLY ADDITIVE. `ALTER TABLE ... ADD COLUMN` and
  /// `CREATE {TABLE,INDEX} IF NOT EXISTS` only. There is deliberately NO
  /// drop-and-recreate of `quotations` or `customers`: those rows are the
  /// client's real invoices and address book, and this tier has no server to
  /// re-sync them from. A botched rebuild here is unrecoverable data loss, not
  /// an inconvenience. (Contrast `lib/services/offline_database.dart`, whose v2
  /// CAN rebuild its tables because they are pure server caches.)
  ///
  /// Every step is idempotent so a migration that was interrupted mid-way —
  /// process killed, battery died, storage momentarily full — re-runs cleanly
  /// on the next open instead of throwing `duplicate column name`.
  Future<void> _migrateV2(Database db) async {
    // ⚠️ Iterates [_v2SyncableTables], NOT [syncableTables]. A migration must be
    // frozen against the schema as it existed at ITS version. `syncableTables`
    // now also contains `payments`, which does not exist yet on a v1 -> v3
    // upgrade path (v2 runs first, v3 creates the table) — so looping the live
    // list here would ALTER a table that is not there. `_addColumnIfMissing`
    // swallows that, so it would not crash, but it would log two failures per
    // upgrade and would genuinely break the day someone makes that helper
    // strict. Freezing the list is the correct fix, not relying on the swallow.
    for (final table in _v2SyncableTables) {
      // Existing rows take the column DEFAULT, i.e. `pending_created`.
      // That is CORRECT and intentional: every row already on the device was
      // created offline and has never been near a server. Backfilling them as
      // `synced` would make a future first sync skip the client's entire
      // history — the exact bug this default exists to prevent.
      await _addColumnIfMissing(
        db,
        table,
        'sync_status',
        "TEXT NOT NULL DEFAULT '$defaultSyncStatus'",
      );

      // Nullable with no default: a future delta PULL uses this as its cursor,
      // and NULL correctly means "the server has never told us anything about
      // this row". Any non-null default would be a fabricated cursor value.
      await _addColumnIfMissing(db, table, 'server_updated_at', 'TEXT');
    }

    await _createQuoteCountersTable(db);
    await _createSyncIndexes(db);

    debugPrint('OfflineDb: v2 migration applied (sync columns + '
        '$tableQuoteCounters)');
  }

  /// v2 -> v3 (10-08-2026): the `payments` table.
  ///
  /// STRICTLY ADDITIVE and IDEMPOTENT. One `CREATE TABLE IF NOT EXISTS` plus
  /// four `CREATE INDEX IF NOT EXISTS`. Nothing is dropped, nothing is
  /// rewritten, no existing column is touched — the quotations and customers
  /// already on the device are the client's real invoices and address book, and
  /// there is NO SERVER behind this tier to re-sync them from. A botched
  /// rebuild here is not an inconvenience, it is the client's money records
  /// gone permanently.
  ///
  /// Idempotency matters for a concrete reason: a migration can be interrupted
  /// between two statements (process killed, battery dies, storage momentarily
  /// full). SQLite will then run this again on the next open, and a bare
  /// `CREATE TABLE` would throw `table payments already exists` — wedging the
  /// database so that EVERY subsequent open fails and the app never starts
  /// again. `IF NOT EXISTS` on every statement is what makes the re-run a no-op.
  ///
  /// The identical DDL also lives in [_onCreate] (via [_createPaymentsTable]).
  /// That duplication is intentional and load-bearing: `onCreate` is the ONLY
  /// path a fresh install takes, and `onUpgrade` is the ONLY path an existing
  /// install takes. Neither ever runs the other.
  Future<void> _migrateV3(Database db) async {
    await _createPaymentsTable(db);
    debugPrint('OfflineDb: v3 migration applied ($tablePayments + indexes)');
  }

  /// `ALTER TABLE <table> ADD COLUMN <column> <ddl>`, but only when the column
  /// is genuinely absent.
  ///
  /// WHY this exists: SQLite has no `ADD COLUMN IF NOT EXISTS`, and adding a
  /// column that is already there throws `duplicate column name`. Since a
  /// migration can be interrupted between two ALTERs, the re-run must be a
  /// no-op for the parts that already landed — otherwise the install is wedged
  /// in a state where EVERY open throws and the app never starts again.
  ///
  /// `PRAGMA table_info(<t>)` is the only portable way to ask. The table name
  /// is interpolated because SQLite does not allow a bound parameter in a
  /// PRAGMA; all call sites pass compile-time constants from this class, never
  /// user input.
  Future<void> _addColumnIfMissing(
    Database db,
    String table,
    String column,
    String ddl,
  ) async {
    try {
      final info = await db.rawQuery('PRAGMA table_info($table)');
      final exists = info.any((row) => row['name'] == column);
      if (exists) {
        debugPrint('OfflineDb: $table.$column already present — skipping');
        return;
      }
      await db.execute('ALTER TABLE $table ADD COLUMN $column $ddl');
      debugPrint('OfflineDb: added $table.$column');
    } catch (e, st) {
      // Deliberately swallowed: a migration failure must not make the database
      // permanently un-openable. The column stays absent and the next open
      // retries. Reads of the missing column are defended by the coercion
      // helpers in models.dart, which treat an absent key as a default.
      debugPrint('OfflineDb: ADD COLUMN $table.$column failed: $e\n$st');
    }
  }

  // ---------------------------------------------------------------------------
  // Quote counter mirror (v2)
  // ---------------------------------------------------------------------------

  /// Last issued sequence for [scopeKey], or null when nothing is stored.
  ///
  /// `scopeKey` is `<PREFIX>` or `<PREFIX>::<FY>` — see
  /// [_createQuoteCountersTable]. Null means "no counter recorded"; it does NOT
  /// mean zero, and the caller must fall back to deriving from the quotations
  /// table rather than restarting the series at 1.
  ///
  /// Never throws: a numbering read must never be the reason the editor fails
  /// to open, consistent with the defensive style of the rest of this file.
  Future<int?> getQuoteCounter(String scopeKey) async {
    final key = scopeKey.trim();
    if (key.isEmpty) return null;
    try {
      final database = await db;
      final rows = await database.query(
        tableQuoteCounters,
        columns: ['last_issued'],
        where: 'scope_key = ?',
        whereArgs: [key],
        limit: 1,
      );
      if (rows.isEmpty) return null;
      final value = rows.first['last_issued'];
      if (value is int) return value;
      return int.tryParse('$value');
    } catch (e) {
      debugPrint('OfflineDb: getQuoteCounter("$key") failed: $e');
      return null;
    }
  }

  /// Record [lastIssued] for [scopeKey]. Upsert; never throws.
  ///
  /// [lastIssued] is clamped at 0 — a negative counter is meaningless and would
  /// make the next allocation compute a negative sequence.
  Future<void> setQuoteCounter({
    required String scopeKey,
    required String prefix,
    String? fy,
    required int lastIssued,
  }) async {
    final key = scopeKey.trim();
    if (key.isEmpty) return;
    try {
      final database = await db;
      await database.insert(
        tableQuoteCounters,
        <String, Object?>{
          'scope_key': key,
          'prefix': prefix,
          'fy': fy,
          'last_issued': lastIssued < 0 ? 0 : lastIssued,
          'updated_at': DateTime.now().toIso8601String(),
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    } catch (e) {
      // A no-op is safe: SharedPreferences remains the counter of record, and
      // the service can always re-derive from the quotations table.
      debugPrint('OfflineDb: setQuoteCounter("$key") failed: $e');
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
