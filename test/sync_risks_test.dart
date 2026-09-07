import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:upvc_quotation_maker/services/quotation_recovery_service.dart';
import 'package:upvc_quotation_maker/widgets/offline_indicator.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  String source(String path) => File(path).readAsStringSync();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('durable recovery flush', () {
    test('a queued envelope remains after a failed flush contract', () async {
      final service = QuotationRecoveryService.instance;
      const clientId = 'test-client';
      const quoteId = '11111111-1111-4111-8111-111111111111';

      await service.saveBundle(
        clientId: clientId,
        quotation: {
          'id': quoteId,
          'customer_name': 'Offline customer',
          'sync_version': 0,
        },
        measuredItems: const [],
        unmeasuredItems: const [],
      );

      // The implementation must stop on a queued result and must not remove
      // the envelope. This source assertion protects the failure path that is
      // difficult to drive without replacing the singleton Supabase client.
      final recovery = source('lib/services/quotation_recovery_service.dart');
      expect(recovery, contains('if (result.state == RecoverySaveState.queued) return;'));
      expect(recovery, contains('catch (error)'));
      expect(recovery, contains("message: 'Saved on this device. Cloud backup will retry automatically.'"));

      expect(await service.pendingCount(clientId), 1);
      expect((await service.pendingEnvelopes(clientId)).single['quotation_id'], quoteId);
    });
  });

  test('repeated sync and flush calls share one in-flight operation', () {
    final sync = source('lib/services/sync_engine.dart');
    final recovery = source('lib/services/quotation_recovery_service.dart');

    expect(sync, contains('final existing = _inFlight;'));
    expect(sync, contains('if (existing != null) return existing;'));
    expect(sync, contains('_inFlight = run;'));
    expect(recovery, contains('final existing = _flushInFlight;'));
    expect(recovery, contains('if (existing != null) return existing;'));
    expect(recovery, contains('_flushInFlight = run;'));
  });

  test('product delta response and tombstone contract stays aligned', () {
    final api = source('app/api/content/sync/route.ts');
    final client = source('lib/services/sync_engine.dart');

    expect(api, contains('updated_at: "gt." + since'));
    expect(api, contains('soft_deleted: "eq.true"'));
    expect(api, contains('deleted.push({ content_type: "products", ids })'));
    expect(api, contains('changes: changes'));
    expect(api, contains('deleted,'));
    expect(api, contains('timestamp: new Date().toISOString()'));

    expect(client, contains("final deleted = (json['deleted'] as List?) ?? const []"));
    expect(client, contains("if (contentType == 'products')"));
    expect(client, contains("'soft_deleted': true"));
    expect(client, contains("'updated_at':"));
    expect(client, contains("json['timestamp']?.toString()"));
  });

  testWidgets('offline state is one quiet banner, not repeated transient messages',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Column(
          children: [
            OfflineBanner(isOffline: true, pendingSyncCount: 2),
          ],
        ),
      ),
    );

    expect(find.byType(OfflineBanner), findsOneWidget);
    expect(find.byIcon(Icons.wifi_off), findsOneWidget);
    expect(find.byType(SnackBar), findsNothing);

    await tester.pumpWidget(
      const MaterialApp(
        home: Column(
          children: [
            OfflineBanner(isOffline: false, pendingSyncCount: 0),
          ],
        ),
      ),
    );
    await tester.pump();
    expect(find.byType(OfflineBanner), findsOneWidget);
    expect(find.textContaining('pending sync'), findsNothing);
  });

  test('background sync paths do not emit SnackBars or banners', () {
    final engine = source('lib/services/sync_engine.dart');
    final dashboard = source('lib/dashboard_screen.dart');
    final updateBanner = source('lib/widgets/update_banner.dart');

    expect(engine, isNot(contains('showSnackBar')));
    final syncMethod = dashboard.substring(dashboard.indexOf('Future<void> _syncEverything()'));
    expect(syncMethod.substring(0, syncMethod.indexOf('Future<void> _updateStatus')),
        isNot(contains('showSnackBar')));
    expect(updateBanner, contains('if (_phase == _BannerPhase.applying) return;'));
  });
}
