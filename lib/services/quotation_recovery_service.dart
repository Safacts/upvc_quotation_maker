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
  static final QuotationRecoveryService instance =
      QuotationRecoveryService._();

  static const _queuePrefix = 'quotation_recovery_queue_v1_';
  static const _conflictPrefix = 'quotation_recovery_conflicts_v1_';
  static const _deviceKey = 'quotation_recovery_device_id_v1';
  static const _lastBackupPrefix = 'quotation_recovery_last_cloud_v1_';
  static const _maxPending = 100;
  static const _maxConflicts = 25;

  StreamSubscription<bool>? _connectivitySub;
  Timer? _retryTimer;
  Future<void>? _flushInFlight;
  String _clientId = '';

  Future<void> initialize(String clientId) async {
    if (clientId.isEmpty) return;
    _clientId = clientId;
    await _deviceId();
    await _connectivitySub?.cancel();
    _connectivitySub =
        ConnectivityService.instance.connectivityStream.listen((online) {
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

    final operationId = const Uuid().v4();
    final snapshot = <String, dynamic>{
      'quotation': quotation,
      'measured_items': measuredItems,
      'unmeasured_items': unmeasuredItems,
    };
    final encodedSnapshot = jsonEncode(snapshot);
    final envelope = <String, dynamic>{
      'schema_version': 1,
      'client_id': clientId,
      'quotation_id': quoteId,
      'device_id': await _deviceId(),
      'operation_id': operationId,
      'base_version': (quotation['sync_version'] as num?)?.toInt() ?? 0,
      'checksum': sha256.convert(utf8.encode(encodedSnapshot)).toString(),
      'created_at': DateTime.now().toUtc().toIso8601String(),
      'snapshot': snapshot,
    };

    await _enqueueLatest(clientId, envelope);
    if (!ConnectivityService.instance.isOnline) {
      return RecoverySaveResult(
        state: RecoverySaveState.queued,
        operationId: operationId,
        message: 'Saved on this device. Cloud backup will happen automatically.',
      );
    }
    return _sendEnvelope(clientId, envelope);
  }

  Future<RecoverySaveResult> _sendEnvelope(
    String clientId,
    Map<String, dynamic> envelope,
  ) async {
    final operationId = (envelope['operation_id'] ?? '').toString();
    try {
      final snapshot = Map<String, dynamic>.from(envelope['snapshot'] as Map);
      final response = await SupabaseConfig.client.rpc(
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
      ).timeout(const Duration(seconds: 15));

      final result = response is Map
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
    final prefs = await SharedPreferences.getInstance();
    return _decodeList(prefs.getString('$_queuePrefix$clientId'));
  }

  Future<List<Map<String, dynamic>>> conflicts(String clientId) async {
    final prefs = await SharedPreferences.getInstance();
    return _decodeList(prefs.getString('$_conflictPrefix$clientId'));
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
    final pending = decoded['pending'];
    if (pending is! List) return 0;
    var imported = 0;
    for (final item in pending) {
      if (item is! Map) continue;
      final envelope = Map<String, dynamic>.from(item);
      if ((envelope['client_id'] ?? '').toString() != clientId ||
          (envelope['operation_id'] ?? '').toString().isEmpty ||
          envelope['snapshot'] is! Map) {
        continue;
      }
      await _enqueueLatest(clientId, envelope, preserveOperation: true);
      imported++;
    }
    return imported;
  }

  Future<void> _enqueueLatest(
    String clientId,
    Map<String, dynamic> envelope, {
    bool preserveOperation = false,
  }) async {
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
    if (rows.length > _maxPending) {
      rows.removeRange(0, rows.length - _maxPending);
    }
    await prefs.setString(key, jsonEncode(rows));
  }

  Future<void> _moveToConflicts(
    String clientId,
    Map<String, dynamic> envelope,
    Map<String, dynamic> serverResult,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    final key = '$_conflictPrefix$clientId';
    final rows = _decodeList(prefs.getString(key));
    rows.removeWhere((row) =>
        (row['operation_id'] ?? '').toString() ==
        (envelope['operation_id'] ?? '').toString());
    rows.add({...envelope, 'server_result': serverResult});
    if (rows.length > _maxConflicts) {
      rows.removeRange(0, rows.length - _maxConflicts);
    }
    await prefs.setString(key, jsonEncode(rows));
  }

  Future<void> _removeOperation(String clientId, String operationId) async {
    final prefs = await SharedPreferences.getInstance();
    final key = '$_queuePrefix$clientId';
    final rows = _decodeList(prefs.getString(key))
      ..removeWhere(
        (row) => (row['operation_id'] ?? '').toString() == operationId,
      );
    await prefs.setString(key, jsonEncode(rows));
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
