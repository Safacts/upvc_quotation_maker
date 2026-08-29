import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:upvc_quotation_maker/services/quotation_recovery_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  Map<String, dynamic> quote(String id, {String customer = 'Customer'}) => {
    'id': id,
    'quote_no': 'JVUPVC-TEST-0001',
    'date': '2026-08-29',
    'customer_name': customer,
    'sync_version': 0,
  };

  String checkedBundle(Map<String, dynamic> payload) {
    final checksum =
        sha256.convert(utf8.encode(jsonEncode(payload))).toString();
    return jsonEncode({...payload, 'bundle_checksum': checksum});
  }

  test('coalesces repeated offline saves for the same quotation', () async {
    final service = QuotationRecoveryService.instance;

    await service.saveBundle(
      clientId: 'venkateshwara',
      quotation: quote('11111111-1111-4111-8111-111111111111'),
      measuredItems: const [],
      unmeasuredItems: const [],
    );
    await service.saveBundle(
      clientId: 'venkateshwara',
      quotation: quote(
        '11111111-1111-4111-8111-111111111111',
        customer: 'Latest Customer',
      ),
      measuredItems: const [],
      unmeasuredItems: const [],
    );

    final pending = await service.pendingEnvelopes('venkateshwara');
    expect(pending, hasLength(1));
    final snapshot = pending.single['snapshot'] as Map;
    final quotation = snapshot['quotation'] as Map;
    expect(quotation['customer_name'], 'Latest Customer');
  });

  test('exports and imports a tenant-scoped emergency bundle', () async {
    final service = QuotationRecoveryService.instance;
    await service.saveBundle(
      clientId: 'kprupvc',
      quotation: quote('22222222-2222-4222-8222-222222222222'),
      measuredItems: const [],
      unmeasuredItems: const [],
    );

    final bundle = await service.exportBundle('kprupvc');
    final decoded = jsonDecode(bundle) as Map<String, dynamic>;
    expect(decoded['format'], 'vitharn-quotation-recovery');
    expect(decoded['bundle_checksum'], isNotEmpty);

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('quotation_recovery_queue_v1_kprupvc');
    expect(await service.pendingCount('kprupvc'), 0);

    expect(await service.importBundle('kprupvc', bundle), 1);
    expect(await service.pendingCount('kprupvc'), 1);
  });

  test('refuses a recovery bundle belonging to another tenant', () async {
    final service = QuotationRecoveryService.instance;
    final bundle = jsonEncode({
      'format': 'vitharn-quotation-recovery',
      'schema_version': 1,
      'client_id': 'kprupvc',
      'pending': const [],
    });

    expect(
      () => service.importBundle('venkateshwara', bundle),
      throwsA(isA<FormatException>()),
    );
  });

  test('rejects a changed backup before importing any item', () async {
    final service = QuotationRecoveryService.instance;
    await service.saveBundle(
      clientId: 'kprupvc',
      quotation: quote('33333333-3333-4333-8333-333333333333'),
      measuredItems: const [],
      unmeasuredItems: const [],
    );
    final decoded =
        jsonDecode(await service.exportBundle('kprupvc'))
            as Map<String, dynamic>;
    final pending = decoded['pending'] as List;
    final snapshot = (pending.single as Map)['snapshot'] as Map;
    (snapshot['quotation'] as Map)['customer_name'] = 'Changed after export';

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('quotation_recovery_queue_v1_kprupvc');
    expect(
      () => service.importBundle('kprupvc', jsonEncode(decoded)),
      throwsA(isA<FormatException>()),
    );
    expect(await service.pendingCount('kprupvc'), 0);
  });

  test(
    'finds a lifecycle-only local draft and queues it for cloud sync',
    () async {
      final service = QuotationRecoveryService.instance;
      final prefs = await SharedPreferences.getInstance();
      const id = '44444444-4444-4444-8444-444444444444';
      await prefs.setString(
        'quotation_local_draft_kprupvc_$id',
        jsonEncode({
          'quotation': {...quote(id), 'client_id': 'kprupvc'},
          'measured_items': const [],
          'unmeasured_items': const [],
          'needs_sync': true,
        }),
      );

      expect(await service.queueAllLocalDrafts('kprupvc'), 1);
      expect(await service.pendingCount('kprupvc'), 1);
      final exported = jsonDecode(await service.exportBundle('kprupvc')) as Map;
      expect(exported['local_drafts'], hasLength(1));
    },
  );

  test(
    'does not silently drop the oldest quotation after one hundred saves',
    () async {
      final service = QuotationRecoveryService.instance;
      for (var index = 0; index < 105; index++) {
        final suffix = index.toString().padLeft(12, '0');
        await service.saveBundle(
          clientId: 'venkateshwara',
          quotation: quote('00000000-0000-4000-8000-$suffix'),
          measuredItems: const [],
          unmeasuredItems: const [],
        );
      }
      final pending = await service.pendingEnvelopes('venkateshwara');
      expect(pending, hasLength(105));
      expect(
        pending.first['quotation_id'],
        '00000000-0000-4000-8000-000000000000',
      );
    },
  );

  test(
    'protected conflict can be explicitly requeued at the cloud revision',
    () async {
      final service = QuotationRecoveryService.instance;
      const id = '55555555-5555-4555-8555-555555555555';
      const oldOperation = '66666666-6666-4666-8666-666666666666';
      final snapshot = <String, dynamic>{
        'quotation': {...quote(id), 'client_id': 'kprupvc'},
        'measured_items': <Map<String, dynamic>>[],
        'unmeasured_items': <Map<String, dynamic>>[],
      };
      final envelope = <String, dynamic>{
        'schema_version': 1,
        'client_id': 'kprupvc',
        'quotation_id': id,
        'device_id': 'test-device',
        'operation_id': oldOperation,
        'base_version': 1,
        'checksum':
            sha256.convert(utf8.encode(jsonEncode(snapshot))).toString(),
        'created_at': '2026-08-29T00:00:00Z',
        'snapshot': snapshot,
        'server_result': {'status': 'conflict', 'version': 3},
      };
      final payload = <String, dynamic>{
        'format': 'vitharn-quotation-recovery',
        'schema_version': 1,
        'client_id': 'kprupvc',
        'exported_at': '2026-08-29T00:00:00Z',
        'device_id': 'test-device',
        'local_drafts': <Map<String, dynamic>>[],
        'pending': <Map<String, dynamic>>[],
        'conflicts': [envelope],
      };

      expect(await service.importBundle('kprupvc', checkedBundle(payload)), 1);
      expect(await service.conflicts('kprupvc'), hasLength(1));
      expect(
        await service.resolveConflictWithDeviceVersion('kprupvc', oldOperation),
        isTrue,
      );
      expect(await service.conflicts('kprupvc'), isEmpty);
      final pending = await service.pendingEnvelopes('kprupvc');
      expect(pending, hasLength(1));
      expect(pending.single['base_version'], 3);
      expect(pending.single['operation_id'], isNot(oldOperation));
    },
  );
}
