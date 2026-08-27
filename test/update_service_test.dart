import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:upvc_quotation_maker/config/client_config.dart';
import 'package:upvc_quotation_maker/services/auto_update_service.dart';

/// Unit tests for the in-app APK updater's pure logic + check/dismiss flow.
/// The Android-only gate is forced on via [AutoUpdateService.debugSetIsNative]
/// so the whole check flow runs on the desktop test host. The download path is
/// NOT exercised against real storage — path_provider is unregistered in tests,
/// so downloadAndInstall() deterministically emits DownloadFailedEvent.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const installedVersion = (version: '1.0.0', buildNumber: 1);

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  ClientConfig configWith({
    String url = 'https://example.com/upvc-quote.apk',
    String name = '1.0.1',
    int code = 2,
    String notes = '',
    bool force = false,
  }) {
    return ClientConfig(
      appDownloadUrl: url,
      appVersionName: name,
      appVersionCode: code,
      appReleaseNotes: notes,
      forceUpdate: force,
    );
  }

  group('UpdateInfo.isVersionNewer', () {
    test('versionCode is authoritative when both codes are present', () {
      expect(
        UpdateInfo.isVersionNewer(
          latestCode: 2,
          installedCode: 1,
          latestName: '1.0.0',
          installedName: '1.0.0',
        ),
        isTrue,
      );
      expect(
        UpdateInfo.isVersionNewer(
          latestCode: 1,
          installedCode: 1,
          latestName: '2.0.0',
          installedName: '1.0.0',
        ),
        isFalse,
        reason: 'equal codes = same build, never an update',
      );
      expect(
        UpdateInfo.isVersionNewer(
          latestCode: 1,
          installedCode: 2,
          latestName: '9.9.9',
          installedName: '1.0.0',
        ),
        isFalse,
        reason: 'installed code is HIGHER — published is older',
      );
    });

    test('semver name comparison is the fallback when codes are missing', () {
      expect(
        UpdateInfo.isVersionNewer(
          latestCode: 0,
          installedCode: 0,
          latestName: '1.2.3',
          installedName: '1.2.0',
        ),
        isTrue,
      );
      expect(
        UpdateInfo.isVersionNewer(
          latestCode: 0,
          installedCode: 0,
          latestName: '1.2.3',
          installedName: '1.2.3',
        ),
        isFalse,
      );
      expect(
        UpdateInfo.isVersionNewer(
          latestCode: 0,
          installedCode: 0,
          latestName: '1.2',
          installedName: '1.2.0',
        ),
        isFalse,
        reason: '1.2 == 1.2.0 (missing parts count as 0)',
      );
      expect(
        UpdateInfo.isVersionNewer(
          latestCode: 0,
          installedCode: 0,
          latestName: '1.2.3-beta',
          installedName: '1.2.3',
        ),
        isFalse,
        reason: 'non-numeric suffix parses to 0, so names compare equal',
      );
    });

    test('unknown installed version with a published APK → update needed', () {
      expect(
        UpdateInfo.isVersionNewer(
          latestCode: 2,
          installedCode: 0,
          latestName: '1.0.1',
          installedName: '',
        ),
        isTrue,
      );
    });

    test('fleet reality: installed code 12 vs published code 14 → newer', () {
      // The exact production scenario from Aadi's bug report (26-08-2026):
      // users on older builds while CI has published v1.0.14 / code 14.
      expect(
        UpdateInfo.isVersionNewer(
          latestCode: 14,
          installedCode: 12,
          latestName: '1.0.14',
          installedName: '1.0.12',
        ),
        isTrue,
      );
      expect(
        UpdateInfo.isVersionNewer(
          latestCode: 14,
          installedCode: 11,
          latestName: '1.0.14',
          installedName: '1.0.11',
        ),
        isTrue,
        reason: 'v1.0.11 fleet devices must also be prompted',
      );
    });

    test('codes are compared as INTs, never as strings ("9" > "14" trap)', () {
      // Alphabetically "9" > "14"; numerically 9 < 14. If anyone ever
      // reintroduces a string comparison this assertion catches it.
      expect(
        UpdateInfo.isVersionNewer(
          latestCode: 14,
          installedCode: 9,
          latestName: '1.0.14',
          installedName: '1.0.9',
        ),
        isTrue,
      );
    });

    test('UpdateInfo.fromConfig maps the client config fields', () {
      final info = UpdateInfo.fromConfig(
        configWith(notes: 'Fixed crash', force: true),
      );
      expect(info.versionName, '1.0.1');
      expect(info.versionCode, 2);
      expect(info.releaseNotes, 'Fixed crash');
      expect(info.forceUpdate, isTrue);
      expect(info.downloadUrl, 'https://example.com/upvc-quote.apk');
    });
  });

  group('AutoUpdateService.checkNow', () {
    late AutoUpdateService service;

    setUp(() {
      service = AutoUpdateService();
      service.debugSetIsNative(true);
      service.debugSetInstalledVersionProvider(() async => installedVersion);
    });

    tearDown(() {
      service.dispose();
    });

    Future<List<AutoUpdateEvent>> check({required ClientConfig config}) async {
      final events = <AutoUpdateEvent>[];
      final sub = service.events.listen(events.add);
      try {
        await service.checkNow(config: config);
        await pumpEventQueue();
      } finally {
        await sub.cancel();
      }
      return events;
    }

    test('no published APK → UpdateNotAvailable, no pending update', () async {
      final events = await check(config: configWith(url: ''));
      expect(events.whereType<UpdateAvailableEvent>(), isEmpty);
      expect(events.whereType<UpdateNotAvailableEvent>(), hasLength(1));
      expect(service.pendingUpdate, isNull);
    });

    test('newer published version → UpdateAvailable + pending info', () async {
      final events = await check(config: configWith());
      final available = events.whereType<UpdateAvailableEvent>();
      expect(available, hasLength(1));
      expect(service.pendingUpdate?.versionCode, 2);
      expect(service.hasPendingUpdate, isTrue);
    });

    test('installed version already latest → no update', () async {
      final events = await check(config: configWith(name: '1.0.0', code: 1));
      expect(events.whereType<UpdateAvailableEvent>(), isEmpty);
      expect(service.pendingUpdate, isNull);
    });

    test('dismissed non-force version is not re-offered', () async {
      service.debugSetDismissedVersion('2');
      final events = await check(config: configWith());
      expect(events.whereType<UpdateAvailableEvent>(), isEmpty);
      expect(service.pendingUpdate, isNull);
    });

    test('a NEWER code supersedes an earlier dismissal', () async {
      service.debugSetDismissedVersion('2');
      final events = await check(config: configWith(name: '1.0.2', code: 3));
      expect(events.whereType<UpdateAvailableEvent>(), hasLength(1));
      expect(service.pendingUpdate?.versionCode, 3);
    });

    test('forceUpdate ignores dismissal', () async {
      service.debugSetDismissedVersion('2');
      final events = await check(config: configWith(force: true));
      expect(events.whereType<UpdateAvailableEvent>(), hasLength(1));
    });
  });

  group('AutoUpdateService.dismissPending', () {
    late AutoUpdateService service;

    setUp(() {
      service = AutoUpdateService();
      service.debugSetIsNative(true);
      service.debugSetInstalledVersionProvider(() async => installedVersion);
    });

    tearDown(() {
      service.dispose();
    });

    test('persists the dismissed code so it survives restarts', () async {
      await service.checkNow(config: configWith());
      expect(service.hasPendingUpdate, isTrue);

      service.dismissPending();

      expect(service.hasPendingUpdate, isFalse);
      // The service writes prefs fire-and-forget; drain microtasks first.
      await pumpEventQueue();
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('auto_update_dismissed_version_code'), '2');
    });

    test('dismissed code is restored on initialize (new session)', () async {
      // Simulate the prefs left by a previous session.
      SharedPreferences.setMockInitialValues({
        'auto_update_dismissed_version_code': '2',
      });
      final fresh = AutoUpdateService();
      fresh.debugSetIsNative(true);
      fresh.debugSetInstalledVersionProvider(() async => installedVersion);
      fresh.initialize(configProvider: () => configWith());
      // Let the async prefs restore settle.
      await pumpEventQueue();

      final events = <AutoUpdateEvent>[];
      final sub = fresh.events.listen(events.add);
      try {
        await fresh.checkNow(config: configWith());
        await pumpEventQueue();
      } finally {
        await sub.cancel();
      }
      expect(
        events.whereType<UpdateAvailableEvent>(),
        isEmpty,
        reason: 'restored dismissal must suppress the re-offer',
      );
      fresh.dispose();
    });
  });

  group('ClientConfig.fromJson updater fields (jsonb tolerance)', () {
    test('string-typed version code ("14") still parses as an int', () {
      // Some config writers store jsonb values as strings. Before the
      // _asInt hardening, "14" parsed to 0 and the updater silently decided
      // the client was already up to date.
      final cfg = ClientConfig.fromJson(const {
        'clientId': 'venkateshwara',
        'appDownloadUrl': 'https://example.com/upvc-update.apk',
        'appVersionName': '1.0.14',
        'appVersionCode': '14',
        'forceUpdate': 'false',
      });
      expect(cfg.appVersionCode, 14);
      expect(cfg.appVersionName, '1.0.14');
      expect(cfg.appDownloadUrl, 'https://example.com/upvc-update.apk');
      expect(cfg.forceUpdate, isFalse);
    });

    test('snake_case raw DB rows parse identically', () {
      final cfg = ClientConfig.fromJson(const {
        'app_download_url': 'https://example.com/a.apk',
        'app_version_name': '1.0.14',
        'app_version_code': 14,
        'force_update': true,
      });
      expect(cfg.appVersionCode, 14);
      expect(cfg.forceUpdate, isTrue);
    });

    test('missing fields fall back to safe defaults (no throw)', () {
      final cfg = ClientConfig.fromJson(const {});
      expect(cfg.appVersionCode, 0);
      expect(cfg.appVersionName, '');
      expect(cfg.appDownloadUrl, '');
      expect(cfg.forceUpdate, isFalse);
    });

    test('client_public stringified branding payload remains usable', () {
      final cfg = ClientConfig.fromJson(const {
        'clientId': 'venkateshwara',
        'appName': 'Venkateshwara UPVC Quote',
        'companyName': 'Venkateshwara UPVC',
        'logoUrl': 'https://example.com/logo.png',
        'primaryColor': '4284704497',
        'accentColor': '4293675161',
        'defaultGstPercentage': '18',
        'isActive': 'true',
        'termsAndConditions': '["Advance required", "Valid for 15 days"]',
        'landingServices': '["UPVC Windows", "UPVC Doors"]',
        'landingTestimonials': '[]',
      });

      expect(cfg.companyName, 'Venkateshwara UPVC');
      expect(cfg.logoUrl, 'https://example.com/logo.png');
      expect(cfg.primaryColor.toARGB32(), 4284704497);
      expect(cfg.accentColor.toARGB32(), 4293675161);
      expect(cfg.defaultGstPercentage, 18);
      expect(cfg.isActive, isTrue);
      expect(cfg.termsAndConditions, ['Advance required', 'Valid for 15 days']);
      expect(cfg.landingServices, ['UPVC Windows', 'UPVC Doors']);
    });
  });

  group(
    'fleet update scenario end-to-end (installed 11/12 → published 14)',
    () {
      late AutoUpdateService service;

      setUp(() {
        SharedPreferences.setMockInitialValues({});
        service = AutoUpdateService();
        service.debugSetIsNative(true);
      });

      tearDown(() {
        service.dispose();
      });

      Future<List<AutoUpdateEvent>> check(ClientConfig config) async {
        final events = <AutoUpdateEvent>[];
        final sub = service.events.listen(events.add);
        try {
          await service.checkNow(config: config);
          await pumpEventQueue();
        } finally {
          await sub.cancel();
        }
        return events;
      }

      test(
        'device on v1.0.11 gets an UpdateAvailableEvent for v1.0.14',
        () async {
          service.debugSetInstalledVersionProvider(
            () async => (version: '1.0.11', buildNumber: 11),
          );
          final cfg = ClientConfig.fromJson(const {
            'appDownloadUrl': 'https://example.com/app-releases/v14.apk',
            'appVersionName': '1.0.14',
            'appVersionCode': 14,
          });

          final events = await check(cfg);
          final available = events.whereType<UpdateAvailableEvent>().toList();
          expect(available, hasLength(1));
          expect(available.single.info.versionCode, 14);
          expect(available.single.info.versionName, '1.0.14');
          expect(
            service.pendingUpdate?.downloadUrl,
            'https://example.com/app-releases/v14.apk',
          );
        },
      );

      test(
        'string-typed published code from a raw DB row still prompts',
        () async {
          service.debugSetInstalledVersionProvider(
            () async => (version: '1.0.11', buildNumber: 11),
          );
          // Simulates config->>'appVersionCode' arriving as a JSON string.
          final cfg = ClientConfig.fromJson(const {
            'appDownloadUrl': 'https://example.com/app-releases/v14.apk',
            'appVersionName': '1.0.14',
            'appVersionCode': '14',
          });

          final events = await check(cfg);
          expect(
            events.whereType<UpdateAvailableEvent>(),
            hasLength(1),
            reason:
                'a string-typed code must never silently suppress the prompt',
          );
        },
      );
    },
  );

  group('AutoUpdateService.downloadAndInstall', () {
    test(
      'no publish URL → DownloadFailedEvent (deterministic on test host)',
      () async {
        final service = AutoUpdateService();
        service.debugSetIsNative(true);
        service.debugSetInstalledVersionProvider(() async => installedVersion);

        final events = <AutoUpdateEvent>[];
        final sub = service.events.listen(events.add);
        try {
          final ok = await service.downloadAndInstall();
          await pumpEventQueue();
          expect(ok, isFalse);
          expect(events.whereType<DownloadFailedEvent>(), hasLength(1));
        } finally {
          await sub.cancel();
          service.dispose();
        }
      },
    );
  });
}
