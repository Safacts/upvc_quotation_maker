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
            latestCode: 2, installedCode: 1, latestName: '1.0.0', installedName: '1.0.0'),
        isTrue,
      );
      expect(
        UpdateInfo.isVersionNewer(
            latestCode: 1, installedCode: 1, latestName: '2.0.0', installedName: '1.0.0'),
        isFalse,
        reason: 'equal codes = same build, never an update',
      );
      expect(
        UpdateInfo.isVersionNewer(
            latestCode: 1, installedCode: 2, latestName: '9.9.9', installedName: '1.0.0'),
        isFalse,
        reason: 'installed code is HIGHER — published is older',
      );
    });

    test('semver name comparison is the fallback when codes are missing', () {
      expect(
        UpdateInfo.isVersionNewer(
            latestCode: 0, installedCode: 0, latestName: '1.2.3', installedName: '1.2.0'),
        isTrue,
      );
      expect(
        UpdateInfo.isVersionNewer(
            latestCode: 0, installedCode: 0, latestName: '1.2.3', installedName: '1.2.3'),
        isFalse,
      );
      expect(
        UpdateInfo.isVersionNewer(
            latestCode: 0, installedCode: 0, latestName: '1.2', installedName: '1.2.0'),
        isFalse,
        reason: '1.2 == 1.2.0 (missing parts count as 0)',
      );
      expect(
        UpdateInfo.isVersionNewer(
            latestCode: 0, installedCode: 0, latestName: '1.2.3-beta', installedName: '1.2.3'),
        isFalse,
        reason: 'non-numeric suffix parses to 0, so names compare equal',
      );
    });

    test('unknown installed version with a published APK → update needed', () {
      expect(
        UpdateInfo.isVersionNewer(
            latestCode: 2, installedCode: 0, latestName: '1.0.1', installedName: ''),
        isTrue,
      );
    });

    test('UpdateInfo.fromConfig maps the client config fields', () {
      final info = UpdateInfo.fromConfig(configWith(notes: 'Fixed crash', force: true));
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

    Future<List<AutoUpdateEvent>> check(
        {required ClientConfig config}) async {
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
      SharedPreferences.setMockInitialValues(
          {'auto_update_dismissed_version_code': '2'});
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
      expect(events.whereType<UpdateAvailableEvent>(), isEmpty,
          reason: 'restored dismissal must suppress the re-offer');
      fresh.dispose();
    });
  });

  group('AutoUpdateService.downloadAndInstall', () {
    test('no publish URL → DownloadFailedEvent (deterministic on test host)',
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
    });
  });
}
