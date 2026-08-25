import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/client_config.dart';

/// Events emitted by [AutoUpdateService] on its broadcast stream.
sealed class AutoUpdateEvent {}

/// A newer APK is published for this client and the installed version is older.
class UpdateAvailableEvent extends AutoUpdateEvent {
  final UpdateInfo info;
  UpdateAvailableEvent(this.info);
}

/// No newer APK (or nothing published yet). [reason] is for debug logging.
class UpdateNotAvailableEvent extends AutoUpdateEvent {
  final String reason;
  UpdateNotAvailableEvent(this.reason);
}

/// Bytes downloaded so far out of [total] (0 when the server sends no length).
class DownloadProgressEvent extends AutoUpdateEvent {
  final int downloaded;
  final int total;
  DownloadProgressEvent(this.downloaded, this.total);
}

/// APK fully written to [path]; installer is about to be launched.
class DownloadCompleteEvent extends AutoUpdateEvent {
  final String path;
  DownloadCompleteEvent(this.path);
}

class DownloadFailedEvent extends AutoUpdateEvent {
  final String message;
  DownloadFailedEvent(this.message);
}

/// The system installer was launched for the downloaded APK.
class InstallTriggeredEvent extends AutoUpdateEvent {}

class InstallFailedEvent extends AutoUpdateEvent {
  final String message;
  InstallFailedEvent(this.message);
}

/// Latest published APK metadata for the current client, derived from
/// [ClientConfig] fields written by the APK CI workflow.
class UpdateInfo {
  final String versionName;
  final int versionCode;
  final String releaseNotes;
  final bool forceUpdate;
  final String downloadUrl;

  const UpdateInfo({
    required this.versionName,
    required this.versionCode,
    required this.releaseNotes,
    required this.forceUpdate,
    required this.downloadUrl,
  });

  factory UpdateInfo.fromConfig(ClientConfig cfg) => UpdateInfo(
        versionName: cfg.appVersionName,
        versionCode: cfg.appVersionCode,
        releaseNotes: cfg.appReleaseNotes,
        forceUpdate: cfg.forceUpdate,
        downloadUrl: cfg.appDownloadUrl,
      );

  /// True when the published version is strictly newer than the installed one.
  ///
  /// versionCode (build number) is authoritative; versionName (semver string)
  /// is only a fallback for configs that never published a code.
  static bool isVersionNewer({
    required int latestCode,
    required int installedCode,
    required String latestName,
    required String installedName,
  }) {
    if (latestCode > 0 && installedCode > 0) return latestCode > installedCode;
    if (latestName.isNotEmpty && installedName.isNotEmpty) {
      return _compareSemver(latestName, installedName) > 0;
    }
    // Unknown installed version with a published APK → treat as needing update.
    return latestCode > 0 || latestName.isNotEmpty;
  }

  /// Semver-ish compare: split on '.', compare each numeric part, missing parts
  /// count as 0. Non-numeric segments are skipped (treated as 0).
  static int _compareSemver(String a, String b) {
    final pa = a.split('.').map((p) => int.tryParse(p.trim()) ?? 0).toList();
    final pb = b.split('.').map((p) => int.tryParse(p.trim()) ?? 0).toList();
    final len = pa.length > pb.length ? pa.length : pb.length;
    for (var i = 0; i < len; i++) {
      final x = i < pa.length ? pa[i] : 0;
      final y = i < pb.length ? pb[i] : 0;
      if (x != y) return x.compareTo(y);
    }
    return 0;
  }
}

/// Per-client in-app APK updater.
///
/// Source of truth = the client's OWN config: [ClientConfig.appDownloadUrl]
/// (the APK URL published by the CI) + [ClientConfig.appVersionName] /
/// [ClientConfig.appVersionCode] (the version the CI built). The installed
/// version comes from `package_info_plus`.
///
/// Android only — web is always fresh from Vercel. No secrets involved: the
/// storage bucket is public by design.
class AutoUpdateService {
  AutoUpdateService();

  static final AutoUpdateService instance = AutoUpdateService._();
  AutoUpdateService._();

  /// Method channel implemented in `MainActivity.kt` — launches the system
  /// installer with a FileProvider `content://` URI.
  static const MethodChannel _installChannel = MethodChannel('app.vitharn/install');
  static const String _dismissedKey = 'auto_update_dismissed_version_code';

  /// How often the periodic re-check runs while the app is open.
  static const Duration checkInterval = Duration(hours: 6);

  ClientConfig Function() _configProvider = () => const ClientConfig();
  Future<({String version, int buildNumber})> Function()? _installedVersionProvider;
  http.Client? _client;
  String? _installedVersion;
  int _installedCode = 0;

  final _events = StreamController<AutoUpdateEvent>.broadcast();
  Stream<AutoUpdateEvent> get events => _events.stream;

  Timer? _timer;
  bool _initialized = false;
  bool _checkInFlight = false;
  UpdateInfo? _pendingUpdate;
  String? _dismissedVersion;

  UpdateInfo? get pendingUpdate => _pendingUpdate;
  bool get hasPendingUpdate => _pendingUpdate != null;

  bool get _isAndroidNative {
    // Test hook override (set via debugSetIsNative) lets `flutter test` run the
    // full check/download flow on a desktop host without an emulator.
    if (_forceNative != null) return _forceNative!;
    return !kIsWeb && Platform.isAndroid;
  }

  bool? _forceNative;

  /// Starts the 6-hour periodic check. The very first check is deferred to the
  /// dashboard (so it runs after login, with the logged-in client's config).
  /// Safe to call multiple times — only the first call starts the timer.
  void initialize({required ClientConfig Function() configProvider}) {
    if (!_isAndroidNative) return;
    _configProvider = configProvider;
    if (_initialized) return;
    _initialized = true;
    _restoreDismissedVersion();
    _timer = Timer.periodic(checkInterval, (_) {
      checkNow().ignore();
    });
  }

  /// "Later" is remembered across app restarts so a dismissed version does not
  /// nag again on the next launch (only a NEWER published version re-prompts).
  void _restoreDismissedVersion() {
    try {
      SharedPreferences.getInstance().then((p) {
        final stored = p.getString(_dismissedKey);
        if (stored != null) _dismissedVersion = stored;
      });
    } catch (_) {}
  }

  /// Re-point the config source (e.g. after a client switch on login).
  void setConfig(ClientConfig config) {
    _configProvider = () => config;
  }

  /// @visibleForTesting
  void debugSetInstalledVersionProvider(
      Future<({String version, int buildNumber})> Function() provider) {
    _installedVersionProvider = provider;
  }

  /// @visibleForTesting
  void debugSetHttpClient(http.Client client) {
    _client = client;
  }

  /// @visibleForTesting
  void debugSetDismissedVersion(String? code) {
    _dismissedVersion = code;
  }

  /// @visibleForTesting — overrides the Android-only gate so the full flow can
  /// be exercised from `flutter test` on a desktop host.
  void debugSetIsNative(bool value) {
    _forceNative = value;
  }

  /// Checks whether a newer APK exists for the current client and emits
  /// [UpdateAvailableEvent] when one does (re-emitted until dismissed).
  /// Returns the pending [UpdateInfo] or null when up to date.
  Future<UpdateInfo?> checkNow({ClientConfig? config}) async {
    if (!_isAndroidNative) return null;
    if (_checkInFlight) return _pendingUpdate;
    _checkInFlight = true;
    try {
      final cfg = config ?? _configProvider();
      if (cfg.appDownloadUrl.isEmpty) {
        _pendingUpdate = null;
        _events.add(UpdateNotAvailableEvent('No APK published for this client.'));
        return null;
      }

      await _readInstalledVersion();
      final info = UpdateInfo.fromConfig(cfg);
      final newer = UpdateInfo.isVersionNewer(
        latestCode: info.versionCode,
        installedCode: _installedCode,
        latestName: info.versionName,
        installedName: _installedVersion ?? '',
      );

      if (!newer) {
        _pendingUpdate = null;
        _events.add(UpdateNotAvailableEvent('Already on the latest version.'));
        return null;
      }

      // A dismissed version stays dismissed until a NEWER code appears.
      final dismissed = _dismissedVersion;
      final dismissedCode = dismissed != null ? int.tryParse(dismissed) ?? 0 : 0;
      if (info.forceUpdate == false && info.versionCode > 0 && info.versionCode <= dismissedCode) {
        _pendingUpdate = null;
        _events.add(UpdateNotAvailableEvent('Dismissed by user.'));
        return null;
      }

      _pendingUpdate = info;
      _events.add(UpdateAvailableEvent(info));
      return info;
    } catch (e) {
      debugPrint('AutoUpdate: check failed: $e');
      _events.add(UpdateNotAvailableEvent('Check error: $e'));
      return null;
    } finally {
      _checkInFlight = false;
    }
  }

  /// User pressed "Later": silence this version until a newer one ships.
  void dismissPending() {
    final info = _pendingUpdate;
    _pendingUpdate = null;
    if (info == null || info.versionCode <= 0) return;
    _dismissedVersion = '${info.versionCode}';
    try {
      SharedPreferences.getInstance().then(
        (p) => p.setString(_dismissedKey, _dismissedVersion!),
      );
    } catch (_) {}
  }

  /// Downloads the APK to app-private external storage (no permissions
  /// needed — it lives under `/sdcard/Android/data/<pkg>/files/`).
  /// Emits [DownloadProgressEvent] and returns the local path, or null.
  Future<String?> downloadApk({void Function(int downloaded, int total)? onProgress}) async {
    if (!_isAndroidNative) return null;
    final cfg = _configProvider();
    final url = cfg.appDownloadUrl;
    if (url.isEmpty) return null;
    try {
      final dir = await getExternalStorageDirectory();
      if (dir == null) {
        debugPrint('AutoUpdate: no external storage dir');
        return null;
      }
      final fileName = cfg.appVersionCode > 0
          ? 'upvc-update-${cfg.appVersionCode}.apk'
          : 'upvc-update.apk';
      final path = '${dir.path}/$fileName';
      final file = File(path);
      if (await file.exists()) return path;

      // Download to a ".part" sibling and rename ONLY after the body stream has
      // been fully consumed. The exists() fast-path above must never hand back a
      // TRUNCATED apk from an interrupted attempt — the 30s timeout covers the
      // response HEADERS, not the body, and Android's package parser rejects a
      // short file with "There was a problem parsing the package".
      final partFile = File('$path.part');

      final client = _client ?? http.Client();
      final ownsClient = _client == null;
      try {
        final response = await client
            .send(http.Request('GET', Uri.parse(url)))
            .timeout(const Duration(seconds: 30));
        if (response.statusCode != 200) {
          debugPrint('AutoUpdate: download HTTP ${response.statusCode}');
          return null;
        }

        final total = response.contentLength ?? 0;
        var downloaded = 0;
        final sink = partFile.openWrite();
        try {
          await for (final chunk in response.stream) {
            downloaded += chunk.length;
            sink.add(chunk);
            onProgress?.call(downloaded, total);
            _events.add(DownloadProgressEvent(downloaded, total));
          }
          await sink.flush();
        } finally {
          await sink.close();
        }
        await partFile.rename(path);
        return path;
      } finally {
        // Close only clients this call created — an injected test client is
        // owned by the caller.
        if (ownsClient) client.close();
      }
    } catch (e) {
      debugPrint('AutoUpdate: download failed: $e');
      return null;
    }
  }

  /// Launches the system installer for the downloaded APK via the native
  /// method channel (FileProvider `content://` URI + ACTION_VIEW).
  Future<bool> installApk(String path) async {
    if (!_isAndroidNative) return false;
    try {
      final ok = await _installChannel.invokeMethod<bool>('installApk', {'path': path});
      if (ok == true) {
        _events.add(InstallTriggeredEvent());
        return true;
      }
      _events.add(InstallFailedEvent('Installer declined the APK.'));
      return false;
    } on PlatformException catch (e) {
      debugPrint('AutoUpdate: install PlatformException: ${e.message}');
      _events.add(InstallFailedEvent(e.message ?? 'Install failed.'));
      return false;
    } catch (e) {
      debugPrint('AutoUpdate: install failed: $e');
      _events.add(InstallFailedEvent('$e'));
      return false;
    }
  }

  /// Full flow: download (with progress events) then install.
  /// Returns true when the system installer was launched.
  Future<bool> downloadAndInstall() async {
    final path = await downloadApk();
    if (path == null) {
      _events.add(DownloadFailedEvent('Download failed.'));
      return false;
    }
    _events.add(DownloadCompleteEvent(path));
    return installApk(path);
  }

  Future<void> _readInstalledVersion() async {
    try {
      if (_installedVersionProvider != null) {
        final v = await _installedVersionProvider!();
        _installedVersion = v.version;
        _installedCode = v.buildNumber;
        return;
      }
      final info = await PackageInfo.fromPlatform();
      _installedVersion = info.version;
      _installedCode = int.tryParse(info.buildNumber) ?? 0;
    } catch (e) {
      debugPrint('AutoUpdate: PackageInfo unavailable: $e');
      _installedVersion = '';
      _installedCode = 0;
    }
  }

  void dispose() {
    _timer?.cancel();
    _events.close();
  }
}
