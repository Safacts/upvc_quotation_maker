import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../models_sync.dart';
import '../supabase_config.dart';
import 'offline_database.dart';
import 'connectivity_service.dart';

/// Sync engine that handles bidirectional synchronization between
/// the local SQLite database and Supabase.
///
/// Strategy:
/// - **Push first**, then pull. Order matters: pulling first would overwrite
///   an offline edit with the server copy before that edit was ever sent, and
///   the user's work would vanish with no error.
/// - **Pull** is delta-based. The manifest version gates *whether* to fetch;
///   the `since` cursor (max server `updated_at` we already hold) narrows
///   *what* is fetched. On the first sync there is no cursor, so a full
///   snapshot is pulled — a delta that silently drops rows is worse than an
///   occasional full fetch.
/// - **Conflict resolution: server-wins**, with one carve-out — a local row
///   still marked `pending_*` is not overwritten by the pull in the same
///   cycle, because its push either just failed or has not been attempted.
///   It will be pushed and then converge on the next run.
/// - **Re-entrancy:** a single [_isSyncing] flag plus an in-flight future. A
///   second caller awaits the first result instead of starting a parallel run
///   that would interleave writes on the same rows.
///
/// ## Flutter Web
/// [OfflineDatabase] has no persistent store in a browser, so the push queue
/// is empty by construction and the pull only warms an in-memory cache. Sync
/// stays a no-op-ish background refresh and must never throw into startup.
class SyncEngine {
  SyncEngine._();
  static final SyncEngine instance = SyncEngine._();

  final OfflineDatabase _db = OfflineDatabase.instance;
  final ConnectivityService _connectivity = ConnectivityService.instance;

  /// Base origin for the Next.js API. On web we use relative URLs so the app
  /// works on every client's custom domain and on localhost.
  static const String _apiOrigin = 'https://app.vitharn.com';

  static const Duration _httpTimeout = Duration(seconds: 20);
  static const Duration _syncInterval = Duration(minutes: 5);

  /// Stream of sync status updates.
  final _syncStatusController = StreamController<SyncStatus>.broadcast();
  Stream<SyncStatus> get syncStatusStream => _syncStatusController.stream;

  /// Current sync status.
  SyncStatus _currentStatus = SyncStatus.idle;
  SyncStatus get currentStatus => _currentStatus;

  /// Whether a sync is currently in progress.
  bool _isSyncing = false;
  bool get isSyncing => _isSyncing;

  /// The in-flight run, so concurrent callers share one result.
  Future<SyncResult>? _inFlight;

  /// Last successful sync timestamp.
  DateTime? _lastSyncTime;
  DateTime? get lastSyncTime => _lastSyncTime;

  /// Timer for periodic sync.
  Timer? _periodicSyncTimer;

  /// Connectivity listener — retained so it can be cancelled on dispose.
  StreamSubscription<bool>? _connectivitySub;

  bool _disposed = false;

  /// Initialize the sync engine. Never throws: a sync failure must not be able
  /// to take down app startup.
  Future<void> initialize({String? clientId}) async {
    try {
      _disposed = false;
      await _db.initialize();

      final cid = clientId ?? _getClientId();
      if (cid != null && cid.isNotEmpty) {
        // Every downstream cache read (config, flags, manifest) is scoped by
        // this. Set it before FeatureFlagService/WhiteLabelService initialize.
        _db.setActiveClient(cid);
      }

      _startPeriodicSync();
      _listenForReconnect();
      debugPrint('SyncEngine initialized (persistent=${_db.isPersistent})');
    } catch (e, st) {
      debugPrint('SyncEngine: initialize failed (non-fatal): $e\n$st');
    }
  }

  /// Start periodic sync (every 5 minutes when online).
  void _startPeriodicSync() {
    _periodicSyncTimer?.cancel();
    _periodicSyncTimer = Timer.periodic(_syncInterval, (_) {
      // Fire-and-forget, but swallow errors so an unhandled rejection cannot
      // escape the timer callback.
      unawaited(syncIfOnline().catchError((Object e) {
        debugPrint('SyncEngine: periodic sync error: $e');
      }));
    });
  }

  /// Sync as soon as the device comes back online — that is the whole point of
  /// the offline queue.
  void _listenForReconnect() {
    _connectivitySub?.cancel();
    _connectivitySub = _connectivity.connectivityStream.listen(
      (online) {
        if (!online || _disposed) return;
        unawaited(syncAll().catchError((Object e) {
          debugPrint('SyncEngine: reconnect sync error: $e');
          return SyncResult(success: false, errorMessage: e.toString());
        }));
      },
      onError: (Object e) => debugPrint('SyncEngine: connectivity error: $e'),
      cancelOnError: false,
    );
  }

  /// Stop periodic sync.
  void stopPeriodicSync() {
    _periodicSyncTimer?.cancel();
    _periodicSyncTimer = null;
  }

  /// Sync only if the device is online.
  Future<void> syncIfOnline() async {
    try {
      if (await _connectivity.checkOnline()) {
        await syncAll();
      }
    } catch (e) {
      debugPrint('SyncEngine: syncIfOnline failed: $e');
    }
  }

  /// Perform a full sync (push, then pull).
  ///
  /// Re-entrant callers get the in-flight run's result rather than starting a
  /// second concurrent sync.
  Future<SyncResult> syncAll({String? clientId}) {
    final existing = _inFlight;
    if (existing != null) return existing;

    final run = _runSync(clientId: clientId);
    _inFlight = run;
    return run.whenComplete(() {
      _inFlight = null;
      _isSyncing = false;
    });
  }

  Future<SyncResult> _runSync({String? clientId}) async {
    _isSyncing = true;
    _setStatus(SyncStatus.syncing);

    final stopwatch = Stopwatch()..start();
    int itemsSynced = 0;
    int itemsFailed = 0;
    String errorMessage = '';

    try {
      final cid = clientId ?? _getClientId();
      if (cid == null || cid.isEmpty) {
        stopwatch.stop();
        _setStatus(SyncStatus.idle);
        return SyncResult(
          success: false,
          errorMessage: 'No client ID available',
          syncType: 'bidirectional',
          durationMs: stopwatch.elapsedMilliseconds,
        );
      }
      _db.setActiveClient(cid);

      // Step 1: Push local changes to server (BEFORE pulling — see class doc).
      final pushResult = await _pushLocalChanges(cid);
      itemsSynced += pushResult.itemsSynced;
      itemsFailed += pushResult.itemsFailed;
      if (pushResult.errorMessage.isNotEmpty) {
        errorMessage = pushResult.errorMessage;
      }

      // Step 2: Pull latest content from server
      final pullResult = await _pullServerContent(cid);
      itemsSynced += pullResult.itemsSynced;
      itemsFailed += pullResult.itemsFailed;
      if (pullResult.errorMessage.isNotEmpty) {
        errorMessage = errorMessage.isEmpty
            ? pullResult.errorMessage
            : '$errorMessage; ${pullResult.errorMessage}';
      }

      // Step 3: Sync feature flags (best effort)
      await _syncFeatureFlags(cid);

      // Step 4: Sync white-label config (best effort)
      await _syncWhiteLabelConfig(cid);

      _lastSyncTime = DateTime.now();
      stopwatch.stop();

      await _logSyncResult(
        cid,
        itemsSynced: itemsSynced,
        itemsFailed: itemsFailed,
        durationMs: stopwatch.elapsedMilliseconds,
        errorMessage: errorMessage,
      );

      _setStatus(itemsFailed == 0 ? SyncStatus.idle : SyncStatus.error);

      return SyncResult(
        success: itemsFailed == 0,
        itemsSynced: itemsSynced,
        itemsFailed: itemsFailed,
        errorMessage: errorMessage,
        syncType: 'bidirectional',
        durationMs: stopwatch.elapsedMilliseconds,
      );
    } catch (e, st) {
      stopwatch.stop();
      errorMessage = e.toString();
      debugPrint('SyncEngine: syncAll failed: $e\n$st');
      _setStatus(SyncStatus.error);

      return SyncResult(
        success: false,
        itemsSynced: itemsSynced,
        itemsFailed: itemsFailed,
        errorMessage: errorMessage,
        syncType: 'bidirectional',
        durationMs: stopwatch.elapsedMilliseconds,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Push
  // ---------------------------------------------------------------------------

  /// Push local changes to the server for every syncable table.
  Future<SyncResult> _pushLocalChanges(String clientId) async {
    int synced = 0;
    int failed = 0;
    final errors = <String>[];

    // Web has no durable queue, so there is nothing to push.
    if (!_db.isPersistent) {
      return SyncResult(success: true, itemsSynced: 0, syncType: 'push');
    }

    const tables = <String, String>{
      'offline_quotations': 'quotations',
      'offline_customers': 'customers',
      'offline_payments': 'payments',
    };

    for (final entry in tables.entries) {
      final localTable = entry.key;
      final remoteTable = entry.value;

      List<Map<String, dynamic>> pending;
      try {
        pending = await _db.getPendingRecords(localTable, clientId);
      } catch (e) {
        debugPrint('SyncEngine: cannot read pending $localTable: $e');
        continue;
      }

      for (final record in pending) {
        final id = (record['id'] ?? '').toString();
        final status = (record['sync_status'] ?? '').toString();
        if (id.isEmpty) continue;

        try {
          switch (status) {
            case OfflineDatabase.statusPendingCreated:
              await _insertOnServer(remoteTable, record, clientId);
              await _db.markSynced(localTable, id, clientId);
              break;

            case OfflineDatabase.statusPendingUpdated:
              await _updateOnServer(remoteTable, id, record, clientId);
              await _db.markSynced(localTable, id, clientId);
              break;

            case OfflineDatabase.statusPendingDeleted:
              await _deleteOnServer(remoteTable, id, clientId);
              // Must physically remove it. Flipping it back to 'synced' would
              // resurrect a row the user deleted, on every subsequent read.
              await _db.deleteLocalRecord(localTable, id, clientId);
              break;

            default:
              debugPrint(
                'SyncEngine: $localTable/$id has unexpected sync_status '
                '"$status" — marking synced to avoid an infinite retry',
              );
              await _db.markSynced(localTable, id, clientId);
              break;
          }
          synced++;
        } catch (e) {
          // Leave sync_status untouched so the row is retried next cycle.
          debugPrint('SyncEngine: push $localTable/$id ($status) failed: $e');
          errors.add('$remoteTable/$id: $e');
          failed++;
        }
      }
    }

    return SyncResult(
      success: failed == 0,
      itemsSynced: synced,
      itemsFailed: failed,
      errorMessage: errors.isEmpty ? '' : errors.take(3).join(' | '),
      syncType: 'push',
    );
  }

  /// The payload to send for a local row. `local_data` holds the full record
  /// as the app knows it; the flattened columns are only for querying.
  Map<String, dynamic> _payloadFor(Map<String, dynamic> record) {
    final raw = (record['local_data'] ?? '').toString();
    if (raw.isEmpty || raw == '{}') return <String, dynamic>{};
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map) return decoded.cast<String, dynamic>();
    } catch (e) {
      debugPrint('SyncEngine: bad local_data JSON, skipping payload: $e');
    }
    return <String, dynamic>{};
  }

  /// Columns that belong to the local cache only and must never be sent to
  /// Postgres — an unknown column makes PostgREST reject the whole row.
  static const Set<String> _localOnlyColumns = {
    'sync_status',
    'local_data',
    'server_updated_at',
    'soft_deleted',
  };

  Map<String, dynamic> _sanitize(Map<String, dynamic> payload) {
    final out = <String, dynamic>{};
    for (final entry in payload.entries) {
      if (_localOnlyColumns.contains(entry.key)) continue;
      out[entry.key] = entry.value;
    }
    return out;
  }

  Future<void> _insertOnServer(
    String table,
    Map<String, dynamic> record,
    String clientId,
  ) async {
    final data = _sanitize(_payloadFor(record));
    if (data.isEmpty) {
      debugPrint('SyncEngine: empty payload for $table insert, skipping.');
      return;
    }
    await SupabaseConfig.client.from(table).insert({
      ...data,
      'client_id': clientId,
    });
  }

  Future<void> _updateOnServer(
    String table,
    String id,
    Map<String, dynamic> record,
    String clientId,
  ) async {
    final data = _sanitize(_payloadFor(record));
    if (data.isEmpty) {
      debugPrint('SyncEngine: empty payload for $table update, skipping.');
      return;
    }
    // Never let the payload rewrite the identity or the tenant.
    data.remove('id');
    data.remove('client_id');

    await SupabaseConfig.client
        .from(table)
        .update(data)
        .eq('id', id)
        .eq('client_id', clientId);
  }

  Future<void> _deleteOnServer(String table, String id, String clientId) async {
    await SupabaseConfig.client
        .from(table)
        .delete()
        .eq('id', id)
        .eq('client_id', clientId);
  }

  // ---------------------------------------------------------------------------
  // Pull
  // ---------------------------------------------------------------------------

  /// Pull latest content from the server.
  Future<SyncResult> _pullServerContent(String clientId) async {
    int synced = 0;
    int failed = 0;
    final errors = <String>[];

    // Cursor captured BEFORE any writes, so rows written during this run are
    // not skipped by the next one.
    final startedAt = DateTime.now();

    try {
      final manifest = await _fetchContentManifest(clientId);
      if (manifest.isEmpty) {
        return SyncResult(success: true, syncType: 'pull');
      }

      // Read the local manifest ONCE. The old code re-read it inside the loop,
      // which is N extra queries for no benefit.
      final localManifest = await _db.getContentManifest(clientId);

      for (final entry in manifest.entries) {
        final contentType = entry.key;
        final serverVersion = _asInt(entry.value['version']) ?? 0;
        final localVersion = _asInt(localManifest[contentType]?['version']) ?? 0;

        if (serverVersion <= localVersion) continue;

        try {
          final result = await _fetchContentDelta(clientId, contentType);
          synced += result.itemsSynced;
          failed += result.itemsFailed;
          if (result.errorMessage.isNotEmpty) errors.add(result.errorMessage);

          // Only advance the local manifest when the fetch actually succeeded.
          // Bumping it on failure would permanently skip that content type:
          // serverVersion would never again be greater than localVersion.
          if (result.itemsFailed == 0) {
            await _db.upsertContentManifest(
              contentType,
              clientId,
              version: serverVersion,
              lastModified: (entry.value['last_modified'] ?? '').toString(),
              checksum: (entry.value['checksum'] ?? '').toString(),
              itemCount: _asInt(entry.value['item_count']) ?? 0,
            );
          }
        } catch (e) {
          debugPrint('SyncEngine: pull $contentType failed: $e');
          errors.add('$contentType: $e');
          failed++;
        }
      }

      if (failed == 0) {
        await _db.setContentSyncTime('all', startedAt, clientId: clientId);
      }
    } catch (e) {
      debugPrint('SyncEngine: pull failed: $e');
      errors.add(e.toString());
      failed++;
    }

    return SyncResult(
      success: failed == 0,
      itemsSynced: synced,
      itemsFailed: failed,
      errorMessage: errors.isEmpty ? '' : errors.take(3).join(' | '),
      syncType: 'pull',
    );
  }

  /// Fetch the content manifest from the server.
  Future<Map<String, Map<String, dynamic>>> _fetchContentManifest(
    String clientId,
  ) async {
    final json = await _getJson(
      '/api/content/manifest',
      {'client_id': clientId},
    );
    if (json == null) return {};

    final manifestList = (json['manifest'] as List?) ?? const [];

    final manifest = <String, Map<String, dynamic>>{};
    for (final item in manifestList) {
      if (item is! Map) continue;
      final map = item.cast<String, dynamic>();
      final type = (map['content_type'] ?? '').toString();
      if (type.isEmpty) continue;
      manifest[type] = map;
    }

    return manifest;
  }

  /// Fetch content delta for a specific content type.
  Future<SyncResult> _fetchContentDelta(
    String clientId,
    String contentType,
  ) async {
    int synced = 0;

    try {
      // Delta cursor. Only products carry a per-row server timestamp locally;
      // the config-shaped content types are small and always fetched whole.
      String? since;
      if (contentType == 'products') {
        final last = await _db.getLastProductSync(clientId);
        // Rewind by a minute: server clocks and `updated_at` writes are not
        // perfectly ordered, and an exact-boundary `gt` silently drops rows
        // written in the same second as the previous sync.
        since = last?.subtract(const Duration(minutes: 1)).toUtc().toIso8601String();
      }

      final json = await _getJson('/api/content/sync', {
        'client_id': clientId,
        'content_type': contentType,
        if (since != null) 'since': since,
      });
      if (json == null) {
        return SyncResult(
          success: false,
          itemsFailed: 1,
          errorMessage: '$contentType: no response',
          syncType: 'pull',
        );
      }

      final changes = (json['changes'] as List?) ?? const [];

      for (final change in changes) {
        if (change is! Map) continue;
        final changeMap = change.cast<String, dynamic>();
        final data = changeMap['data'];
        if (data is! List) {
          // Config-shaped content (terms, bank details) arrives as an object.
          if (data != null) {
            await _db.upsertConfig(
              contentType,
              jsonEncode(data),
              valueType: 'json',
              clientId: clientId,
            );
            synced++;
          }
          continue;
        }

        switch (contentType) {
          case 'products':
            // Raw rows, NOT Product objects: Product drops `updated_at`, which
            // is the delta cursor for the next pull.
            final rows = data
                .whereType<Map>()
                .map((e) => e.cast<String, dynamic>())
                .toList();
            // Products are a read-only server cache — no local pending path,
            // so server-wins applies unconditionally.
            await _db.upsertProductRows(rows, clientId);
            synced += rows.length;
            break;

          case 'customers':
            final rows = data
                .whereType<Map>()
                .map((e) => e.cast<String, dynamic>())
                .toList();
            final kept =
                await _withoutPending('offline_customers', rows, clientId);
            for (final item in kept) {
              await _db.upsertCustomer(item, clientId);
            }
            synced += kept.length;
            break;

          case 'payments':
            final rows = data
                .whereType<Map>()
                .map((e) => e.cast<String, dynamic>())
                .toList();
            final kept =
                await _withoutPending('offline_payments', rows, clientId);
            for (final item in kept) {
              await _db.upsertPayment(item, clientId);
            }
            synced += kept.length;
            break;

          case 'quotations':
            final rows = data
                .whereType<Map>()
                .map((e) => e.cast<String, dynamic>())
                .toList();
            final kept =
                await _withoutPending('offline_quotations', rows, clientId);
            for (final item in kept) {
              await _db.upsertQuotation(item, clientId);
            }
            synced += kept.length;
            break;

          default:
            await _db.upsertConfig(
              contentType,
              jsonEncode(data),
              valueType: 'json',
              clientId: clientId,
            );
            synced++;
            break;
        }
      }

      return SyncResult(
        success: true,
        itemsSynced: synced,
        syncType: 'pull',
      );
    } catch (e) {
      debugPrint('SyncEngine: fetch delta failed for $contentType: $e');
      return SyncResult(
        success: false,
        itemsSynced: synced,
        itemsFailed: 1,
        errorMessage: '$contentType: $e',
        syncType: 'pull',
      );
    }
  }

  /// Server-wins, minus rows whose local copy is still queued for push.
  ///
  /// Those rows failed their push moments ago (or were created while offline
  /// and have not been attempted). Overwriting them here would delete a user's
  /// unsent work; skipping costs one extra cycle to converge.
  Future<List<Map<String, dynamic>>> _withoutPending(
    String table,
    List<Map<String, dynamic>> rows,
    String clientId,
  ) async {
    if (rows.isEmpty || !_db.isPersistent) return rows;
    final pending = await _db.getPendingIds(table, clientId);
    if (pending.isEmpty) return rows;
    final kept = rows
        .where((r) => !pending.contains((r['id'] ?? '').toString()))
        .toList();
    final dropped = rows.length - kept.length;
    if (dropped > 0) {
      debugPrint(
        'SyncEngine: deferred $dropped server row(s) on $table — local copy '
        'still pending push',
      );
    }
    return kept;
  }

  // ---------------------------------------------------------------------------
  // Flags / white-label
  // ---------------------------------------------------------------------------

  /// Sync feature flags from the server.
  Future<void> _syncFeatureFlags(String clientId) async {
    try {
      final json = await _getJson('/api/feature-flags', {'client_id': clientId});
      if (json == null) return;

      final raw = (json['flags'] as Map?) ?? const {};
      final flags = <String, bool>{};
      raw.forEach((key, value) {
        final k = key.toString();
        if (k.isEmpty) return;
        flags[k] = value == true || value == 'true' || value == 1;
      });
      if (flags.isEmpty) return;

      await _db.upsertFeatureFlags(flags, clientId: clientId);
    } catch (e) {
      debugPrint('SyncEngine: feature flags sync failed: $e');
    }
  }

  /// Sync white-label config from the server.
  Future<void> _syncWhiteLabelConfig(String clientId) async {
    try {
      final json = await _getJson('/api/white-label', {'client_id': clientId});
      if (json == null) return;

      final config = (json['config'] as Map?)?.cast<String, dynamic>() ?? {};
      if (config.isEmpty) return;

      final values = <String, String>{};
      for (final entry in config.entries) {
        values[entry.key] = entry.value?.toString() ?? '';
      }
      await _db.upsertConfigs(values, clientId: clientId);
    } catch (e) {
      debugPrint('SyncEngine: white-label sync failed: $e');
    }
  }

  // ---------------------------------------------------------------------------
  // HTTP
  // ---------------------------------------------------------------------------

  /// GET a JSON object from the Next.js API. Returns null on any failure —
  /// callers treat that as "nothing to do this cycle".
  Future<Map<String, dynamic>?> _getJson(
    String path,
    Map<String, String> query,
  ) async {
    try {
      // Relative on web so custom domains and localhost both work.
      final base = kIsWeb ? Uri.base.resolve(path) : Uri.parse('$_apiOrigin$path');
      final uri = base.replace(queryParameters: {
        ...base.queryParameters,
        ...query,
      });

      final response = await http
          .get(uri, headers: const {'Accept': 'application/json'})
          .timeout(_httpTimeout);

      if (response.statusCode != 200) {
        debugPrint('SyncEngine: GET $path -> ${response.statusCode}');
        return null;
      }
      final decoded = jsonDecode(response.body);
      if (decoded is Map) return decoded.cast<String, dynamic>();
      debugPrint('SyncEngine: GET $path returned non-object JSON');
      return null;
    } on TimeoutException {
      debugPrint('SyncEngine: GET $path timed out after ${_httpTimeout.inSeconds}s');
      return null;
    } catch (e) {
      debugPrint('SyncEngine: GET $path failed: $e');
      return null;
    }
  }

  int? _asInt(Object? value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value);
    return null;
  }

  /// Log sync result to the server. Best effort — never surfaces an error.
  Future<void> _logSyncResult(
    String clientId, {
    required int itemsSynced,
    required int itemsFailed,
    required int durationMs,
    required String errorMessage,
  }) async {
    try {
      await SupabaseConfig.client.from('sync_log').insert({
        'client_id': clientId,
        'device_id': await _getDeviceId(),
        'sync_type': 'bidirectional',
        'status': itemsFailed == 0
            ? 'success'
            : (itemsSynced > 0 ? 'partial' : 'failed'),
        'items_synced': itemsSynced,
        'items_failed': itemsFailed,
        // Postgres text column; keep it bounded.
        'error_message': errorMessage.length > 500
            ? errorMessage.substring(0, 500)
            : errorMessage,
        'sync_duration_ms': durationMs,
      });
    } catch (e) {
      debugPrint('SyncEngine: failed to log sync result: $e');
    }
  }

  /// Get the client ID from the current session.
  String? _getClientId() {
    try {
      // `headers` is already Map<String, String> — no cast needed.
      return SupabaseConfig.client.headers['x-client-id'];
    } catch (e) {
      debugPrint('SyncEngine: cannot read client id: $e');
      return null;
    }
  }

  /// A device ID that is STABLE for the install.
  ///
  /// The previous implementation used the current millisecond timestamp, so
  /// every single sync looked like a brand-new device and `sync_log` could not
  /// be grouped per device at all.
  String? _deviceId;
  Future<String> _getDeviceId() async {
    final cached = _deviceId;
    if (cached != null) return cached;
    try {
      const key = 'sync_device_id';
      final stored = await _db.getConfigValue(key);
      if (stored != null && stored.isNotEmpty) {
        _deviceId = stored;
        return stored;
      }
      final generated =
          'flutter_${kIsWeb ? 'web' : defaultTargetPlatform.name}_'
          '${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}';
      await _db.upsertConfig(key, generated);
      _deviceId = generated;
      return generated;
    } catch (e) {
      debugPrint('SyncEngine: device id failed: $e');
      return 'flutter_unknown';
    }
  }

  /// Set the current sync status.
  void _setStatus(SyncStatus status) {
    _currentStatus = status;
    if (_syncStatusController.isClosed) return;
    _syncStatusController.add(status);
  }

  /// Release timers and subscriptions. Safe to call more than once.
  ///
  /// The status controller is NOT closed here — the dashboard's long-lived
  /// `StreamBuilder` subscribes to it for the life of the process. Use
  /// [shutdown] for a real teardown.
  Future<void> dispose() async {
    _disposed = true;
    stopPeriodicSync();
    await _connectivitySub?.cancel();
    _connectivitySub = null;
  }

  /// Full teardown — also closes the status stream.
  Future<void> shutdown() async {
    await dispose();
    if (!_syncStatusController.isClosed) {
      await _syncStatusController.close();
    }
  }
}

/// Sync status enum.
enum SyncStatus {
  idle,
  syncing,
  error,
}
