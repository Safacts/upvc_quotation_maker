import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'client_config.dart';
import '../supabase_config.dart';

class ClientLoader {
  static String _slugify(String s) {
    final t = (s ?? '').trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-');
    return t.replaceAll(RegExp(r'^-+|-+$'), '');
  }

  static String? getClientId() {
    // On web, URL params/path take priority over compile-time CLIENT_ID
    if (kIsWeb) {
      try {
        final uri = Uri.base;
        final clientParam = uri.queryParameters['client'];
        if (clientParam != null && clientParam.isNotEmpty) return clientParam;
        final path = uri.pathSegments;
        if (path.isNotEmpty) {
          final last = path.last;
          const reserved = ['admin', 'client', 'api', 'app', 'upvc', 'jVenkateshwaraUPVC', 'flutter', 'icons', 'version', 'assets'];
          if (last.isNotEmpty && !reserved.contains(last) && !last.startsWith('flutter') && !last.startsWith('icons')) {
            return last;
          }
        }
      } catch (_) {}
    }

    // Try dart-define (for APK builds)
    const fromDefine = String.fromEnvironment('CLIENT_ID', defaultValue: '');
    if (fromDefine.isNotEmpty) return fromDefine;

    return 'venkateshwara';
  }

  static ClientConfig _configFromRow(Map<String, dynamic> row, String id) {
    final cfg = Map<String, dynamic>.from(row['config'] as Map? ?? const {});
    if (row['trial_expires_at'] != null) {
      cfg['trialExpiresAt'] = row['trial_expires_at'];
    }
    cfg['isActive'] = row['is_active'] ?? true;
    cfg['clientId'] = id;
    return ClientConfig.fromJson(cfg);
  }

  static Future<ClientConfig> loadConfig({String? clientId}) async {
    final rawId = (clientId ?? getClientId() ?? 'venkateshwara').trim();

    // Try to fetch from static config JSON on Vercel (exact id match)
    try {
      final configUrl = const String.fromEnvironment('CONFIG_URL', defaultValue: '/config.json');
      final response = await http.get(Uri.parse(configUrl));
      if (response.statusCode == 200) {
        final allConfigs = jsonDecode(response.body) as Map<String, dynamic>;
        final clientJson = allConfigs[rawId] as Map<String, dynamic>?;
        if (clientJson != null) {
          return ClientConfig.fromJson(clientJson);
        }
      }
    } catch (_) {}

    // Fallback: fetch from Supabase client_public view (config without any password material)
    try {
      final supabase = SupabaseConfig.client;
      var row = await supabase
          .from('client_public')
          .select()
          .eq('id', rawId)
          .maybeSingle();

      // If the URL used a slug (e.g. /upvc/<app name>), resolve it to the real id
      if (row == null || row['config'] == null) {
        final all = await supabase.from('client_public').select();
        for (final r in all) {
          final rid = (r['id'] as String?) ?? '';
          final appName = ((r['config'] as Map?) ?? {})['appName'] as String? ?? '';
          if (_slugify(rid) == rawId || _slugify(appName) == rawId) {
            row = r;
            break;
          }
        }
      }

      if (row != null && row['config'] != null) {
        return _configFromRow(row, (row['id'] as String?) ?? rawId);
      }
    } catch (_) {}

    return ClientConfig(clientId: rawId);
  }
}
