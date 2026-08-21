import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'client_config.dart';
import '../supabase_config.dart';
import '../utils/jwt_verifier.dart';

import 'dart:html' as html;

class ClientLoader {
  static String _slugify(String s) {
    final t = s.trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-');
    return t.replaceAll(RegExp(r'^-+|-+$'), '');
  }

  /// Returns the tenant explicitly requested by the browser URL, if any.
  ///
  /// This must remain separate from [getClientId], which has a safe default
  /// for generic `/app` launches. A stale session tenant must never override
  /// an explicit `/upvc/<client>` URL.
  static String? getUrlClientId() {
    if (!kIsWeb) return null;
    try {
      final uri = Uri.base;
      final clientParam = uri.queryParameters['client'];
      if (clientParam != null && clientParam.trim().isNotEmpty) {
        return clientParam.trim();
      }
      final path = uri.pathSegments;
      if (path.isNotEmpty) {
        final last = path.last;
        const reserved = ['admin', 'client', 'api', 'app', 'upvc', 'jVenkateshwaraUPVC', 'flutter', 'icons', 'version', 'assets'];
        if (last.isNotEmpty && !reserved.contains(last) && !last.startsWith('flutter') && !last.startsWith('icons')) {
          return last;
        }
      }
    } catch (_) {}
    return null;
  }

  static String? getClientId() {
    // On web, URL params/path take priority over compile-time CLIENT_ID
    if (kIsWeb) {
      try {
        final urlClientId = getUrlClientId();
        if (urlClientId != null) return urlClientId;
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

    // Check for SSO token in URL FRAGMENT (passed from web dashboard)
    if (kIsWeb) {
      try {
        final ssoToken = _getFragmentSsoToken();
        if (ssoToken != null && ssoToken.isNotEmpty) {
          // Validate SSO token locally (no RPC call)
          final validatedClientId = JwtVerifier.verifySsoToken(ssoToken)?['client_id'] as String?;
          if (validatedClientId != null) {
            // Clear fragment immediately after consumption
            _clearFragment();
            
            // Check for tenant switch
            final currentClientId = await _getCurrentSessionClientId();
            if (currentClientId != null && currentClientId != validatedClientId) {
              // Signal to caller that tenant switch is needed
            return ClientConfig.ssoPending(
                clientId: validatedClientId, 
                currentClientId: currentClientId
              );
            }
            
            final config = await _loadConfigForClient(validatedClientId);
            if (config != null) return config;
          }
        }
      } catch (e) {
        debugPrint('SSO token processing error: $e');
      }
    }

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
          final cfg = (r['config'] as Map?) ?? {};
          final appName = cfg['appName'] as String? ?? '';
          final companyName = cfg['companyName'] as String? ?? '';
          final target = _slugify(rawId);
          if (_slugify(rid) == target || _slugify(appName) == target || _slugify(companyName) == target) {
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

  static String? _getFragmentSsoToken() {
    if (!kIsWeb) return null;
    try {
      final fragment = html.window.location.hash; // e.g., "#sso_token=xyz"
      if (fragment.startsWith('#sso_token=')) {
        return fragment.substring('#sso_token='.length);
      }
    } catch (_) {}
    return null;
  }

  static void _clearFragment() {
    if (!kIsWeb) return;
    try {
      // Remove fragment without triggering navigation
      html.window.history.replaceState(null, '', '${html.window.location.pathname}${html.window.location.search ?? ''}');
    } catch (_) {}
  }

  static Future<String?> _getCurrentSessionClientId() async {
    if (!kIsWeb) return null;
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString('session_client_id');
    } catch (_) {
      return null;
    }
  }

  static Future<ClientConfig?> _loadConfigForClient(String clientId) async {
    // Try static config.json
    try {
      final configUrl = const String.fromEnvironment('CONFIG_URL', defaultValue: '/config.json');
      final response = await http.get(Uri.parse(configUrl));
      if (response.statusCode == 200) {
        final allConfigs = jsonDecode(response.body) as Map<String, dynamic>;
        final clientJson = allConfigs[clientId] as Map<String, dynamic>?;
        if (clientJson != null) return ClientConfig.fromJson(clientJson);
      }
    } catch (_) {}

    // Fallback: Supabase client_public
    try {
      final supabase = SupabaseConfig.client;
      var row = await supabase
          .from('client_public')
          .select()
          .eq('id', clientId)
          .maybeSingle();

      if (row == null || row['config'] == null) {
        final all = await supabase.from('client_public').select();
        for (final r in all) {
          final rid = (r['id'] as String?) ?? '';
          final cfg = (r['config'] as Map?) ?? {};
          final appName = cfg['appName'] as String? ?? '';
          final companyName = cfg['companyName'] as String? ?? '';
          final target = _slugify(clientId);
          if (_slugify(rid) == target || _slugify(appName) == target || _slugify(companyName) == target) {
            row = r;
            break;
          }
        }
      }

      if (row != null && row['config'] != null) {
        return _configFromRow(row, (row['id'] as String?) ?? clientId);
      }
    } catch (_) {}

    return null;
  }
}
