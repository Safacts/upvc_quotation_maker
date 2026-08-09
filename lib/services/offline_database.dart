import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart' as p;
import 'package:shared_preferences/shared_preferences.dart';

import '../models_extra.dart';
import '../supabase_config.dart';

/// SQLite database manager for offline-first operation.
///
/// Provides local storage for products, quotations, customers, payments,
/// and app configuration. All data is keyed by `client_id` for multi-tenant
/// isolation. This is NOT cosmetic: on Flutter Web a single browser profile
/// can log into more than one tenant, and on Android an APK can be re-pointed
/// at another client. Every read and write below is scoped by client_id.
///
/// ## Flutter Web
/// `sqflite` has NO web implementation. Calling `getDatabasesPath()` or
/// `openDatabase()` in a browser throws `databaseFactory not initialized`
/// (or a MissingPluginException). This app ships BOTH as a Vercel-hosted web
/// build and as an Android APK, so every entry point below is guarded by
/// [isPersistent]. On web (and on any platform where opening the file fails)
/// the class silently degrades to a per-session in-memory cache that never
/// throws — callers then fall through to their normal online Supabase calls.
///
/// The offline write queue (pending_created / pending_updated /
/// pending_deleted) is deliberately DISABLED on web: a browser tab is not a
/// durable store, and silently queueing a quotation that evaporates on refresh
/// is worse than requiring connectivity.
class OfflineDatabase {
  OfflineDatabase._();
  static final OfflineDatabase instance = OfflineDatabase._();

  static const String _dbName = 'vitharn_offline.db';

  /// Schema version.
  ///
  /// BUMP THIS on every schema change and add a branch to [_upgradeTables].
  /// v1 -> v2 (09-08-2026): `offline_app_config` and `offline_feature_flags`
  /// had a single-column primary key (`config_key` / `feature_key`), which let
  /// one tenant's config overwrite and be read back by another tenant on the
  /// same install. Both are now keyed by (client_id, key).
  static const int _dbVersion = 2;

  /// Valid values for the `sync_status` column on every local table.
  static const String statusSynced = 'synced';
  static const String statusPendingCreated = 'pending_created';
  static const String statusPendingUpdated = 'pending_updated';
  static const String statusPendingDeleted = 'pending_deleted';

  /// Tables that carry a `sync_status` column and take part in the push path.
  static const List<String> syncableTables = [
    'offline_quotations',
    'offline_customers',
    'offline_payments',
    'offline_measured_items',
    'offline_unmeasured_items',
  ];

  Database? _db;
  Completer<Database?>? _initCompleter;

  /// True once [initialize] has run (successfully or not).
  bool _initialized = false;

  /// False on Flutter Web, or when opening the SQLite file failed. When false
  /// the in-memory fallback below is used and nothing ever throws.
  bool _persistent = false;
  bool get isPersistent => _persistent;

  /// The tenant every unscoped call is attributed to. Set by the sync engine
  /// as soon as the client config is known. Empty means "no tenant yet", which
  /// deliberately reads back as empty rather than as another tenant's data.
  String _activeClientId = '';
  String get activeClientId => _activeClientId;

  void setActiveClient(String clientId) {
    if (_activeClientId == clientId) return;
    _activeClientId = clientId;
    debugPrint('OfflineDatabase: active client = "$clientId"');
  }

  String _cid(String? clientId) {
    if (clientId != null && clientId.isNotEmpty) return clientId;
    if (_activeClientId.isNotEmpty) return _activeClientId;
    // main.dart sets the `x-client-id` header before any service initializes,
    // so this is a reliable last resort when a caller forgot to pass one.
    // Falling back to '' instead would make every unscoped read/write land in
    // a shared bucket visible to the next tenant on this install.
    try {
      final header = SupabaseConfig.client.headers['x-client-id'] ?? '';
      if (header.isNotEmpty) _activeClientId = header;
      return _activeClientId;
    } catch (_) {
      return '';
    }
  }

  // ---------------------------------------------------------------------------
  // In-memory fallback (Flutter Web / failed open)
  // ---------------------------------------------------------------------------

  /// clientId -> productId -> row
  final Map<String, Map<String, Map<String, dynamic>>> _memProducts = {};

  /// clientId -> configKey -> value
  final Map<String, Map<String, String>> _memConfig = {};

  /// clientId -> featureKey -> enabled
  final Map<String, Map<String, bool>> _memFlags = {};

  /// clientId -> contentType -> manifest row
  final Map<String, Map<String, Map<String, dynamic>>> _memManifest = {};

  /// Returns the open database, or null when running on the in-memory
  /// fallback. NEVER throws.
  Future<Database?> get databaseOrNull async {
    if (_db != null) return _db;
    if (!_initialized) {
      await initialize();
      return _db;
    }
    final completer = _initCompleter;
    if (completer != null && !completer.isCompleted) {
      try {
        return await completer.future;
      } catch (_) {
        return null;
      }
    }
    return _db;
  }

  /// Initialize the database. Safe to call multiple times and safe to call on
  /// Flutter Web. Never throws — a failure just leaves the class on the
  /// in-memory fallback.
  Future<void> initialize() async {
    if (_db != null) return;

    final inFlight = _initCompleter;
    if (inFlight != null && !inFlight.isCompleted) {
      try {
        await inFlight.future;
      } catch (_) {}
      return;
    }
    if (_initialized) return;

    final completer = Completer<Database?>();
    _initCompleter = completer;

    // Flutter Web: sqflite has no implementation. Degrade, do not throw.
    if (kIsWeb) {
      _persistent = false;
      _initialized = true;
      completer.complete(null);
      debugPrint(
        'OfflineDatabase: web build — sqflite unavailable, using in-memory '
        'cache. Offline write queue is disabled; calls fall through to Supabase.',
      );
      return;
    }

    try {
      final dbPath = await getDatabasesPath();
      final path = p.join(dbPath, _dbName);

      _db = await openDatabase(
        path,
        version: _dbVersion,
        onCreate: _createTables,
        onUpgrade: _upgradeTables,
        onConfigure: (db) async {
          await db.execute('PRAGMA foreign_keys = ON');
        },
      );

      _persistent = true;
      _initialized = true;
      completer.complete(_db);
      debugPrint('OfflineDatabase initialized (v$_dbVersion): $path');
    } catch (e, st) {
      // Never propagate: a broken cache must not take the app down.
      _db = null;
      _persistent = false;
      _initialized = true;
      completer.complete(null);
      debugPrint('OfflineDatabase init failed, falling back to memory: $e\n$st');
    }
  }

  /// Create all tables in the database.
  Future<void> _createTables(Database db, int version) async {
    // Products table (local cache of server products)
    await db.execute('''
      CREATE TABLE IF NOT EXISTS offline_products (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        price REAL NOT NULL DEFAULT 0,
        unit TEXT NOT NULL DEFAULT 'SFT',
        soft_deleted INTEGER NOT NULL DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'synced',
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT '',
        server_updated_at TEXT NOT NULL DEFAULT ''
      )
    ''');

    // Index for fast product lookups
    await db.execute('''
      CREATE INDEX IF NOT EXISTS idx_offline_products_client 
      ON offline_products (client_id)
    ''');

    await db.execute('''
      CREATE INDEX IF NOT EXISTS idx_offline_products_category 
      ON offline_products (category)
    ''');

    // Customers table (local cache of customers)
    await db.execute('''
      CREATE TABLE IF NOT EXISTS offline_customers (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL DEFAULT '',
        contact TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        sync_status TEXT NOT NULL DEFAULT 'synced',
        local_data TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT '',
        server_updated_at TEXT NOT NULL DEFAULT ''
      )
    ''');

    await db.execute('''
      CREATE INDEX IF NOT EXISTS idx_offline_customers_client 
      ON offline_customers (client_id)
    ''');

    await db.execute('''
      CREATE INDEX IF NOT EXISTS idx_offline_customers_name 
      ON offline_customers (name)
    ''');

    // Quotations table (local cache of quotations)
    await db.execute('''
      CREATE TABLE IF NOT EXISTS offline_quotations (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL DEFAULT '',
        quote_no TEXT NOT NULL DEFAULT '',
        date TEXT NOT NULL DEFAULT '',
        customer_name TEXT NOT NULL DEFAULT '',
        reference TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        contact_no TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        transport_cost REAL NOT NULL DEFAULT 0,
        include_gst INTEGER NOT NULL DEFAULT 0,
        gst_percentage REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft',
        supplier_company TEXT NOT NULL DEFAULT '',
        viewed_at TEXT,
        view_count INTEGER NOT NULL DEFAULT 0,
        payment_status TEXT NOT NULL DEFAULT 'unpaid',
        amount_paid REAL NOT NULL DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'synced',
        local_data TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT '',
        server_updated_at TEXT NOT NULL DEFAULT ''
      )
    ''');

    await db.execute('''
      CREATE INDEX IF NOT EXISTS idx_offline_quotations_client 
      ON offline_quotations (client_id)
    ''');

    await db.execute('''
      CREATE INDEX IF NOT EXISTS idx_offline_quotations_customer 
      ON offline_quotations (customer_name)
    ''');

    await db.execute('''
      CREATE INDEX IF NOT EXISTS idx_offline_quotations_status 
      ON offline_quotations (status)
    ''');

    // Quotation items table (measured items)
    await db.execute('''
      CREATE TABLE IF NOT EXISTS offline_measured_items (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL DEFAULT '',
        quotation_id TEXT NOT NULL DEFAULT '',
        code TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        width REAL NOT NULL DEFAULT 0,
        height REAL NOT NULL DEFAULT 0,
        units INTEGER NOT NULL DEFAULT 1,
        glass TEXT NOT NULL DEFAULT '',
        rate REAL NOT NULL DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'synced',
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT ''
      )
    ''');

    await db.execute('''
      CREATE INDEX IF NOT EXISTS idx_offline_measured_items_quotation 
      ON offline_measured_items (quotation_id)
    ''');

    // Quotation items table (unmeasured items)
    await db.execute('''
      CREATE TABLE IF NOT EXISTS offline_unmeasured_items (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL DEFAULT '',
        quotation_id TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        units INTEGER NOT NULL DEFAULT 1,
        rate REAL NOT NULL DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'synced',
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT ''
      )
    ''');

    await db.execute('''
      CREATE INDEX IF NOT EXISTS idx_offline_unmeasured_items_quotation 
      ON offline_unmeasured_items (quotation_id)
    ''');

    // Payments table (local cache of payments)
    await db.execute('''
      CREATE TABLE IF NOT EXISTS offline_payments (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL DEFAULT '',
        quotation_id TEXT,
        customer_id TEXT,
        customer_name TEXT NOT NULL DEFAULT '',
        amount REAL NOT NULL DEFAULT 0,
        method TEXT NOT NULL DEFAULT 'upi',
        reference TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        paid_at TEXT NOT NULL DEFAULT '',
        sync_status TEXT NOT NULL DEFAULT 'synced',
        local_data TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT '',
        server_updated_at TEXT NOT NULL DEFAULT ''
      )
    ''');

    await db.execute('''
      CREATE INDEX IF NOT EXISTS idx_offline_payments_client 
      ON offline_payments (client_id)
    ''');

    await db.execute('''
      CREATE INDEX IF NOT EXISTS idx_offline_payments_quotation 
      ON offline_payments (quotation_id)
    ''');

    // Partial indexes so the "what is still pending?" scan stays cheap.
    for (final table in syncableTables) {
      await db.execute('''
        CREATE INDEX IF NOT EXISTS idx_${table}_pending
        ON $table (client_id, sync_status)
      ''');
    }

    // Content manifest table (local cache of server manifest)
    await db.execute('''
      CREATE TABLE IF NOT EXISTS offline_content_manifest (
        client_id TEXT NOT NULL DEFAULT '',
        content_type TEXT NOT NULL DEFAULT '',
        version INTEGER NOT NULL DEFAULT 1,
        last_modified TEXT NOT NULL DEFAULT '',
        checksum TEXT NOT NULL DEFAULT '',
        item_count INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (client_id, content_type)
      )
    ''');

    // App configuration table (local cache of dynamic config).
    // Composite PK — see the _dbVersion comment: a single-column key leaked
    // white-label config across tenants.
    await db.execute('''
      CREATE TABLE IF NOT EXISTS offline_app_config (
        client_id TEXT NOT NULL DEFAULT '',
        config_key TEXT NOT NULL DEFAULT '',
        config_value TEXT NOT NULL DEFAULT '',
        value_type TEXT NOT NULL DEFAULT 'string',
        updated_at TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (client_id, config_key)
      )
    ''');

    // Feature flags table (local cache of feature flags). Composite PK for the
    // same tenant-isolation reason as offline_app_config.
    await db.execute('''
      CREATE TABLE IF NOT EXISTS offline_feature_flags (
        client_id TEXT NOT NULL DEFAULT '',
        feature_key TEXT NOT NULL DEFAULT '',
        tier TEXT NOT NULL DEFAULT 'base',
        enabled INTEGER NOT NULL DEFAULT 0,
        description TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (client_id, feature_key)
      )
    ''');

    debugPrint('OfflineDatabase: all tables created (v$version)');
  }

  /// Upgrade tables when the database version changes.
  ///
  /// Every branch must be additive or must rebuild a pure cache table. Never
  /// drop a table that can hold unpushed (pending_*) rows.
  Future<void> _upgradeTables(Database db, int oldVersion, int newVersion) async {
    debugPrint('OfflineDatabase: upgrading from v$oldVersion to v$newVersion');

    if (oldVersion < 2) {
      // v1 keyed config/flags/manifest by key alone -> cross-tenant bleed.
      // These three tables are pure server-side caches with no pending rows,
      // so rebuilding them is lossless (the next sync refills them).
      await db.execute('DROP TABLE IF EXISTS offline_app_config');
      await db.execute('DROP TABLE IF EXISTS offline_feature_flags');
      await db.execute('DROP TABLE IF EXISTS offline_content_manifest');

      await db.execute('''
        CREATE TABLE IF NOT EXISTS offline_content_manifest (
          client_id TEXT NOT NULL DEFAULT '',
          content_type TEXT NOT NULL DEFAULT '',
          version INTEGER NOT NULL DEFAULT 1,
          last_modified TEXT NOT NULL DEFAULT '',
          checksum TEXT NOT NULL DEFAULT '',
          item_count INTEGER NOT NULL DEFAULT 0,
          synced_at TEXT NOT NULL DEFAULT '',
          PRIMARY KEY (client_id, content_type)
        )
      ''');

      await db.execute('''
        CREATE TABLE IF NOT EXISTS offline_app_config (
          client_id TEXT NOT NULL DEFAULT '',
          config_key TEXT NOT NULL DEFAULT '',
          config_value TEXT NOT NULL DEFAULT '',
          value_type TEXT NOT NULL DEFAULT 'string',
          updated_at TEXT NOT NULL DEFAULT '',
          PRIMARY KEY (client_id, config_key)
        )
      ''');

      await db.execute('''
        CREATE TABLE IF NOT EXISTS offline_feature_flags (
          client_id TEXT NOT NULL DEFAULT '',
          feature_key TEXT NOT NULL DEFAULT '',
          tier TEXT NOT NULL DEFAULT 'base',
          enabled INTEGER NOT NULL DEFAULT 0,
          description TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL DEFAULT '',
          PRIMARY KEY (client_id, feature_key)
        )
      ''');

      // `local_data` was missing on customers/payments, so a pending row had
      // nothing to push. Added here; ALTER is a no-op if it already exists.
      await _addColumnIfMissing(db, 'offline_customers', 'local_data',
          "TEXT NOT NULL DEFAULT '{}'");
      await _addColumnIfMissing(db, 'offline_payments', 'local_data',
          "TEXT NOT NULL DEFAULT '{}'");

      for (final table in syncableTables) {
        await db.execute('''
          CREATE INDEX IF NOT EXISTS idx_${table}_pending
          ON $table (client_id, sync_status)
        ''');
      }
    }
  }

  Future<void> _addColumnIfMissing(
    Database db,
    String table,
    String column,
    String definition,
  ) async {
    try {
      final info = await db.rawQuery('PRAGMA table_info($table)');
      final exists = info.any((row) => row['name'] == column);
      if (!exists) {
        await db.execute('ALTER TABLE $table ADD COLUMN $column $definition');
      }
    } catch (e) {
      debugPrint('OfflineDatabase: add column $table.$column failed: $e');
    }
  }

  /// Run [action] against the database, returning [fallback] when the database
  /// is unavailable (web) or the statement throws. Nothing here may propagate.
  Future<T> _guard<T>(
    Future<T> Function(Database db) action,
    T fallback, {
    String label = 'query',
  }) async {
    try {
      final db = await databaseOrNull;
      if (db == null) return fallback;
      return await action(db);
    } catch (e) {
      debugPrint('OfflineDatabase: $label failed: $e');
      return fallback;
    }
  }

  // ---------------------------------------------------------------------------
  // Products
  // ---------------------------------------------------------------------------

  /// Get all products for a client, ordered by category then name.
  Future<List<Product>> getProducts(String clientId) async {
    final cid = _cid(clientId);
    if (!_persistent) {
      final rows = (_memProducts[cid] ?? {}).values.toList()
        ..sort((a, b) {
          final c = (a['category'] as String? ?? '')
              .compareTo(b['category'] as String? ?? '');
          return c != 0
              ? c
              : (a['name'] as String? ?? '').compareTo(b['name'] as String? ?? '');
        });
      return rows.map(_productFromRow).toList();
    }
    return _guard<List<Product>>(
      (db) async {
        final rows = await db.query(
          'offline_products',
          where: 'client_id = ? AND soft_deleted = 0',
          whereArgs: [cid],
          orderBy: 'category ASC, name ASC',
        );
        return rows.map(_productFromRow).toList();
      },
      const <Product>[],
      label: 'getProducts',
    );
  }

  /// Get measured products (unit = SFT) for a client.
  Future<List<Product>> getMeasuredProducts(String clientId) async {
    final all = await getProducts(clientId);
    return all.where((p) => p.isMeasured).toList();
  }

  /// Get unmeasured products (unit != SFT) for a client.
  Future<List<Product>> getUnmeasuredProducts(String clientId) async {
    final all = await getProducts(clientId);
    return all.where((p) => !p.isMeasured).toList();
  }

  /// Get distinct categories for a client.
  Future<List<String>> getCategories(String clientId) async {
    final cid = _cid(clientId);
    if (!_persistent) {
      final set = <String>{};
      for (final row in (_memProducts[cid] ?? {}).values) {
        final c = row['category'] as String? ?? '';
        if (c.isNotEmpty) set.add(c);
      }
      final list = set.toList()..sort();
      return list;
    }
    return _guard<List<String>>(
      (db) async {
        // NOTE: single quotes. In SQLite "" is an *identifier*, not a string
        // literal — the old `category != ""` only worked by legacy fallback.
        final rows = await db.rawQuery(
          "SELECT DISTINCT category FROM offline_products "
          "WHERE client_id = ? AND soft_deleted = 0 AND category != '' "
          "ORDER BY category ASC",
          [cid],
        );
        return rows
            .map((r) => r['category'] as String? ?? '')
            .where((c) => c.isNotEmpty)
            .toList();
      },
      const <String>[],
      label: 'getCategories',
    );
  }

  /// Upsert a product into the local database.
  Future<void> upsertProduct(Product product, String clientId) =>
      upsertProducts([product], clientId);

  /// Upsert multiple products in a transaction.
  Future<void> upsertProducts(List<Product> products, String clientId) async {
    await upsertProductRows(
      products.map((p) => p.toMap(clientId: clientId)).toList(),
      clientId,
    );
  }

  /// Upsert raw product rows straight from the server.
  ///
  /// Preferred over [upsertProducts] on the pull path because it preserves the
  /// server's `updated_at`, which is what [getLastProductSync] uses as the
  /// delta cursor. Converting to [Product] first throws that timestamp away
  /// (the model has no updatedAt field) and makes every pull look "fresh".
  Future<void> upsertProductRows(
    List<Map<String, dynamic>> rows,
    String clientId,
  ) async {
    final cid = _cid(clientId);
    if (cid.isEmpty) return;
    final now = DateTime.now().toIso8601String();

    Map<String, dynamic> toRow(Map<String, dynamic> src) {
      final serverUpdated = (src['updated_at'] ?? src['server_updated_at'] ?? '')
          .toString();
      return {
        'id': (src['id'] ?? '').toString(),
        'client_id': cid,
        'name': (src['name'] ?? '').toString(),
        'category': (src['category'] ?? '').toString(),
        'description': (src['description'] ?? '').toString(),
        'price': (src['price'] as num?)?.toDouble() ?? 0,
        'unit': ((src['unit'] ?? 'SFT').toString().isEmpty)
            ? 'SFT'
            : (src['unit'] ?? 'SFT').toString(),
        'soft_deleted': (src['soft_deleted'] == true) ? 1 : 0,
        'sync_status': statusSynced,
        'created_at': (src['created_at'] ?? '').toString(),
        'updated_at': serverUpdated.isEmpty ? now : serverUpdated,
        'server_updated_at': serverUpdated,
      };
    }

    final mapped = rows
        .map(toRow)
        .where((r) => (r['id'] as String).isNotEmpty)
        .toList();
    if (mapped.isEmpty) return;

    if (!_persistent) {
      final bucket = _memProducts.putIfAbsent(cid, () => {});
      for (final row in mapped) {
        bucket[row['id'] as String] = row;
      }
      return;
    }

    await _guard<void>(
      (db) async {
        await db.transaction((txn) async {
          for (final row in mapped) {
            await txn.insert(
              'offline_products',
              row,
              conflictAlgorithm: ConflictAlgorithm.replace,
            );
          }
        });
      },
      null,
      label: 'upsertProductRows',
    );
  }

  /// Get the last server-side timestamp we hold for products — the delta
  /// cursor for the pull path.
  Future<DateTime?> getLastProductSync(String clientId) async {
    final cid = _cid(clientId);
    return _guard<DateTime?>(
      (db) async {
        final rows = await db.rawQuery(
          'SELECT MAX(server_updated_at) as last_sync FROM offline_products '
          'WHERE client_id = ?',
          [cid],
        );
        final lastSync = rows.isEmpty ? null : rows.first['last_sync'] as String?;
        return (lastSync != null && lastSync.isNotEmpty)
            ? DateTime.tryParse(lastSync)
            : null;
      },
      null,
      label: 'getLastProductSync',
    );
  }

  Product _productFromRow(Map<String, dynamic> row) {
    return Product(
      id: row['id'] as String?,
      name: row['name'] as String? ?? '',
      category: row['category'] as String? ?? '',
      description: row['description'] as String? ?? '',
      price: (row['price'] as num?)?.toDouble() ?? 0,
      unit: row['unit'] as String? ?? 'SFT',
    );
  }

  // ---------------------------------------------------------------------------
  // Quotations
  // ---------------------------------------------------------------------------

  /// Get all quotations for a client (excluding ones queued for deletion).
  Future<List<Map<String, dynamic>>> getQuotations(String clientId) async {
    final cid = _cid(clientId);
    return _guard<List<Map<String, dynamic>>>(
      (db) => db.query(
        'offline_quotations',
        where: 'client_id = ? AND sync_status != ?',
        whereArgs: [cid, statusPendingDeleted],
        orderBy: 'created_at DESC',
      ),
      const <Map<String, dynamic>>[],
      label: 'getQuotations',
    );
  }

  /// Get quotations pending sync (created/updated/deleted offline).
  Future<List<Map<String, dynamic>>> getPendingQuotations(String clientId) =>
      getPendingRecords('offline_quotations', clientId);

  /// Get pending rows for any syncable table.
  Future<List<Map<String, dynamic>>> getPendingRecords(
    String table,
    String clientId,
  ) async {
    if (!syncableTables.contains(table)) {
      debugPrint('OfflineDatabase: refusing pending query on unknown "$table"');
      return const [];
    }
    final cid = _cid(clientId);
    if (cid.isEmpty) return const [];
    return _guard<List<Map<String, dynamic>>>(
      (db) => db.query(
        table,
        where: 'client_id = ? AND sync_status != ?',
        whereArgs: [cid, statusSynced],
        orderBy: 'updated_at ASC',
      ),
      const <Map<String, dynamic>>[],
      label: 'getPendingRecords($table)',
    );
  }

  /// Upsert a quotation into the local database.
  ///
  /// [syncStatus] must be one of [statusSynced], [statusPendingCreated],
  /// [statusPendingUpdated], [statusPendingDeleted].
  Future<void> upsertQuotation(
    Map<String, dynamic> quotation,
    String clientId, {
    String syncStatus = statusSynced,
  }) async {
    final cid = _cid(clientId);
    final id = (quotation['id'] ?? quotation['uuid'] ?? '').toString();
    if (cid.isEmpty || id.isEmpty) return;
    final now = DateTime.now().toIso8601String();
    final serverUpdated = (quotation['updated_at'] ?? '').toString();

    final row = {
      'id': id,
      'client_id': cid,
      'quote_no': (quotation['quote_no'] ?? '').toString(),
      'date': (quotation['date'] ?? '').toString(),
      'customer_name': (quotation['customer_name'] ?? '').toString(),
      'reference': (quotation['reference'] ?? '').toString(),
      'address': (quotation['address'] ?? '').toString(),
      'contact_no': (quotation['contact_no'] ?? '').toString(),
      'email': (quotation['email'] ?? '').toString(),
      'transport_cost': (quotation['transport_cost'] as num?)?.toDouble() ?? 0,
      'include_gst': (quotation['include_gst'] == true) ? 1 : 0,
      'gst_percentage': (quotation['gst_percentage'] as num?)?.toDouble() ?? 0,
      'status': (quotation['status'] ?? 'draft').toString(),
      'supplier_company': (quotation['supplier_company'] ?? '').toString(),
      'viewed_at': quotation['viewed_at'],
      'view_count': (quotation['view_count'] as num?)?.toInt() ?? 0,
      'payment_status': (quotation['payment_status'] ?? 'unpaid').toString(),
      'amount_paid': (quotation['amount_paid'] as num?)?.toDouble() ?? 0,
      'sync_status': _normalizeStatus(syncStatus),
      'local_data': jsonEncode(quotation),
      // REPLACE deletes the old row, so created_at has to be re-supplied or it
      // resets to '' and the `ORDER BY created_at DESC` list collapses.
      'created_at': (quotation['created_at'] ?? '').toString().isNotEmpty
          ? quotation['created_at'].toString()
          : (await _existingCreatedAt('offline_quotations', id, cid) ?? now),
      'updated_at': serverUpdated.isEmpty ? now : serverUpdated,
      'server_updated_at': serverUpdated,
    };

    await _writeRow('offline_quotations', row, label: 'upsertQuotation');
  }

  // ---------------------------------------------------------------------------
  // Customers
  // ---------------------------------------------------------------------------

  /// Get all customers for a client.
  Future<List<Map<String, dynamic>>> getCustomers(String clientId) async {
    final cid = _cid(clientId);
    return _guard<List<Map<String, dynamic>>>(
      (db) => db.query(
        'offline_customers',
        where: 'client_id = ? AND sync_status != ?',
        whereArgs: [cid, statusPendingDeleted],
        orderBy: 'name ASC',
      ),
      const <Map<String, dynamic>>[],
      label: 'getCustomers',
    );
  }

  /// Upsert a customer into the local database.
  Future<void> upsertCustomer(
    Map<String, dynamic> customer,
    String clientId, {
    String syncStatus = statusSynced,
  }) async {
    final cid = _cid(clientId);
    final id = (customer['id'] ?? customer['uuid'] ?? '').toString();
    if (cid.isEmpty || id.isEmpty) return;
    final now = DateTime.now().toIso8601String();
    final serverUpdated = (customer['updated_at'] ?? '').toString();

    final row = {
      'id': id,
      'client_id': cid,
      'name': (customer['name'] ?? '').toString(),
      'contact': (customer['contact'] ?? '').toString(),
      'email': (customer['email'] ?? '').toString(),
      'address': (customer['address'] ?? '').toString(),
      'sync_status': _normalizeStatus(syncStatus),
      'local_data': jsonEncode(customer),
      'created_at': (customer['created_at'] ?? '').toString().isNotEmpty
          ? customer['created_at'].toString()
          : (await _existingCreatedAt('offline_customers', id, cid) ?? now),
      'updated_at': serverUpdated.isEmpty ? now : serverUpdated,
      'server_updated_at': serverUpdated,
    };

    await _writeRow('offline_customers', row, label: 'upsertCustomer');
  }

  // ---------------------------------------------------------------------------
  // Payments
  // ---------------------------------------------------------------------------

  /// Get all payments for a client.
  Future<List<Map<String, dynamic>>> getPayments(String clientId) async {
    final cid = _cid(clientId);
    return _guard<List<Map<String, dynamic>>>(
      (db) => db.query(
        'offline_payments',
        where: 'client_id = ? AND sync_status != ?',
        whereArgs: [cid, statusPendingDeleted],
        orderBy: 'paid_at DESC',
      ),
      const <Map<String, dynamic>>[],
      label: 'getPayments',
    );
  }

  /// Get payments for a specific quotation.
  Future<List<Map<String, dynamic>>> getPaymentsForQuotation(
    String clientId,
    String quotationId,
  ) async {
    final cid = _cid(clientId);
    return _guard<List<Map<String, dynamic>>>(
      (db) => db.query(
        'offline_payments',
        where: 'client_id = ? AND quotation_id = ? AND sync_status != ?',
        whereArgs: [cid, quotationId, statusPendingDeleted],
        orderBy: 'paid_at DESC',
      ),
      const <Map<String, dynamic>>[],
      label: 'getPaymentsForQuotation',
    );
  }

  /// Upsert a payment into the local database.
  Future<void> upsertPayment(
    Map<String, dynamic> payment,
    String clientId, {
    String syncStatus = statusSynced,
  }) async {
    final cid = _cid(clientId);
    final id = (payment['id'] ?? payment['uuid'] ?? '').toString();
    if (cid.isEmpty || id.isEmpty) return;
    final now = DateTime.now().toIso8601String();
    final serverUpdated = (payment['updated_at'] ?? '').toString();

    final row = {
      'id': id,
      'client_id': cid,
      'quotation_id': payment['quotation_id'],
      'customer_id': payment['customer_id'],
      'customer_name': (payment['customer_name'] ?? '').toString(),
      'amount': (payment['amount'] as num?)?.toDouble() ?? 0,
      'method': (payment['method'] ?? 'upi').toString(),
      'reference': (payment['reference'] ?? '').toString(),
      'note': (payment['note'] ?? '').toString(),
      'paid_at': (payment['paid_at'] ?? now).toString(),
      'sync_status': _normalizeStatus(syncStatus),
      'local_data': jsonEncode(payment),
      'created_at': (payment['created_at'] ?? '').toString().isNotEmpty
          ? payment['created_at'].toString()
          : (await _existingCreatedAt('offline_payments', id, cid) ?? now),
      'updated_at': serverUpdated.isEmpty ? now : serverUpdated,
      'server_updated_at': serverUpdated,
    };

    await _writeRow('offline_payments', row, label: 'upsertPayment');
  }

  // ---------------------------------------------------------------------------
  // Sync-status transitions
  // ---------------------------------------------------------------------------

  /// Coerce an arbitrary string onto the sync_status contract. An unknown
  /// value silently becoming a permanent "pending" row is a worse failure than
  /// treating it as synced, so unknown -> synced with a loud log.
  String _normalizeStatus(String status) {
    switch (status) {
      case statusSynced:
      case statusPendingCreated:
      case statusPendingUpdated:
      case statusPendingDeleted:
        return status;
      default:
        debugPrint('OfflineDatabase: unknown sync_status "$status" -> synced');
        return statusSynced;
    }
  }

  Future<String?> _existingCreatedAt(
    String table,
    String id,
    String clientId,
  ) async {
    return _guard<String?>(
      (db) async {
        final rows = await db.query(
          table,
          columns: ['created_at'],
          where: 'id = ? AND client_id = ?',
          whereArgs: [id, clientId],
          limit: 1,
        );
        if (rows.isEmpty) return null;
        final value = rows.first['created_at'] as String?;
        return (value == null || value.isEmpty) ? null : value;
      },
      null,
      label: 'existingCreatedAt($table)',
    );
  }

  Future<void> _writeRow(
    String table,
    Map<String, dynamic> row, {
    required String label,
  }) async {
    if (!_persistent) return; // web: no durable write queue, by design
    await _guard<void>(
      (db) => db.insert(table, row,
          conflictAlgorithm: ConflictAlgorithm.replace),
      null,
      label: label,
    );
  }

  /// Mark a pushed record as synced. Always scoped by client_id.
  Future<void> markSynced(String table, String id, String clientId) async {
    if (!syncableTables.contains(table)) return;
    final cid = _cid(clientId);
    if (cid.isEmpty || id.isEmpty) return;
    await _guard<void>(
      (db) => db.update(
        table,
        {'sync_status': statusSynced},
        where: 'id = ? AND client_id = ?',
        whereArgs: [id, cid],
      ),
      null,
      label: 'markSynced($table)',
    );
  }

  /// Physically remove a row after the server confirmed the delete.
  ///
  /// A `pending_deleted` row that is merely flipped back to `synced` will be
  /// re-listed in the UI forever — the delete has to actually land locally.
  Future<void> deleteLocalRecord(String table, String id, String clientId) async {
    if (!syncableTables.contains(table)) return;
    final cid = _cid(clientId);
    if (cid.isEmpty || id.isEmpty) return;
    await _guard<void>(
      (db) => db.delete(
        table,
        where: 'id = ? AND client_id = ?',
        whereArgs: [id, cid],
      ),
      null,
      label: 'deleteLocalRecord($table)',
    );
  }

  /// The set of ids on [table] that still carry a pending_* status.
  ///
  /// Used by the pull path: server-wins is the rule, but a row whose push has
  /// not been attempted yet must not be clobbered before it gets its turn, or
  /// the user's offline edit disappears with no trace.
  Future<Set<String>> getPendingIds(String table, String clientId) async {
    final rows = await getPendingRecords(table, clientId);
    return rows
        .map((r) => (r['id'] ?? '').toString())
        .where((id) => id.isNotEmpty)
        .toSet();
  }

  // ---------------------------------------------------------------------------
  // Content Manifest
  // ---------------------------------------------------------------------------

  /// Get the local content manifest.
  Future<Map<String, Map<String, dynamic>>> getContentManifest(
    String clientId,
  ) async {
    final cid = _cid(clientId);
    if (!_persistent) {
      return Map<String, Map<String, dynamic>>.from(_memManifest[cid] ?? {});
    }
    return _guard<Map<String, Map<String, dynamic>>>(
      (db) async {
        final rows = await db.query(
          'offline_content_manifest',
          where: 'client_id = ?',
          whereArgs: [cid],
        );
        final manifest = <String, Map<String, dynamic>>{};
        for (final row in rows) {
          manifest[row['content_type'] as String] = row;
        }
        return manifest;
      },
      <String, Map<String, dynamic>>{},
      label: 'getContentManifest',
    );
  }

  /// Upsert a content manifest entry.
  Future<void> upsertContentManifest(
    String contentType,
    String clientId, {
    required int version,
    required String lastModified,
    String checksum = '',
    int itemCount = 0,
  }) async {
    final cid = _cid(clientId);
    if (cid.isEmpty || contentType.isEmpty) return;
    final row = {
      'client_id': cid,
      'content_type': contentType,
      'version': version,
      'last_modified': lastModified,
      'checksum': checksum,
      'item_count': itemCount,
      'synced_at': DateTime.now().toIso8601String(),
    };

    if (!_persistent) {
      _memManifest.putIfAbsent(cid, () => {})[contentType] = row;
      return;
    }
    await _guard<void>(
      (db) => db.insert('offline_content_manifest', row,
          conflictAlgorithm: ConflictAlgorithm.replace),
      null,
      label: 'upsertContentManifest',
    );
  }

  /// Get the last sync timestamp for a content type (SharedPreferences-backed,
  /// so it works on web too). Scoped by the active client.
  Future<DateTime?> getContentSyncTime(String contentType,
      {String? clientId}) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final timestamp = prefs.getString(_syncTimeKey(contentType, clientId));
      return timestamp != null ? DateTime.tryParse(timestamp) : null;
    } catch (e) {
      debugPrint('OfflineDatabase: getContentSyncTime failed: $e');
      return null;
    }
  }

  /// Set the last sync timestamp for a content type.
  Future<void> setContentSyncTime(String contentType, DateTime time,
      {String? clientId}) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
          _syncTimeKey(contentType, clientId), time.toIso8601String());
    } catch (e) {
      debugPrint('OfflineDatabase: setContentSyncTime failed: $e');
    }
  }

  String _syncTimeKey(String contentType, String? clientId) =>
      'sync_time_${_cid(clientId)}_$contentType';

  // ---------------------------------------------------------------------------
  // App Config
  // ---------------------------------------------------------------------------

  /// Get a config value by key, scoped to the active (or given) client.
  Future<String?> getConfigValue(String key, {String? clientId}) async {
    final cid = _cid(clientId);
    if (!_persistent) return _memConfig[cid]?[key];
    return _guard<String?>(
      (db) async {
        final rows = await db.query(
          'offline_app_config',
          where: 'config_key = ? AND client_id = ?',
          whereArgs: [key, cid],
          limit: 1,
        );
        if (rows.isEmpty) return null;
        return rows.first['config_value'] as String?;
      },
      null,
      label: 'getConfigValue',
    );
  }

  /// Get all config values for the active (or given) client.
  Future<Map<String, String>> getAllConfig({String? clientId}) async {
    final cid = _cid(clientId);
    if (!_persistent) return Map<String, String>.from(_memConfig[cid] ?? {});
    return _guard<Map<String, String>>(
      (db) async {
        final rows = await db.query(
          'offline_app_config',
          where: 'client_id = ?',
          whereArgs: [cid],
        );
        final config = <String, String>{};
        for (final row in rows) {
          config[row['config_key'] as String] =
              row['config_value'] as String? ?? '';
        }
        return config;
      },
      <String, String>{},
      label: 'getAllConfig',
    );
  }

  /// Upsert a config value.
  Future<void> upsertConfig(
    String key,
    String value, {
    String valueType = 'string',
    String? clientId,
  }) =>
      upsertConfigs({key: value}, valueType: valueType, clientId: clientId);

  /// Upsert multiple config values.
  Future<void> upsertConfigs(
    Map<String, String> configs, {
    String valueType = 'string',
    String? clientId,
  }) async {
    final cid = _cid(clientId);
    if (cid.isEmpty || configs.isEmpty) return;
    final now = DateTime.now().toIso8601String();

    if (!_persistent) {
      _memConfig.putIfAbsent(cid, () => {}).addAll(configs);
      return;
    }
    await _guard<void>(
      (db) async {
        await db.transaction((txn) async {
          for (final entry in configs.entries) {
            await txn.insert(
              'offline_app_config',
              {
                'client_id': cid,
                'config_key': entry.key,
                'config_value': entry.value,
                'value_type': valueType,
                'updated_at': now,
              },
              conflictAlgorithm: ConflictAlgorithm.replace,
            );
          }
        });
      },
      null,
      label: 'upsertConfigs',
    );
  }

  // ---------------------------------------------------------------------------
  // Feature Flags
  // ---------------------------------------------------------------------------

  /// Get a feature flag value for the active (or given) client.
  Future<bool> getFeatureFlag(
    String key, {
    bool defaultValue = false,
    String? clientId,
  }) async {
    final cid = _cid(clientId);
    if (!_persistent) return _memFlags[cid]?[key] ?? defaultValue;
    return _guard<bool>(
      (db) async {
        final rows = await db.query(
          'offline_feature_flags',
          where: 'feature_key = ? AND client_id = ?',
          whereArgs: [key, cid],
          limit: 1,
        );
        if (rows.isEmpty) return defaultValue;
        return (rows.first['enabled'] as int?) == 1;
      },
      defaultValue,
      label: 'getFeatureFlag',
    );
  }

  /// Get all feature flags for the active (or given) client.
  Future<Map<String, bool>> getAllFeatureFlags({String? clientId}) async {
    final cid = _cid(clientId);
    if (!_persistent) return Map<String, bool>.from(_memFlags[cid] ?? {});
    return _guard<Map<String, bool>>(
      (db) async {
        final rows = await db.query(
          'offline_feature_flags',
          where: 'client_id = ?',
          whereArgs: [cid],
        );
        final flags = <String, bool>{};
        for (final row in rows) {
          flags[row['feature_key'] as String] = (row['enabled'] as int?) == 1;
        }
        return flags;
      },
      <String, bool>{},
      label: 'getAllFeatureFlags',
    );
  }

  /// Upsert a feature flag.
  Future<void> upsertFeatureFlag(
    String key,
    bool enabled, {
    String description = '',
    String tier = 'base',
    String? clientId,
  }) async {
    await _upsertFlagRows({key: enabled},
        description: description, tier: tier, clientId: clientId);
  }

  /// Upsert multiple feature flags.
  Future<void> upsertFeatureFlags(
    Map<String, bool> flags, {
    String tier = 'base',
    String? clientId,
  }) =>
      _upsertFlagRows(flags, tier: tier, clientId: clientId);

  Future<void> _upsertFlagRows(
    Map<String, bool> flags, {
    String description = '',
    String tier = 'base',
    String? clientId,
  }) async {
    final cid = _cid(clientId);
    if (cid.isEmpty || flags.isEmpty) return;
    final now = DateTime.now().toIso8601String();

    if (!_persistent) {
      _memFlags.putIfAbsent(cid, () => {}).addAll(flags);
      return;
    }
    await _guard<void>(
      (db) async {
        await db.transaction((txn) async {
          for (final entry in flags.entries) {
            await txn.insert(
              'offline_feature_flags',
              {
                'client_id': cid,
                'feature_key': entry.key,
                'tier': tier,
                'enabled': entry.value ? 1 : 0,
                'description': description,
                'updated_at': now,
              },
              conflictAlgorithm: ConflictAlgorithm.replace,
            );
          }
        });
      },
      null,
      label: 'upsertFeatureFlags',
    );
  }

  // ---------------------------------------------------------------------------
  // Sync Status Queries
  // ---------------------------------------------------------------------------

  /// Get the count of pending sync items across every syncable table.
  Future<int> getPendingSyncCount(String clientId) async {
    final cid = _cid(clientId);
    if (cid.isEmpty) return 0;
    final union = syncableTables
        .map((t) =>
            "SELECT id FROM $t WHERE client_id = ? AND sync_status != 'synced'")
        .join('\n        UNION ALL\n        ');
    return _guard<int>(
      (db) async {
        final result = await db.rawQuery(
          'SELECT COUNT(*) as count FROM (\n        $union\n      )',
          List<String>.filled(syncableTables.length, cid),
        );
        return Sqflite.firstIntValue(result) ?? 0;
      },
      0,
      label: 'getPendingSyncCount',
    );
  }

  // ---------------------------------------------------------------------------
  // Maintenance
  // ---------------------------------------------------------------------------

  /// Close the database and reset state so a later [initialize] can re-open it.
  Future<void> close() async {
    try {
      await _db?.close();
    } catch (e) {
      debugPrint('OfflineDatabase: close failed: $e');
    }
    _db = null;
    _initCompleter = null;
    _initialized = false;
    _persistent = false;
  }

  /// Delete all data for a client (e.g., on logout).
  Future<void> clearClientData(String clientId) async {
    final cid = _cid(clientId);
    if (cid.isEmpty) return;

    _memProducts.remove(cid);
    _memConfig.remove(cid);
    _memFlags.remove(cid);
    _memManifest.remove(cid);

    await _guard<void>(
      (db) async {
        await db.transaction((txn) async {
          for (final table in [
            'offline_products',
            ...syncableTables,
            'offline_content_manifest',
            'offline_app_config',
            'offline_feature_flags',
          ]) {
            await txn.delete(table, where: 'client_id = ?', whereArgs: [cid]);
          }
        });
      },
      null,
      label: 'clearClientData',
    );
  }
}
