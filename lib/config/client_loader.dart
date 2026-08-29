import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'client_config.dart';
import '../supabase_config.dart';
import '../utils/jwt_verifier.dart';
import '../utils/http_client.dart';

import 'client_loader_html_stub.dart'
    if (dart.library.html) 'client_loader_html_web.dart' as loader_html;

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

  static bool _matchesClient(Map<String, dynamic> r, String target) {
    final rid = _slugify((r['id'] as String?) ?? '');
    final cfg = (r['config'] as Map?) ?? {};
    final appName = _slugify(cfg['appName'] as String? ?? '');
    final companyName = _slugify(cfg['companyName'] as String? ?? '');

    if (rid == target || appName == target || companyName == target) return true;
    if (target == '$rid-quote' || target == '$rid-upvc-quote' || target == '$rid-quotation') return true;
    if (appName.isNotEmpty && (target == '$appName-quote' || target == '$appName-upvc-quote')) return true;
    if (rid.isNotEmpty && (target.startsWith('$rid-') || rid.startsWith('$target-'))) return true;
    if (appName.isNotEmpty && (target.startsWith('$appName-') || appName.startsWith('$target-'))) return true;
    if (companyName.isNotEmpty && (target.startsWith('$companyName-') || companyName.startsWith('$target-'))) return true;
    return false;
  }

  static const _configCachePrefix = 'cached_client_config_v1_';

  static Future<void> _saveCachedConfig(String clientId, ClientConfig config) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('$_configCachePrefix$clientId', jsonEncode(config.toJson()));
    } catch (_) {}
  }

  static Future<ClientConfig?> getCachedConfig(String clientId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('$_configCachePrefix$clientId');
      if (raw != null && raw.isNotEmpty) {
        final decoded = jsonDecode(raw);
        if (decoded is Map<String, dynamic>) {
          return ClientConfig.fromJson(decoded);
        } else if (decoded is Map) {
          return ClientConfig.fromJson(Map<String, dynamic>.from(decoded));
        }
      }
    } catch (_) {}
    return null;
  }

  static Future<ClientConfig> loadConfig({String? clientId}) async {
    final rawId = (clientId ?? getClientId() ?? 'venkateshwara').trim();
    final cached = await getCachedConfig(rawId);

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
            if (config != null) {
              await _saveCachedConfig(config.clientId, config);
              return config;
            }
          }
        }
      } catch (e) {
        debugPrint('SSO token processing error: $e');
      }
    }

    // Try to fetch from static config JSON on Vercel (exact id match)
    try {
      final configUrl = const String.fromEnvironment('CONFIG_URL', defaultValue: '/config.json');
      final response = await http.get(Uri.parse(configUrl)).timeout(const Duration(seconds: 4));
      if (response.statusCode == 200) {
        final allConfigs = jsonDecode(response.body) as Map<String, dynamic>;
        final clientJson = allConfigs[rawId] as Map<String, dynamic>?;
        if (clientJson != null) {
          final config = ClientConfig.fromJson(clientJson);
          await _saveCachedConfig(config.clientId, config);
          return config;
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
          .maybeSingle()
          .timeout(const Duration(seconds: 4));

      // If the URL used a slug (e.g. /upvc/<app name>), resolve it to the real id
      if (row == null || row['config'] == null) {
        final all = await supabase.from('client_public').select().timeout(const Duration(seconds: 4));
        final target = _slugify(rawId);
        for (final r in all) {
          if (_matchesClient(r, target)) {
            row = r;
            break;
          }
        }
      }

      if (row != null && row['config'] != null) {
        final config = _configFromRow(row, (row['id'] as String?) ?? rawId);
        await _saveCachedConfig(config.clientId, config);
        return config;
      }
    } catch (_) {}

    // When offline or fetch fails, return previously cached config instead of an empty skeleton
    if (cached != null) {
      return cached;
    }

    return ClientConfig(clientId: rawId);
  }

  /// Load private tenant settings only after the server has validated the
  /// HttpOnly portal session. Anonymous callers receive 401 and fall back to
  /// the redacted public config.
  static Future<ClientConfig?> loadAuthenticatedConfig(String clientId) async {
    if (!kIsWeb || clientId.trim().isEmpty) return null;
    try {
      final response = await getWithCredentials(
        Uri.parse('/api/portal_settings'),
        headers: const {'Accept': 'application/json'},
      ).timeout(const Duration(seconds: 5));
      if (response.statusCode != 200) return null;
      final decoded = jsonDecode(response.body);
      if (decoded is! Map) return null;
      final configMap = Map<String, dynamic>.from(decoded);
      if ((configMap['clientId'] as String?)?.trim() != clientId.trim()) {
        return null;
      }
      final config = ClientConfig.fromJson(configMap);
      await _saveCachedConfig(config.clientId, config);
      return config;
    } catch (_) {
      return null;
    }
  }

  static String? _getFragmentSsoToken() {
    if (!kIsWeb) return null;
    return loader_html.readSsoFragmentToken();
  }

  static void _clearFragment() {
    if (!kIsWeb) return;
    loader_html.clearUrlFragment();
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
