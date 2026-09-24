import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:upvc_quotation_maker/app_state.dart';
import 'package:upvc_quotation_maker/config/client_config.dart';

/// Tenant-brand race regression (KPR quote on Vaishnavi letterhead, 24-09-2026).
///
/// Root cause: `AppState._loadSettings` is async fire-and-forget while boot
/// code called `applyClientConfig` synchronously. On a slow first prefs read,
/// the tenant apply landed FIRST and stale per-device prefs (a previous
/// tenant's company block) landed SECOND, clobbering live branding.
///
/// The fix is two-layer: (1) boot entries `await settingsReady` before
/// applying, and (2) a late `_loadSettings` skips the business block once a
/// config has been applied. These tests pin layer 2 (order-independent) and
/// the boot order contract, plus that per-device toggles still load.
void main() {
  group('tenant brand race', () {
    const kpr = ClientConfig(
      clientId: 'kprupvc',
      companyName: 'KPR UPVC WINDOWS AND DOOR SYSTEMS',
      gstNumber: '36AAQFK269C1Z1',
      bankName: 'UNION BANK OF INDIA',
    );

    setUp(() {
      // Device previously ran Vaishnavi: prefs hold her full company block.
      SharedPreferences.setMockInitialValues({
        'companyName': 'VAISHNAVI UPVC WINDOWS AND DOORS',
        'companyAddress': 'Jillelaguda, Hyderabad',
        'gstNumber': '36CSPPV7053P1ZJ',
        'bankName': 'yes bank',
      });
    });

    test('late prefs never clobber an applied tenant (old race order)', () async {
      final appState = AppState();
      // Old boot order: apply immediately, prefs resolve whenever.
      await appState.applyClientConfig(kpr);
      await appState.settingsReady;
      await Future.delayed(const Duration(milliseconds: 50));

      expect(appState.clientConfig.clientId, 'kprupvc');
      expect(appState.companyName, 'KPR UPVC WINDOWS AND DOOR SYSTEMS');
      expect(appState.gstNumber, '36AAQFK269C1Z1');
      expect(appState.bankName, 'UNION BANK OF INDIA');
    });

    test('fixed boot order: prefs first, then tenant wins', () async {
      final appState = AppState();
      await appState.settingsReady;
      await appState.applyClientConfig(kpr);

      expect(appState.companyName, 'KPR UPVC WINDOWS AND DOOR SYSTEMS');
      expect(appState.gstNumber, '36AAQFK269C1Z1');
    });

    test('per-device toggles still load from prefs', () async {
      SharedPreferences.setMockInitialValues({
        'companyName': 'VAISHNAVI UPVC WINDOWS AND DOORS',
        'include_cad_diagrams': false,
      });
      final appState = AppState();
      await appState.settingsReady;
      await Future.delayed(const Duration(milliseconds: 50));

      // No tenant applied: prefs (including toggles) load normally.
      expect(appState.companyName, 'VAISHNAVI UPVC WINDOWS AND DOORS');
      expect(appState.includeCadDiagrams, isFalse);
    });

    test('settingsReady completes even with no stored prefs', () async {
      SharedPreferences.setMockInitialValues({});
      final appState = AppState();
      await appState.settingsReady.timeout(const Duration(seconds: 5));
    });
  });
}
