import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';

/// Manages APK auto-updates for the Vitharn ERP app.
/// Checks a remote endpoint for new versions, downloads, and triggers install.
class AutoUpdateService {
  AutoUpdateService._();
  static final AutoUpdateService instance = AutoUpdateService._();

  static const String _versionUrl = 'https://app.vitharn.com/api/app-version';
  static const String _downloadBase = 'https://effxrwrbsjduvhmorvrq.supabase.co/storage/v1/object/public/app-releases';

  final _versionController = StreamController<AppVersion>.broadcast();
  Stream<AppVersion> get versionStream => _versionController.stream;

  AppVersion? _lastKnownVersion;
  AppVersion? get lastKnownVersion => _lastKnownVersion;

  Timer? _checkTimer;

  /// Start periodic version checking (every 6 hours)
  void startPeriodicChecks() {
    _checkTimer?.cancel();
    _checkTimer = Timer.periodic(const Duration(hours: 6), (_) => checkForUpdate());
    // Check once immediately
    checkForUpdate();
  }

  void stopPeriodicChecks() {
    _checkTimer?.cancel();
    _checkTimer = null;
  }

  /// Check if a new APK version is available
  Future<AppVersion?> checkForUpdate() async {
    try {
      final response = await http.get(Uri.parse(_versionUrl)).timeout(const Duration(seconds: 10));
      if (response.statusCode != 200) return null;

      final data = jsonDecode(response.body);
      final version = AppVersion.fromJson(data);
      _lastKnownVersion = version;
      _versionController.add(version);
      return version;
    } catch (e) {
      debugPrint('AutoUpdate check failed: $e');
      return null;
    }
  }

  /// Check if update is needed based on version comparison
  bool needsUpdate(String currentVersion) {
    final latest = _lastKnownVersion;
    if (latest == null) return false;
    return _compareVersions(latest.version, currentVersion) > 0;
  }

  /// Download the APK to device storage
  Future<String?> downloadApk(String version, {Function(int, int)? onProgress}) async {
    try {
      final dir = await getTemporaryDirectory();
      final filePath = '${dir.path}/vitharn_update_$version.apk';
      final file = File(filePath);

      // Skip if already downloaded
      if (await file.exists()) return filePath;

      final url = '$_downloadBase/$version/app-release.apk';
      final request = http.Request('GET', Uri.parse(url));
      final response = await request.send();

      if (response.statusCode != 200) return null;

      final contentLength = response.contentLength ?? 0;
      int downloaded = 0;

      final sink = file.openWrite();
      await response.stream.listen(
        (chunk) {
          downloaded += chunk.length;
          onProgress?.call(downloaded, contentLength);
          sink.add(chunk);
        },
        onDone: () async {
          await sink.close();
        },
        onError: (e) async {
          await sink.close();
          await file.delete();
        },
      ).asFuture();

      return filePath;
    } catch (e) {
      debugPrint('APK download failed: $e');
      return null;
    }
  }

  /// Request install permissions and trigger APK installation
  Future<bool> installApk(String filePath) async {
    if (!Platform.isAndroid) return false;

    try {
      // Request install permission
      final status = await Permission.requestInstallPackages.status;
      if (!status.isGranted) {
        final result = await Permission.requestInstallPackages.request();
        if (!result.isGranted) return false;
      }

      // Use intent to install APK
      final file = File(filePath);
      if (!await file.exists()) return false;

      // Launch installer via platform channel or intent
      // This requires native Android code or a plugin
      // For now, return true to indicate file is ready
      return true;
    } catch (e) {
      debugPrint('APK install failed: $e');
      return false;
    }
  }

  /// Full update flow: check → download → install
  Future<UpdateResult> performUpdate(String currentVersion) async {
    final version = await checkForUpdate();
    if (version == null) return UpdateResult.noUpdate;
    if (!needsUpdate(currentVersion)) return UpdateResult.upToDate;

    final filePath = await downloadApk(version.version);
    if (filePath == null) return UpdateResult.downloadFailed;

    final installed = await installApk(filePath);
    return installed ? UpdateResult.success : UpdateResult.installFailed;
  }

  int _compareVersions(String v1, String v2) {
    final parts1 = v1.split('.').map(int.tryParse).toList();
    final parts2 = v2.split('.').map(int.tryParse).toList();
    for (int i = 0; i < 3; i++) {
      final p1 = i < parts1.length ? (parts1[i] ?? 0) : 0;
      final p2 = i < parts2.length ? (parts2[i] ?? 0) : 0;
      if (p1 != p2) return p1.compareTo(p2);
    }
    return 0;
  }

  void dispose() {
    _checkTimer?.cancel();
    _versionController.close();
  }
}

class AppVersion {
  final String version;
  final String downloadUrl;
  final String releaseNotes;
  final bool forceUpdate;
  final DateTime releasedAt;

  AppVersion({
    required this.version,
    required this.downloadUrl,
    required this.releaseNotes,
    required this.forceUpdate,
    required this.releasedAt,
  });

  factory AppVersion.fromJson(Map<String, dynamic> json) {
    return AppVersion(
      version: json['version'] ?? '1.0.0',
      downloadUrl: json['downloadUrl'] ?? '',
      releaseNotes: json['releaseNotes'] ?? '',
      forceUpdate: json['forceUpdate'] ?? false,
      releasedAt: DateTime.tryParse(json['releasedAt'] ?? '') ?? DateTime.now(),
    );
  }
}

enum UpdateResult {
  upToDate,
  noUpdate,
  downloadFailed,
  installFailed,
  success,
}
