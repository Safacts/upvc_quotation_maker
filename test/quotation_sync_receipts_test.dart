import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:upvc_quotation_maker/services/quotation_recovery_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  const clientId = 'receipt-test-tenant';
  const quoteId = '77777777-7777-4777-8777-777777777777';

  test(
    'records a durable local save and pending state per quotation',
    () async {
      final service = QuotationRecoveryService.instance;

      await service.saveBundle(
        clientId: clientId,
        quotation: {
          'id': quoteId,
          'customer_name': 'Receipt Customer',
          'sync_version': 0,
        },
        measuredItems: const [],
        unmeasuredItems: const [],
      );

      final receipt = await service.syncReceipt(clientId, quoteId);
      expect(receipt.lastLocalSave, isNotNull);
      expect(receipt.lastCloudBackup, isNull);
      expect(receipt.hasPending, isTrue);
      expect(receipt.hasConflict, isFalse);
    expect(receipt.status, QuotationSyncReceiptStatus.pending);
      expect(await service.lastLocalSave(clientId, quoteId), isNotNull);
      expect(await service.hasPendingSync(clientId, quoteId), isTrue);
    },
  );

  test('derives conflict status without changing UI or cloud data', () async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'quotation_recovery_conflicts_v1_$clientId',
      jsonEncode([
        {
          'client_id': clientId,
          'quotation_id': quoteId,
          'operation_id': '88888888-8888-4888-8888-888888888888',
        },
      ]),
    );

    final receipt = await QuotationRecoveryService.instance.syncReceipt(
      clientId,
      quoteId,
    );
    expect(receipt.hasPending, isFalse);
    expect(receipt.hasConflict, isTrue);
    expect(receipt.status, QuotationSyncReceiptStatus.conflict);
    expect(
      await QuotationRecoveryService.instance.hasSyncConflict(
        clientId,
        quoteId,
      ),
      isTrue,
    );
  });

  test('receipt data stays tenant and quotation scoped', () async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'quotation_recovery_receipts_v1_$clientId',
      jsonEncode({
        quoteId: {
          'client_id': clientId,
          'quotation_id': quoteId,
          'last_local_save': '2026-09-07T10:00:00Z',
          'last_cloud_backup': '2026-09-07T10:01:00Z',
        },
      }),
    );

    final receipt = await QuotationRecoveryService.instance.syncReceipt(
      clientId,
      quoteId,
    );
    final otherQuote = await QuotationRecoveryService.instance.syncReceipt(
      clientId,
      '99999999-9999-4999-8999-999999999999',
    );
    final otherTenant = await QuotationRecoveryService.instance.syncReceipt(
      'other-tenant',
      quoteId,
    );

    expect(receipt.lastLocalSave, isNotNull);
    expect(receipt.lastCloudBackup, isNotNull);
    expect(
      await QuotationRecoveryService.instance.lastCloudBackup(
        clientId,
        quotationId: quoteId,
      ),
      isNotNull,
    );
    expect(otherQuote.lastLocalSave, isNull);
    expect(otherQuote.lastCloudBackup, isNull);
    expect(otherTenant.lastLocalSave, isNull);
    expect(otherTenant.lastCloudBackup, isNull);
  });
}
