import 'dart:convert';

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
}
