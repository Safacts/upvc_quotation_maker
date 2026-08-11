import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Smart auto-update: non-intrusive, user-friendly, background download.
class SmartAutoUpdate {
  SmartAutoUpdate._();
  static final SmartAutoUpdate instance = SmartAutoUpdate._();

  static const String _versionUrl = 'https://app.vitharn.com/api/app-version';
  static const String _lastDismissedKey = 'update_dismissed_version';
  static const String _lastCheckKey = 'last_update_check';

  AppVersion? _latestVersion;
  bool _dismissed = false;

  /// Check for updates WITHOUT blocking the UI.
  Future<bool> checkSilently() async {
    try {
      // Throttle: don't check more than once per hour
      final prefs = await SharedPreferences.getInstance();
      final lastCheck = prefs.getInt(_lastCheckKey) ?? 0;
      final now = DateTime.now().millisecondsSinceEpoch;
      if (now - lastCheck < 3600000) return false;

      await prefs.setInt(_lastCheckKey, now);

      final response = await http.get(Uri.parse(_versionUrl)).timeout(
        const Duration(seconds: 5),
      );
      if (response.statusCode != 200) return false;

      final data = jsonDecode(response.body);
      _latestVersion = AppVersion.fromJson(data);

      // Check if user dismissed this version
      final dismissedVersion = prefs.getString(_lastDismissedKey);
      if (dismissedVersion == _latestVersion!.version) {
        _dismissed = true;
        return false;
      }

      return _latestVersion!.version != currentAppVersion;
    } catch (e) {
      debugPrint('Silent update check failed: $e');
      return false;
    }
  }

  String get currentAppVersion => '1.0.5';

  /// Show update notification (non-intrusive snackbar)
  void showUpdateNotificationIfAvailable(BuildContext context) {
    if (_latestVersion == null || _dismissed) return;
    if (!mounted(context)) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('New version ${_latestVersion!.version} available'),
        duration: const Duration(seconds: 5),
        action: SnackBarAction(
          label: 'Update',
          onPressed: () => _promptUpdate(context),
        ),
      ),
    );
  }

  bool mounted(BuildContext context) {
    try {
      return context.findRenderObject() != null;
    } catch (_) {
      return false;
    }
  }

  Future<void> _promptUpdate(BuildContext context, {bool force = false}) async {
    final confirmed = await showDialog<bool>(
      context: context,
      barrierDismissible: !force,
      builder: (ctx) => AlertDialog(
        title: Text(force ? 'Update Required' : 'Update Available'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Version ${_latestVersion!.version} is available.'),
            if (_latestVersion!.releaseNotes.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                _latestVersion!.releaseNotes,
                style: Theme.of(ctx).textTheme.bodySmall,
              ),
            ],
          ],
        ),
        actions: [
          if (!force)
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Later'),
            ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Update Now'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await _downloadAndInstall(context);
    } else {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_lastDismissedKey, _latestVersion!.version);
      _dismissed = true;
    }
  }

  Future<void> _downloadAndInstall(BuildContext context) async {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => const AlertDialog(
        content: Row(
          children: [
            CircularProgressIndicator(),
            SizedBox(width: 16),
            Text('Downloading update...'),
          ],
        ),
      ),
    );

    try {
      final downloadUrl = _latestVersion!.downloadUrl;
      final response = await http.get(Uri.parse(downloadUrl)).timeout(
        const Duration(minutes: 5),
      );

      if (response.statusCode != 200) {
        if (context.mounted) Navigator.pop(context);
        if (context.mounted) _showError(context, 'Download failed');
        return;
      }

      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/vitharn_update.apk');
      await file.writeAsBytes(response.bodyBytes);

      if (context.mounted) Navigator.pop(context);
      if (context.mounted) _showInstallInstructions(context, file.path);
    } catch (e) {
      if (context.mounted) Navigator.pop(context);
      if (context.mounted) _showError(context, 'Download failed: $e');
    }
  }

  void _showError(BuildContext context, String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red),
    );
  }

  void _showInstallInstructions(BuildContext context, String filePath) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Update Downloaded'),
        content: const Text(
          'The update has been downloaded. Please:\n\n'
          '1. Close this app\n'
          '2. Open the downloaded file\n'
          '3. Allow installation from unknown sources\n'
          '4. Install the update',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }
}

class AppVersion {
  final String version;
  final String downloadUrl;
  final String releaseNotes;
  final bool forceUpdate;

  AppVersion({
    required this.version,
    required this.downloadUrl,
    required this.releaseNotes,
    required this.forceUpdate,
  });

  factory AppVersion.fromJson(Map<String, dynamic> json) {
    return AppVersion(
      version: json['version'] ?? '1.0.0',
      downloadUrl: json['downloadUrl'] ?? '',
      releaseNotes: json['releaseNotes'] ?? '',
      forceUpdate: json['forceUpdate'] ?? false,
    );
  }
}
