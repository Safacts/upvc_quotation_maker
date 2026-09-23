import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// location_consent_sheet.dart -- ADDITIVE ONLY.
///
/// Foreground check-in consent (DPDP-safe). No background tracking.
/// Persisted key: location_consent_v1 (per install, tenant-agnostic wording).
class LocationConsentSheet extends StatelessWidget {
  const LocationConsentSheet({super.key});

  static const String prefKey = 'location_consent_v1';

  static Future<bool> isGranted() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getBool(prefKey) ?? false;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> ensure(BuildContext context) async {
    if (await isGranted()) return true;
    if (!context.mounted) return false;
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const LocationConsentSheet(),
    );
    return ok ?? false;
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Share visit location once?',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 10),
            const Text(
              'Tapping Check-in saves ONE GPS point (latitude, longitude, '
              'accuracy and time) with this visit. The app never tracks you '
              'in the background. Data is kept for 30 days for visit proof.',
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Not now'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () async {
                      try {
                        final prefs = await SharedPreferences.getInstance();
                        await prefs.setBool(prefKey, true);
                      } catch (_) {}
                      if (context.mounted) Navigator.pop(context, true);
                    },
                    child: const Text('Allow once per visit'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
