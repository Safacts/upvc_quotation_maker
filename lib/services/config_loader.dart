import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/client_config.dart';
import 'white_label_service.dart';

/// Dynamic config loader — fetches branding + content from
/// `GET /api/config/<clientId>` so logo, colours, company name and terms can
/// change WITHOUT rebuilding or reshipping the APK.
///
/// Relationship to the other config sources (read this before adding a fourth):
/// * [ClientLoader] (`lib/config/client_loader.dart`) resolves the *initial*
///   config at cold start from `/config.json` → Supabase `client_public`.
/// * [WhiteLabelService] streams *live* branding from the Supabase
///   `client_config_dynamic` table (realtime push).
/// * **This** service is the HTTP path: the `/api/config/<clientId>` endpoint,
///   which is what the web console writes to and what works when the Supabase
///   client is unavailable. It is deliberately additive — it never replaces the
///   base config, it *overlays* it.
///
/// Design guarantees (all learned the hard way on this codebase):
/// * **Never blanks a brand.** A 404, a timeout, an offline device or a partial
///   server payload always keeps the previous good values. Only keys actually
///   present in the response are applied. This matters because
///   `/api/config/[clientId]` currently only has `venkateshwara` hardcoded and
///   **404s for kprupvc and akshaya upvc** — those clients MUST be unaffected.
/// * **Multi-tenant safe.** Every cache entry is keyed by `client_id`. One
///   Flutter Web deployment serves every tenant, so an unkeyed cache would show
///   client A's logo and company name to client B.
/// * **Offline-first.** The cached config is applied *before* the network call,
///   so a cold start with no connectivity paints the correct brand immediately
///   with no flash of default branding.
/// * **Never throws, never hangs.** Every path is wrapped and every network
///   call is bounded by [networkTimeout]. `main.dart` awaits config work before
///   `runApp`, so an unbounded call here would be an infinite splash screen.
/// * **Credentials are never taken from the network.** See [_protectedKeys].
class ConfigLoader {
  ConfigLoader._();
  static final ConfigLoader instance = ConfigLoader._();

  /// Hard ceiling on the config request. Startup blocks on this.
  static const Duration networkTimeout = Duration(seconds: 8);

  /// Origin used on mobile/desktop, where there is no `Uri.base` to inherit.
  static const String apiOrigin = 'https://app.vitharn.com';

  /// Cache namespace. Bump the version to invalidate an old cache *shape*
  /// rather than risk mis-parsing it into a broken brand.
  static const String _prefsPrefix = 'dynamic_config_v1';

  /// Keys that a network response is NEVER allowed to set.
  ///
  /// `supabaseUrl`/`supabaseAnonKey` would let a misconfigured or compromised
  /// endpoint repoint the entire app at a different database — every tenant's
  /// data would be read from, and written to, an attacker-chosen project.
  /// `portalPasswordHash` is credential material that must only ever come from
  /// the authenticated config path, and `clientId` is the cache key itself:
  /// letting the payload rename it would poison another tenant's cache entry.
  static const Set<String> _protectedKeys = {
    'clientId',
    'supabaseUrl',
    'supabaseAnonKey',
    'portalPasswordHash',
  };

  /// Colour fields need normalising before [ClientConfig.fromJson] sees them.
  ///
  /// The live endpoint returns `primaryColor: 6513505` (= `0x636361`), an int
  /// with **no alpha channel**. `ClientConfig.fromJson` does a bare
  /// `Color(int)`, which yields a fully TRANSPARENT colour — an invisible
  /// theme. [WhiteLabelService.parseColor] force-opaques bare RGB and also
  /// accepts `#RRGGBB`, `#RGB`, `0xAARRGGBB` and `rgb()/rgba()` strings, so the
  /// console can send whichever format it likes.
  static const Set<String> _colorKeys = {'primaryColor', 'accentColor'};

  String _clientId = '';
  String get clientId => _clientId;

  ClientConfig? _config;

  /// The most recent effective config, or `null` before the first [load].
  ClientConfig? get config => _config;

  /// True when the values currently held came from the network this session
  /// (as opposed to disk). Useful for a "showing offline data" indicator.
  bool _isFresh = false;
  bool get isFresh => _isFresh;

  DateTime? _lastFetchedAt;
  DateTime? get lastFetchedAt => _lastFetchedAt;

  final _controller = StreamController<ClientConfig>.broadcast();

  /// Emits whenever the effective config changes (cache hit, then refresh).
  Stream<ClientConfig> get configStream => _controller.stream;

  // ---------------------------------------------------------------------------
  // Cache keys — ALWAYS scoped by client id
  // ---------------------------------------------------------------------------

  String _configKey(String clientId) => '$_prefsPrefix.config.$clientId';
  String _stampKey(String clientId) => '$_prefsPrefix.stamp.$clientId';

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /// Resolve the effective config for [base].
  ///
  /// Returns immediately-usable values in every scenario:
  /// 1. cached overlay applied to [base] (instant, works offline),
  /// 2. then the network overlay if the fetch succeeds.
  ///
  /// The returned future completes with the best config available. Listen to
  /// [configStream] to react to the later network refresh.
  ///
  /// Pass `refresh: false` to skip the network entirely (cache-only read).
  Future<ClientConfig> load(ClientConfig base, {bool refresh = true}) async {
    final id = base.clientId.trim();
    if (id.isEmpty) {
      debugPrint('ConfigLoader: empty clientId — returning base config');
      return base;
    }

    // A tenant switch must not inherit the previous tenant's overlay.
    if (_clientId.isNotEmpty && _clientId != id) {
      _config = null;
      _isFresh = false;
      _lastFetchedAt = null;
    }
    _clientId = id;

    // 1. Paint from cache first — no flash of default branding offline.
    var effective = await _applyCached(base, id);

    if (!refresh) return effective;

    // 2. Refresh from the server. Failure keeps the cached values.
    final remote = await _fetchRemote(id);
    if (remote != null && remote.isNotEmpty) {
      effective = _merge(base: effective, remote: remote);
      _config = effective;
      _isFresh = true;
      _lastFetchedAt = DateTime.now();
      await _cache(id, remote);
      _emit(effective);
      debugPrint(
        'ConfigLoader: applied remote config [$id] '
        '(${remote.length} keys, company="${effective.companyName}")',
      );
    }

    return effective;
  }

  /// Re-fetch for the current tenant, e.g. pull-to-refresh or after the owner
  /// edits branding in the console. Returns the new effective config, or the
  /// existing one if the refresh failed.
  Future<ClientConfig?> refresh(ClientConfig base) {
    if (_clientId.isEmpty) return Future.value(_config);
    return load(base);
  }

  // ---------------------------------------------------------------------------
  // Branding accessors — always safe to call from build()
  // ---------------------------------------------------------------------------

  /// Primary brand colour, guaranteed opaque. Falls back to the bundled value.
  Color primaryColor(ClientConfig fallback) =>
      _config?.primaryColor ?? fallback.primaryColor;

  /// Accent brand colour, guaranteed opaque.
  Color accentColor(ClientConfig fallback) =>
      _config?.accentColor ?? fallback.accentColor;

  /// Company name for headers, PDFs and emails.
  String companyName(ClientConfig fallback) {
    final v = _config?.companyName ?? '';
    return v.isNotEmpty ? v : fallback.companyName;
  }

  /// Logo URL. Empty means "use the bundled asset" — callers must handle that
  /// rather than passing an empty string to [NetworkImage].
  String logoUrl(ClientConfig fallback) {
    final v = _config?.logoUrl ?? '';
    return v.isNotEmpty ? v : fallback.logoUrl;
  }

  // ---------------------------------------------------------------------------
  // Network
  // ---------------------------------------------------------------------------

  /// Endpoint for [clientId]. Relative on web so it inherits the current origin
  /// (localhost during `npm run dev:all`, app.vitharn.com in production) and
  /// avoids a cross-origin preflight.
  Uri endpointFor(String clientId) {
    final path = '/api/config/${Uri.encodeComponent(clientId)}';
    if (kIsWeb) return Uri.parse('${Uri.base.origin}$path');
    return Uri.parse('$apiOrigin$path');
  }

  /// GET the config. Returns `null` on ANY failure — 404, timeout, offline,
  /// malformed JSON — which the caller treats as "keep what we have".
  Future<Map<String, dynamic>?> _fetchRemote(String clientId) async {
    try {
      final res = await http
          .get(endpointFor(clientId), headers: const {'Accept': 'application/json'})
          .timeout(networkTimeout);

      if (res.statusCode == 404) {
        // Expected for tenants not yet added to the endpoint. NOT an error and
        // NOT a reason to discard good cached branding.
        debugPrint('ConfigLoader: no server config for $clientId (404)');
        return null;
      }

      if (res.statusCode != 200) {
        debugPrint('ConfigLoader: HTTP ${res.statusCode} for $clientId');
        return null;
      }

      final decoded = jsonDecode(res.body);
      if (decoded is! Map) {
        debugPrint('ConfigLoader: unexpected payload shape for $clientId');
        return null;
      }

      final map = decoded.cast<String, dynamic>();

      // The endpoint reports "not found" with a 200 in some deploys.
      if (map.containsKey('error')) {
        debugPrint('ConfigLoader: server error for $clientId: ${map['error']}');
        return null;
      }

      // Defence in depth: a payload for a DIFFERENT tenant must never be
      // applied, or one client sees another's branding and bank details.
      final payloadId = (map['clientId'] as String?)?.trim();
      if (payloadId != null && payloadId.isNotEmpty && payloadId != clientId) {
        debugPrint(
          'ConfigLoader: payload clientId "$payloadId" != requested '
          '"$clientId" — discarded',
        );
        return null;
      }

      return map;
    } on TimeoutException {
      debugPrint('ConfigLoader: fetch timed out — using cached config');
      return null;
    } catch (e) {
      debugPrint('ConfigLoader: fetch failed: $e — using cached config');
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Cache
  // ---------------------------------------------------------------------------

  /// Read the cached overlay and apply it to [base].
  Future<ClientConfig> _applyCached(ClientConfig base, String clientId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_configKey(clientId));
      if (raw == null || raw.isEmpty) {
        _config = base;
        return base;
      }

      final decoded = jsonDecode(raw);
      if (decoded is! Map) {
        _config = base;
        return base;
      }

      final effective = _merge(base: base, remote: decoded.cast<String, dynamic>());
      _config = effective;
      _isFresh = false;

      final stamp = prefs.getString(_stampKey(clientId));
      _lastFetchedAt = stamp == null ? null : DateTime.tryParse(stamp);

      _emit(effective);
      return effective;
    } catch (e) {
      debugPrint('ConfigLoader: cache read failed: $e');
      _config = base;
      return base;
    }
  }

  /// Persist the raw remote overlay (not the merged result) so a future build
  /// with different bundled defaults still layers correctly.
  Future<void> _cache(String clientId, Map<String, dynamic> remote) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_configKey(clientId), jsonEncode(remote));
      await prefs.setString(
        _stampKey(clientId),
        DateTime.now().toIso8601String(),
      );
    } catch (e) {
      // A cache write failure must not fail the load.
      debugPrint('ConfigLoader: cache write failed: $e');
    }
  }

  /// Drop the cached overlay for a tenant. Call on logout / tenant switch so
  /// one client's branding can never bleed into another's session.
  Future<void> clearCacheFor(String clientId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_configKey(clientId));
      await prefs.remove(_stampKey(clientId));
    } catch (e) {
      debugPrint('ConfigLoader: clear cache failed: $e');
    }
    if (_clientId == clientId) {
      _config = null;
      _isFresh = false;
      _lastFetchedAt = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Merge
  // ---------------------------------------------------------------------------

  /// Overlay [remote] onto [base]. Only keys that are genuinely present and
  /// non-empty win, so a partial payload can never blank an existing field.
  ///
  /// Exposed for testing — the merge rules are where a branding regression
  /// would hide.
  @visibleForTesting
  ClientConfig mergeForTest(ClientConfig base, Map<String, dynamic> remote) =>
      _merge(base: base, remote: remote);

  ClientConfig _merge({
    required ClientConfig base,
    required Map<String, dynamic> remote,
  }) {
    try {
      final merged = Map<String, dynamic>.from(base.toJson());

      remote.forEach((key, value) {
        if (_protectedKeys.contains(key)) return;
        if (!_isMeaningful(value)) return;

        if (_colorKeys.contains(key)) {
          // Normalise to an opaque ARGB int; a bad colour keeps the base value.
          merged[key] = WhiteLabelService.parseColor(
            value,
            (merged[key] as int?) ?? 0xFF6366F1,
          );
          return;
        }

        merged[key] = value;
      });

      // The cache key and the credentials are always the local truth.
      merged['clientId'] = base.clientId;
      merged['supabaseUrl'] = base.supabaseUrl;
      merged['supabaseAnonKey'] = base.supabaseAnonKey;
      merged['portalPasswordHash'] = base.portalPasswordHash;

      return ClientConfig.fromJson(merged);
    } catch (e) {
      // A malformed payload must never take the brand down.
      debugPrint('ConfigLoader: merge failed: $e — keeping base config');
      return base;
    }
  }

  /// A value only overrides the base when it actually carries information.
  ///
  /// `null`, `""`, `"   "` and `[]` are treated as "not supplied" — the server
  /// omitting a field, or the console saving an empty text box, must not erase
  /// a working logo, company name or terms list. `false` and `0` ARE
  /// meaningful (e.g. `isActive: false` is a deliberate kill switch).
  static bool _isMeaningful(dynamic value) {
    if (value == null) return false;
    if (value is String) return value.trim().isNotEmpty;
    if (value is Iterable) return value.isNotEmpty;
    if (value is Map) return value.isNotEmpty;
    return true;
  }

  void _emit(ClientConfig cfg) {
    if (_controller.isClosed) return;
    _controller.add(cfg);
  }

  /// Reset in-memory state. The broadcast stream is deliberately NOT closed —
  /// closing it permanently would throw `StateError` on re-login or hot
  /// restart, which is exactly when this gets called.
  void dispose() {
    _clientId = '';
    _config = null;
    _isFresh = false;
    _lastFetchedAt = null;
  }
}
