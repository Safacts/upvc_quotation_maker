import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';

class UpdateChecker {
  static const String _versionUrl = 'https://upvcquotationmaker.vercel.app/version.json';

  static Future<void> checkForUpdate(BuildContext context) async {
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final response = await http.get(Uri.parse(_versionUrl));
      
      if (response.statusCode != 200) return;

      final allVersions = jsonDecode(response.body) as Map<String, dynamic>;
      final clientData = allVersions[clientId] as Map<String, dynamic>? ?? allVersions['default'] as Map<String, dynamic>?;
      if (clientData == null) return;

      final latestVersion = clientData['latestVersion'] as String?;
      final apkUrl = clientData['apkUrl'] as String?;
      final updateMessage = clientData['message'] as String? ?? 'A new version is available. Please update to continue getting the latest features and fixes.';

      if (latestVersion == null || apkUrl == null) return;

      // Compare versions (simple string comparison - assumes semver)
      final currentVersion = '1.0.0'; // In production, use package_info_plus
      if (latestVersion.compareTo(currentVersion) <= 0) return;

      if (!context.mounted) return;

      await showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => AlertDialog(
          title: Row(
            children: [
              const Icon(Icons.system_update, color: Colors.blue),
              const SizedBox(width: 12),
              const Text('Update Available'),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Version $latestVersion is now available.'),
              const SizedBox(height: 12),
              Text(updateMessage, style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Later'),
            ),
            ElevatedButton.icon(
              onPressed: () async {
                Navigator.pop(context);
                try {
                  final uri = Uri.parse(apkUrl);
                  if (await canLaunchUrl(uri)) {
                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                  }
                } catch (_) {}
              },
              icon: const Icon(Icons.download, size: 18),
              label: const Text('Update Now'),
            ),
          ],
        ),
      );
    } catch (e) {
      debugPrint('Update check failed: $e');
    }
  }
}
