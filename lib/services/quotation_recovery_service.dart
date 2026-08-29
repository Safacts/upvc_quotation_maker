import 'dart:async';
import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../supabase_config.dart';
import 'connectivity_service.dart';

enum RecoverySaveState { saved, queued, conflict }

class RecoverySaveResult {
  const RecoverySaveResult({
    required this.state,
    this.serverVersion,
    this.operationId = '',
    this.message = '',
  });

  final RecoverySaveState state;
  final int? serverVersion;
  final String operationId;
  final String message;
}

/// Durable quotation outbox and disaster-recovery coordinator.
///
/// SharedPreferences is intentionally used for the envelope queue because it
/// is persistent on both Android and Flutter Web. Android's larger SQLite
/// cache remains available for catalog/content data, while this small queue
/// only stores the latest JSON bundle for each unsent quotation.
class QuotationRecoveryService {
  QuotationRecoveryService._();
  static final QuotationRecoveryService instance = QuotationRecoveryService._();

  static const _queuePrefix = 'quotation_recovery_queue_v1_';
  static const _conflictPrefix = 'quotation_recovery_conflicts_v1_';
  static const _draftPrefix = 'quotation_local_draft_';
  static const _deviceKey = 'quotation_recovery_device_id_v1';
  static const _lastBackupPrefix = 'quotation_recovery_last_cloud_v1_';

  StreamSubscription<bool>? _connectivitySub;
  Timer? _retryTimer;
  Future<void>? _flushInFlight;
  Future<void> _storageTail = Future<void>.value();
  String _clientId = '';

  Future<T> _withStorageLock<T>(Future<T> Function() action) {
    final completer = Completer<T>();
    _storageTail = _storageTail.catchError((_) {}).then((_) async {
      try {
        completer.complete(await action());
      } catch (error, stackTrace) {
        completer.completeError(error, stackTrace);
      }
    });
    return completer.future;
  }

  Future<void> initialize(String clientId) async {
    if (clientId.isEmpty) return;
    _clientId = clientId;
    await _deviceId();
    await _connectivitySub?.cancel();
    _connectivitySub = ConnectivityService.instance.connectivityStream.listen((
      online,
    ) {
      if (online && _clientId.isNotEmpty) {
        unawaited(flushPending(_clientId));
      }
    }, onError: (_) {});
    if (ConnectivityService.instance.isOnline) {
      unawaited(flushPending(clientId));
    }
    _retryTimer?.cancel();
    _retryTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      if (_clientId.isNotEmpty && ConnectivityService.instance.isOnline) {
        unawaited(flushPending(_clientId));
      }
    });
  }

  Future<RecoverySaveResult> saveBundle({
    required String clientId,
    required Map<String, dynamic> quotation,
    required List<Map<String, dynamic>> measuredItems,
    required List<Map<String, dynamic>> unmeasuredItems,
  }) async {
    final quoteId = (quotation['id'] ?? '').toString();
    if (clientId.isEmpty || quoteId.isEmpty) {
      return const RecoverySaveResult(
        state: RecoverySaveState.queued,
        message: 'The quotation is safe locally and will retry shortly.',
      );
    }

    final envelope = await _buildEnvelope(
      clientId: clientId,
      quotation: quotation,
      measuredItems: measuredItems,
      unmeasuredItems: unmeasuredItems,
    );
    final operationId = envelope['operation_id'] as String;

    await _enqueueLatest(clientId, envelope);
    if (!ConnectivityService.instance.isOnline) {
      return RecoverySaveResult(
        state: RecoverySaveState.queued,
        operationId: operationId,
        message:
            'Saved on this device. Cloud backup will happen automatically.',
      );
    }
    return _sendEnvelope(clientId, envelope);
  }

  Future<Map<String, dynamic>> _buildEnvelope({
    required String clientId,
    required Map<String, dynamic> quotation,
    required List<Map<String, dynamic>> measuredItems,
    required List<Map<String, dynamic>> unmeasuredItems,
    String? operationId,
    int? baseVersion,
  }) async {
    final quoteId = (quotation['id'] ?? '').toString();
    final snapshot = <String, dynamic>{
      'quotation': quotation,
      'measured_items': measuredItems,
      'unmeasured_items': unmeasuredItems,
    };
    return <String, dynamic>{
      'schema_version': 1,
      'client_id': clientId,
      'quotation_id': quoteId,
      'device_id': await _deviceId(),
      'operation_id': operationId ?? const Uuid().v4(),
      'base_version':
          baseVersion ?? (quotation['sync_version'] as num?)?.toInt() ?? 0,
      'checksum': _snapshotChecksum(snapshot),
      'created_at': DateTime.now().toUtc().toIso8601String(),
      'snapshot': snapshot,
    };
  }

  String _snapshotChecksum(Map<String, dynamic> snapshot) =>
      sha256.convert(utf8.encode(jsonEncode(snapshot))).toString();

  Future<RecoverySaveResult> _sendEnvelope(
    String clientId,
    Map<String, dynamic> envelope,
  ) async {
    final operationId = (envelope['operation_id'] ?? '').toString();
    try {
      if (clientId.isNotEmpty) {
        SupabaseConfig.client.headers['x-client-id'] = clientId;
      }
      final snapshot = Map<String, dynamic>.from(envelope['snapshot'] as Map);
      
      final quote = snapshot['quotation'] as Map<String, dynamic>? ?? {};
      final mItems = snapshot['measured_items'] as List? ?? [];
      final umItems = snapshot['unmeasured_items'] as List? ?? [];
      
      final isEmptyGhost = (quote['customer_name']?.toString().trim() ?? '').isEmpty &&
          (quote['reference']?.toString().trim() ?? '').isEmpty &&
          (quote['contact_no']?.toString().trim() ?? '').isEmpty &&
          (quote['address']?.toString().trim() ?? '').isEmpty &&
          mItems.isEmpty &&
          umItems.isEmpty;

      if (isEmptyGhost) {
        debugPrint('QuotationRecoveryService: Discarding empty ghost quotation from queue.');
        await _removeOperation(clientId, operationId);
        return RecoverySaveResult(
          state: RecoverySaveState.saved,
          operationId: operationId,
        );
      }

      final response = await SupabaseConfig.client
          .rpc(
            'save_quotation_bundle_v1',
            params: {
              'p_client_id': clientId,
              'p_device_id': envelope['device_id'],
              'p_operation_id': operationId,
              'p_base_version': envelope['base_version'],
              'p_checksum': envelope['checksum'],
              'p_quotation': snapshot['quotation'],
              'p_measured_items': snapshot['measured_items'],
              'p_unmeasured_items': snapshot['unmeasured_items'],
            },
          )
          .timeout(const Duration(seconds: 15));

      final result =
          response is Map
              ? Map<String, dynamic>.from(response)
              : const <String, dynamic>{};
      final status = (result['status'] ?? '').toString();
      final version = (result['version'] as num?)?.toInt();

      if (status == 'saved') {
        await _removeOperation(clientId, operationId);
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(
          '$_lastBackupPrefix$clientId',
          DateTime.now().toUtc().toIso8601String(),
        );
        return RecoverySaveResult(
          state: RecoverySaveState.saved,
          serverVersion: version,
          operationId: operationId,
        );
      }

      if (status == 'conflict') {
        await _moveToConflicts(clientId, envelope, result);
        await _removeOperation(clientId, operationId);
        return RecoverySaveResult(
          state: RecoverySaveState.conflict,
          serverVersion: version,
          operationId: operationId,
          message:
              'Your work is safe. This quotation changed on another device.',
        );
      }
    } catch (error) {
      debugPrint('QuotationRecoveryService: queued $operationId: $error');
    }

    return RecoverySaveResult(
      state: RecoverySaveState.queued,
      operationId: operationId,
      message: 'Saved on this device. Cloud backup will retry automatically.',
    );
  }

  Future<void> flushPending(String clientId) {
    final existing = _flushInFlight;
    if (existing != null) return existing;
    final run = _runFlush(clientId);
    _flushInFlight = run;
    return run.whenComplete(() => _flushInFlight = null);
  }

  Future<void> _runFlush(String clientId) async {
    if (clientId.isEmpty || !ConnectivityService.instance.isOnline) return;
    final pending = await pendingEnvelopes(clientId);
    for (final envelope in pending) {
      if (!ConnectivityService.instance.isOnline) return;
      final result = await _sendEnvelope(clientId, envelope);
      if (result.state == RecoverySaveState.queued) return;
    }
  }

  Future<List<Map<String, dynamic>>> pendingEnvelopes(String clientId) async {
    return _withStorageLock(() async {
      final prefs = await SharedPreferences.getInstance();
      return _decodeList(prefs.getString('$_queuePrefix$clientId'));
    });
  }

  Future<List<Map<String, dynamic>>> conflicts(String clientId) async {
    return _withStorageLock(() async {
      final prefs = await SharedPreferences.getInstance();
      return _decodeList(prefs.getString('$_conflictPrefix$clientId'));
    });
  }

  /// Every quotation draft retained on this installation, including a draft
  /// captured by a phone-call lifecycle event before the network outbox ran.
  Future<List<Map<String, dynamic>>> localDrafts(String clientId) async {
    if (clientId.isEmpty) return const [];
    return _withStorageLock(() async {
      final prefs = await SharedPreferences.getInstance();
      final prefix = '$_draftPrefix${clientId}_';
      final drafts = <Map<String, dynamic>>[];
      for (final key in prefs.getKeys().where(
        (key) => key.startsWith(prefix),
      )) {
        final raw = prefs.getString(key);
        if (raw == null || raw.isEmpty) continue;
        try {
          final decoded = jsonDecode(raw);
          if (decoded is! Map || decoded['quotation'] is! Map) continue;
          final draft = Map<String, dynamic>.from(decoded)
            ..['_storage_key'] = key;
          final quotation = Map<String, dynamic>.from(
            draft['quotation'] as Map,
          );
          final owner = (quotation['client_id'] ?? clientId).toString();
          if (owner != clientId) continue;
          drafts.add(draft);
        } catch (_) {
          // Keep scanning: one damaged draft must not hide the other copies.
        }
      }
      return drafts;
    });
  }

  /// Queues all locally retained drafts so support can recover data even when
  /// an earlier cloud-sync callback never ran. Returns the number found.
  Future<int> queueAllLocalDrafts(String clientId) async {
    final drafts = await localDrafts(clientId);
    final pendingByQuote = <String, Map<String, dynamic>>{
      for (final envelope in await pendingEnvelopes(clientId))
        (envelope['quotation_id'] ?? '').toString(): envelope,
    };
    var queued = 0;
    for (final draft in drafts) {
      final quotation = Map<String, dynamic>.from(draft['quotation'] as Map);
      final needsSync =
          draft['needs_sync'] == true ||
          ((quotation['sync_version'] as num?)?.toInt() ?? 0) == 0;
      if (!needsSync) continue;
      quotation['client_id'] = clientId;
      quotation['id'] =
          (quotation['id'] ?? '').toString().isEmpty
              ? const Uuid().v4()
              : quotation['id'];
      final quoteId = quotation['id'].toString();
      final measured = _normaliseItems(
        draft['measured_items'],
        clientId: clientId,
        quoteId: quoteId,
      );
      final unmeasured = _normaliseItems(
        draft['unmeasured_items'],
        clientId: clientId,
        quoteId: quoteId,
      );
      final envelope = await _buildEnvelope(
        clientId: clientId,
        quotation: quotation,
        measuredItems: measured,
        unmeasuredItems: unmeasured,
      );
      final existing = pendingByQuote[quoteId];
      if (existing != null &&
          (existing['checksum'] ?? '').toString() ==
              (envelope['checksum'] ?? '').toString()) {
        queued++;
        continue;
      }
      await _enqueueLatest(clientId, envelope);
      pendingByQuote[quoteId] = envelope;
      queued++;
    }
    return queued;
  }

  List<Map<String, dynamic>> _normaliseItems(
    Object? raw, {
    required String clientId,
    required String quoteId,
  }) {
    if (raw is! List) return <Map<String, dynamic>>[];
    return raw
        .whereType<Map>()
        .map((item) {
          final row = Map<String, dynamic>.from(item);
          row['id'] =
              (row['id'] ?? '').toString().isEmpty
                  ? const Uuid().v4()
                  : row['id'];
          row['quotation_id'] = quoteId;
          row['client_id'] = clientId;
          return row;
        })
        .toList(growable: false);
  }

  Future<int> pendingCount(String clientId) async =>
      (await pendingEnvelopes(clientId)).length;

  Future<DateTime?> lastCloudBackup(String clientId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('$_lastBackupPrefix$clientId');
    return raw == null ? null : DateTime.tryParse(raw)?.toLocal();
  }

  Future<List<Map<String, dynamic>>> cloudSnapshots(String clientId) async {
    if (clientId.isEmpty || !ConnectivityService.instance.isOnline) {
      return const [];
    }
    try {
      final rows = await SupabaseConfig.client
          .from('quotation_recovery_snapshots')
          .select(
            'id,quotation_id,operation_id,device_id,base_version,state,created_at,updated_at,snapshot,checksum',
          )
          .eq('client_id', clientId)
          .order('created_at', ascending: false)
          .limit(50)
          .timeout(const Duration(seconds: 12));
      return (rows as List)
          .map((row) => Map<String, dynamic>.from(row as Map))
          .toList(growable: false);
    } catch (error) {
      debugPrint('QuotationRecoveryService: cloud list failed: $error');
      return const [];
    }
  }

  Future<String> exportBundle(String clientId) async {
    final payload = <String, dynamic>{
      'format': 'vitharn-quotation-recovery',
      'schema_version': 1,
      'client_id': clientId,
      'exported_at': DateTime.now().toUtc().toIso8601String(),
      'device_id': await _deviceId(),
      'local_drafts': await localDrafts(clientId),
      'pending': await pendingEnvelopes(clientId),
      'conflicts': await conflicts(clientId),
    };
    final body = jsonEncode(payload);
    return jsonEncode({
      ...payload,
      'bundle_checksum': sha256.convert(utf8.encode(body)).toString(),
    });
  }

  Future<int> importBundle(String clientId, String raw) async {
    final decoded = jsonDecode(raw);
    if (decoded is! Map || decoded['format'] != 'vitharn-quotation-recovery') {
      throw const FormatException('This is not a Vitharn recovery backup.');
    }
    if ((decoded['client_id'] ?? '').toString() != clientId) {
      throw const FormatException('This backup belongs to another business.');
    }
    _verifyBundleChecksum(decoded);

    // Validate the complete file before changing this installation. A damaged
    // item must never produce a half-imported backup.
    final pending = _validatedEnvelopes(decoded['pending'], clientId);
    final conflictRows = _validatedEnvelopes(decoded['conflicts'], clientId);
    final draftRows = _validatedDrafts(decoded['local_drafts'], clientId);

    for (final draft in draftRows) {
      await _restoreLocalDraft(clientId, draft);
    }
    for (final envelope in pending) {
      await _enqueueLatest(clientId, envelope, preserveOperation: true);
    }
    for (final conflict in conflictRows) {
      await _storeConflict(clientId, conflict);
    }
    // Also queue imported drafts. This is the support-side escape hatch for a
    // device whose normal outbox did not run before the backup was exported.
    if (draftRows.isNotEmpty) {
      await queueAllLocalDrafts(clientId);
    }
    return pending.length + conflictRows.length + draftRows.length;
  }

  void _verifyBundleChecksum(Map<dynamic, dynamic> decoded) {
    final supplied = (decoded['bundle_checksum'] ?? '').toString();
    if (supplied.isEmpty) {
      throw const FormatException(
        'This recovery backup has no integrity check.',
      );
    }
    final payload = Map<String, dynamic>.from(decoded)
      ..remove('bundle_checksum');
    final expected =
        sha256.convert(utf8.encode(jsonEncode(payload))).toString();
    if (supplied != expected) {
      throw const FormatException(
        'This recovery backup is damaged or was changed after export.',
      );
    }
  }

  List<Map<String, dynamic>> _validatedEnvelopes(Object? raw, String clientId) {
    if (raw == null) return <Map<String, dynamic>>[];
    if (raw is! List) {
      throw const FormatException(
        'Recovery items are not in the expected format.',
      );
    }
    final result = <Map<String, dynamic>>[];
    for (final item in raw) {
      if (item is! Map) {
        throw const FormatException('A recovery item is damaged.');
      }
      final envelope = Map<String, dynamic>.from(item);
      final snapshotRaw = envelope['snapshot'];
      if ((envelope['client_id'] ?? '').toString() != clientId ||
          (envelope['operation_id'] ?? '').toString().isEmpty ||
          (envelope['quotation_id'] ?? '').toString().isEmpty ||
          snapshotRaw is! Map) {
        throw const FormatException('A recovery item is incomplete.');
      }
      final snapshot = Map<String, dynamic>.from(snapshotRaw);
      final quotation = snapshot['quotation'];
      if (quotation is! Map ||
          (quotation['id'] ?? '').toString() !=
              (envelope['quotation_id'] ?? '').toString() ||
          (quotation['client_id'] ?? clientId).toString() != clientId ||
          (envelope['checksum'] ?? '').toString() !=
              _snapshotChecksum(snapshot)) {
        throw const FormatException(
          'A recovery item failed its integrity check.',
        );
      }
      result.add(envelope);
    }
    return result;
  }

  List<Map<String, dynamic>> _validatedDrafts(Object? raw, String clientId) {
    if (raw == null) return <Map<String, dynamic>>[];
    if (raw is! List) {
      throw const FormatException(
        'Local drafts are not in the expected format.',
      );
    }
    final result = <Map<String, dynamic>>[];
    for (final item in raw) {
      if (item is! Map || item['quotation'] is! Map) {
        throw const FormatException('A local draft is damaged.');
      }
      final draft = Map<String, dynamic>.from(item)..remove('_storage_key');
      final quotation = Map<String, dynamic>.from(draft['quotation'] as Map);
      if ((quotation['client_id'] ?? clientId).toString() != clientId) {
        throw const FormatException(
          'A local draft belongs to another business.',
        );
      }
      result.add(draft);
    }
    return result;
  }

  Future<void> _restoreLocalDraft(
    String clientId,
    Map<String, dynamic> draft,
  ) async {
    final quotation = Map<String, dynamic>.from(draft['quotation'] as Map);
    quotation['client_id'] = clientId;
    quotation['id'] =
        (quotation['id'] ?? '').toString().isEmpty
            ? const Uuid().v4()
            : quotation['id'];
    final key = '$_draftPrefix${clientId}_${quotation['id']}';
    final restored =
        Map<String, dynamic>.from(draft)
          ..['quotation'] = quotation
          ..['updated_at'] = DateTime.now().toUtc().toIso8601String()
          ..['needs_sync'] = true;
    await _withStorageLock(() async {
      final prefs = await SharedPreferences.getInstance();
      final saved = await prefs.setString(key, jsonEncode(restored));
      if (!saved)
        throw StateError('The device could not store a recovery draft.');
      await prefs.setString('last_active_draft_$clientId', key);
    });
  }

  Future<void> _enqueueLatest(
    String clientId,
    Map<String, dynamic> envelope, {
    bool preserveOperation = false,
  }) async {
    await _withStorageLock(() async {
      final prefs = await SharedPreferences.getInstance();
      final key = '$_queuePrefix$clientId';
      final rows = _decodeList(prefs.getString(key));
      final quoteId = (envelope['quotation_id'] ?? '').toString();
      if (!preserveOperation) {
        rows.removeWhere(
          (row) => (row['quotation_id'] ?? '').toString() == quoteId,
        );
      } else {
        final operation = (envelope['operation_id'] ?? '').toString();
        rows.removeWhere(
          (row) => (row['operation_id'] ?? '').toString() == operation,
        );
      }
      rows.add(envelope);
      // Never discard an unsynced quotation to satisfy an arbitrary count
      // limit. If platform storage is full, surface the failed write while the
      // independent local-draft copy remains available for recovery.
      final saved = await prefs.setString(key, jsonEncode(rows));
      if (!saved)
        throw StateError('The device could not extend the recovery queue.');
    });
  }

  Future<void> _moveToConflicts(
    String clientId,
    Map<String, dynamic> envelope,
    Map<String, dynamic> serverResult,
  ) async {
    await _storeConflict(clientId, {
      ...envelope,
      'server_result': serverResult,
    });
  }

  Future<void> _storeConflict(
    String clientId,
    Map<String, dynamic> conflict,
  ) async {
    await _withStorageLock(() async {
      final prefs = await SharedPreferences.getInstance();
      final key = '$_conflictPrefix$clientId';
      final rows = _decodeList(prefs.getString(key));
      rows.removeWhere(
        (row) =>
            (row['operation_id'] ?? '').toString() ==
            (conflict['operation_id'] ?? '').toString(),
      );
      rows.add(conflict);
      final saved = await prefs.setString(key, jsonEncode(rows));
      if (!saved)
        throw StateError('The device could not store a protected version.');
    });
  }

  Future<void> _removeOperation(String clientId, String operationId) async {
    await _withStorageLock(() async {
      final prefs = await SharedPreferences.getInstance();
      final key = '$_queuePrefix$clientId';
      final rows = _decodeList(prefs.getString(key))..removeWhere(
        (row) => (row['operation_id'] ?? '').toString() == operationId,
      );
      final saved = await prefs.setString(key, jsonEncode(rows));
      if (!saved)
        throw StateError('The device could not update the recovery queue.');
    });
  }

  /// Explicitly applies the protected device version over the current cloud
  /// revision. Nothing is overwritten until the owner chooses this action.
  Future<bool> resolveConflictWithDeviceVersion(
    String clientId,
    String operationId,
  ) async {
    final rows = await conflicts(clientId);
    final matches = rows.where(
      (row) => (row['operation_id'] ?? '').toString() == operationId,
    );
    if (matches.isEmpty) return false;
    final conflict = matches.first;
    final snapshot = Map<String, dynamic>.from(conflict['snapshot'] as Map);
    final quotation = Map<String, dynamic>.from(snapshot['quotation'] as Map);
    final serverResult = conflict['server_result'];
    final serverVersion =
        serverResult is Map ? (serverResult['version'] as num?)?.toInt() : null;
    if (serverVersion == null) return false;
    quotation['sync_version'] = serverVersion;
    final envelope = await _buildEnvelope(
      clientId: clientId,
      quotation: quotation,
      measuredItems: _normaliseItems(
        snapshot['measured_items'],
        clientId: clientId,
        quoteId: quotation['id'].toString(),
      ),
      unmeasuredItems: _normaliseItems(
        snapshot['unmeasured_items'],
        clientId: clientId,
        quoteId: quotation['id'].toString(),
      ),
      baseVersion: serverVersion,
    );
    await _enqueueLatest(clientId, envelope);
    await _removeConflict(clientId, operationId);
    if (ConnectivityService.instance.isOnline) {
      await flushPending(clientId);
    }
    return true;
  }

  /// Keeps the canonical cloud copy and removes only the explicitly rejected
  /// device draft. The protected cloud snapshot remains in Supabase history.
  Future<bool> resolveConflictKeepingCloud(
    String clientId,
    String operationId,
  ) async {
    final rows = await conflicts(clientId);
    final matches = rows.where(
      (row) => (row['operation_id'] ?? '').toString() == operationId,
    );
    if (matches.isEmpty) return false;
    final conflict = matches.first;
    final quoteId = (conflict['quotation_id'] ?? '').toString();
    await _removeConflict(clientId, operationId);
    if (quoteId.isNotEmpty) {
      await _withStorageLock(() async {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove('$_draftPrefix${clientId}_$quoteId');
        final activeKey = prefs.getString('last_active_draft_$clientId');
        if (activeKey == '$_draftPrefix${clientId}_$quoteId') {
          await prefs.remove('last_active_draft_$clientId');
        }
      });
    }
    return true;
  }

  Future<void> _removeConflict(String clientId, String operationId) async {
    await _withStorageLock(() async {
      final prefs = await SharedPreferences.getInstance();
      final key = '$_conflictPrefix$clientId';
      final rows = _decodeList(prefs.getString(key))..removeWhere(
        (row) => (row['operation_id'] ?? '').toString() == operationId,
      );
      final saved = await prefs.setString(key, jsonEncode(rows));
      if (!saved)
        throw StateError('The device could not update protected versions.');
    });
  }

  List<Map<String, dynamic>> _decodeList(String? raw) {
    if (raw == null || raw.isEmpty) return <Map<String, dynamic>>[];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return <Map<String, dynamic>>[];
      return decoded
          .whereType<Map>()
          .map((row) => Map<String, dynamic>.from(row))
          .toList();
    } catch (_) {
      return <Map<String, dynamic>>[];
    }
  }

  Future<String> _deviceId() async {
    final prefs = await SharedPreferences.getInstance();
    final existing = prefs.getString(_deviceKey);
    if (existing != null && existing.isNotEmpty) return existing;
    final created = const Uuid().v4();
    await prefs.setString(_deviceKey, created);
    return created;
  }

  Future<void> dispose() async {
    _retryTimer?.cancel();
    _retryTimer = null;
    await _connectivitySub?.cancel();
    _connectivitySub = null;
    _clientId = '';
  }
}
