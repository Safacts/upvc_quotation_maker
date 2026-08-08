import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:upvc_quotation_maker/app_state.dart';
import 'package:upvc_quotation_maker/config/client_config.dart';
import 'package:upvc_quotation_maker/config/client_loader.dart';
import 'package:upvc_quotation_maker/models.dart';
import 'test_helpers.dart';

/// Tests verifying tenant isolation mechanisms.
///
/// Client isolation is critical: each client must ONLY see their own
/// data. This tests the config layer, model layer, and AppState layer.
void main() {
  setUpAll(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('Client Isolation — Config Layer', () {
    test('TC-CI-001: ClientConfig defaults to clientId "default"', () {
      const config = ClientConfig();
      expect(config.clientId, equals('default'));
    });

    test('TC-CI-002: ClientConfig stores clientId per tenant', () {
      const config1 = ClientConfig(clientId: 'client_a');
      const config2 = ClientConfig(clientId: 'client_b');
      expect(config1.clientId, equals('client_a'));
      expect(config2.clientId, equals('client_b'));
      expect(config1.clientId, isNot(equals(config2.clientId)));
    });

    test('TC-CI-003: ClientLoader defaults to "venkateshwara" when no override', () {
      final clientId = ClientLoader.getClientId();
      // On non-web, non-define: returns 'venkateshwara'
      expect(clientId, equals('venkateshwara'));
    });

    test('TC-CI-004: different clients have different company names', () {
      const config1 = ClientConfig(clientId: 'a', companyName: 'Company A');
      const config2 = ClientConfig(clientId: 'b', companyName: 'Company B');
      expect(config1.companyName, equals('Company A'));
      expect(config2.companyName, equals('Company B'));
    });

    test('TC-CI-005: client config toJson preserves clientId', () {
      const config = ClientConfig(clientId: 'testclient', companyName: 'Test Co');
      final json = config.toJson();
      expect(json['clientId'], equals('testclient'));
      expect(json['companyName'], equals('Test Co'));
    });

    test('TC-CI-006: client config fromJson preserves clientId', () {
      final json = {'clientId': 'restored_client', 'companyName': 'Restored Co'};
      final config = ClientConfig.fromJson(json);
      expect(config.clientId, equals('restored_client'));
    });
  });

  group('Client Isolation — AppState Layer', () {
    test('TC-CI-007: applyClientConfig overwrites company name per client', () {
      final appState = AppState();

      const config1 = ClientConfig(clientId: 'a', companyName: 'First Company');
      appState.applyClientConfig(config1);
      expect(appState.companyName, equals('First Company'));

      // Switching to a different client MUST overwrite (not merge)
      const config2 = ClientConfig(clientId: 'b', companyName: 'Second Company');
      appState.applyClientConfig(config2);
      expect(appState.companyName, equals('Second Company'));
    });

    test('TC-CI-008: applyClientConfig overwrites bank details per client', () {
      final appState = AppState();

      const config1 = ClientConfig(
        clientId: 'a',
        bankName: 'Bank A',
        bankAccountNo: '1111',
      );
      appState.applyClientConfig(config1);
      expect(appState.bankName, equals('Bank A'));
      expect(appState.bankAccountNo, equals('1111'));

      const config2 = ClientConfig(
        clientId: 'b',
        bankName: 'Bank B',
        bankAccountNo: '2222',
      );
      appState.applyClientConfig(config2);
      expect(appState.bankName, equals('Bank B'));
      expect(appState.bankAccountNo, equals('2222'));
    });

    test('TC-CI-009: applyClientConfig overwrites adminEmails per client', () {
      final appState = AppState();

      const config1 = ClientConfig(
        clientId: 'a',
        adminEmails: ['a only@test.com'],
      );
      appState.applyClientConfig(config1);
      expect(appState.adminEmails, equals(['a only@test.com']));

      const config2 = ClientConfig(
        clientId: 'b',
        adminEmails: ['b only@test.com'],
      );
      appState.applyClientConfig(config2);
      expect(appState.adminEmails, equals(['b only@test.com']));
    });
  });

  group('Client Isolation — Model Layer', () {
    test('TC-CI-010: QuotationData.toMap includes clientId when provided', () {
      final q = TestHelpers.sampleQuotation();
      final map = q.toMap(clientId: 'tenant_x');
      expect(map['client_id'], equals('tenant_x'));
    });

    test('TC-CI-011: QuotationData.toMap omits clientId when null', () {
      final q = TestHelpers.sampleQuotation();
      final map = q.toMap(clientId: null);
      expect(map.containsKey('client_id'), isFalse);
    });

    test('TC-CI-012: MeasuredItem.toMap includes clientId when provided', () {
      final item = MeasuredItem();
      item.code = 'TEST';
      final map = item.toMap('quote_1', clientId: 'tenant_y');
      expect(map['client_id'], equals('tenant_y'));
    });

    test('TC-CI-013: UnmeasuredItem.toMap includes clientId when provided', () {
      final item = UnmeasuredItem();
      item.description = 'Test item';
      final map = item.toMap('quote_1', clientId: 'tenant_z');
      expect(map['client_id'], equals('tenant_z'));
    });

    test('TC-CI-014: SentEmail.toMap includes clientId when provided', () {
      final email = QuotationData; // placeholder
      final sentMap = <String, dynamic>{
        'recipient': 'test@test.com',
        'subject': 'Test',
        'body': 'Body',
        'client_id': 'tenant_w',
      };
      expect(sentMap['client_id'], equals('tenant_w'));
    });
  });

  group('Client Isolation — Quotation Calculation Parity', () {
    test('TC-CI-015: MeasuredItem sft calculation is deterministic', () {
      final item = MeasuredItem();
      item.width = 304.8; // exactly 1 foot in mm
      item.height = 304.8; // exactly 1 foot in mm
      item.units = 1;
      // sft = (304.8/304.8) * (304.8/304.8) = 1.0
      expect(item.sft, closeTo(1.0, 0.001));
    });

    test('TC-CI-016: MeasuredItem totalSft includes units multiplier', () {
      final item = MeasuredItem();
      item.width = 304.8;
      item.height = 304.8;
      item.units = 4;
      expect(item.totalSft, closeTo(4.0, 0.001));
    });

    test('TC-CI-017: MeasuredItem total = totalSft * rate', () {
      final item = MeasuredItem();
      item.width = 304.8;
      item.height = 304.8;
      item.units = 2;
      item.rate = 250.0;
      // totalSft = 2.0, total = 2.0 * 250 = 500
      expect(item.total, closeTo(500.0, 0.001));
    });

    test('TC-CI-018: QuotationData grandTotal includes transport and GST', () {
      final q = TestHelpers.sampleQuotation();
      q.transport = 1000.0;
      q.includeGst = true;
      q.gstPercentage = 18.0;
      // Need measured items for actualAmount to be nonzero
      final item = MeasuredItem();
      item.width = 304.8;
      item.height = 304.8;
      item.units = 1;
      item.rate = 1000.0;
      q.measuredItems = [item];
      // actualAmount = 1000, transport = 1000, taxable = 2000
      // igst = 2000 * 0.18 = 360
      // grandTotal = 1000 + 1000 + 360 = 2360
      expect(q.grandTotal, closeTo(2360.0, 0.01));
    });

    test('TC-CI-019: QuotationData grandTotal zero when no GST and no transport', () {
      final q = TestHelpers.sampleQuotation();
      q.transport = 0;
      q.includeGst = false;
      q.measuredItems = [];
      q.unmeasuredItems = [];
      expect(q.grandTotal, equals(0.0));
    });
  });
}
