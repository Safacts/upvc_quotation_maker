import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// fabricator_map_service.dart -- ADDITIVE ONLY (field APK only).
///
/// A supplier executive serves MULTIPLE fabricators (e.g. KPR today, others
/// tomorrow). Each fabricator is a separate tenant with its own locked rates,
/// so a quote must always be filed under exactly one `client_id`.
///
/// This service stores the executive's mapped fabricator list LOCALLY
/// (SharedPreferences `field_mapped_fabricators`). Switching tenants reuses
/// the proven login flow pattern: load config -> set `x-client-id` header ->
/// applyClientConfig -> persist `session_client_id`. No existing file is
/// touched; only `fabricator_switch_screen.dart` and `field_home_screen.dart`
/// (both field-only) consume this.
class FabricatorMapService {
  FabricatorMapService._();
  static final FabricatorMapService instance = FabricatorMapService._();

  static const String _kMappedKey = 'field_mapped_fabricators';

  Future<List<String>> mapped() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getStringList(_kMappedKey) ?? [];
      final clean = raw
          .map((e) => e.trim())
          .where((e) => e.isNotEmpty)
          .toSet()
          .toList()
        ..sort();
      return clean;
    } catch (_) {
      return [];
    }
  }

  Future<void> add(String clientId) async {
    final id = clientId.trim();
    if (id.isEmpty) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final cur = await mapped();
      if (!cur.any((e) => e.toLowerCase() == id.toLowerCase())) {
        cur.add(id);
        await prefs.setStringList(_kMappedKey, cur);
      }
    } catch (e) {
      debugPrint('[FabricatorMap] add failed: $e');
    }
  }

  Future<void> remove(String clientId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final cur = await mapped();
      cur.removeWhere(
          (e) => e.toLowerCase() == clientId.trim().toLowerCase());
      await prefs.setStringList(_kMappedKey, cur);
    } catch (e) {
      debugPrint('[FabricatorMap] remove failed: $e');
    }
  }
}
