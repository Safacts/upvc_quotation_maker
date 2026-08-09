import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../supabase_config.dart';
import '../config/client_config.dart';
import '../models_sync.dart';
import 'offline_database.dart';

/// Dynamic white-labeling service.
///
/// Fetches branding configuration (logo, colors, company name, etc.) from the
/// server and applies it at runtime so a NEW CLIENT CAN BE ONBOARDED WITHOUT
/// REBUILDING THE APK.
///
/// Design guarantees:
/// * **Multi-tenant safe** — every cache entry is keyed by `client_id`. The
///   Flutter Web build serves many tenants from one deployment, so an unkeyed
///   cache would show client A's logo to client B.
/// * **Offline-first** — branding is mirrored into SharedPreferences (web-safe)
///   so a cold start with no network still paints the correct brand, with no
///   flash of default branding.
/// * **Never blocks startup** — every network call is bounded by a timeout and
///   every path is defensively wrapped. `main.dart` awaits [initialize] before
///   `runApp`, so a hung request here would be an infinite splash screen.
/// * **Never crashes on bad data** — malformed colours fall back to the Vitharn
///   defaults instead of throwing or rendering an unreadable UI.
class WhiteLabelService {
  WhiteLabelService._();
  static final WhiteLabelService instance = WhiteLabelService._();

  /// Hard ceiling on any network call made during startup.
  static const Duration networkTimeout = Duration(seconds: 8);

  /// Vitharn defaults (orange / dark monochrome theme). Used whenever the
  /// server value is absent or unparseable.
  static const int defaultPrimaryColor = 0xFF6366F1;
  static const int defaultAccentColor = 0xFFEC4899;

  /// Bundled asset used when the remote logo 404s or the device is offline
  /// with a cold cache.
  static const String fallbackLogoAsset = 'assets/icon_source.png';

  /// SharedPreferences key namespace. Bumping the version invalidates old
  /// cache shapes rather than mis-parsing them.
  static const String _prefsPrefix = 'white_label_v1';

  final OfflineDatabase _db = OfflineDatabase.instance;

  /// The client this service is currently bound to. All reads/writes are
  /// scoped to it; a tenant switch must go through [initialize] again.
  String _clientId = '';
  String get clientId => _clientId;

  WhiteLabelConfig _config = WhiteLabelConfig();
  WhiteLabelConfig get config => _config;

  /// Cached logo bytes, so the logo is not re-downloaded every launch
  /// (Vercel bandwidth) and is available offline for PDF generation.
  Uint8List? _logoBytes;
  Uint8List? get logoBytes => _logoBytes;

  final _configController = StreamController<WhiteLabelConfig>.broadcast();
  Stream<WhiteLabelConfig> get configStream => _configController.stream;

  RealtimeChannel? _channel;

  /// Topic of the currently subscribed channel. `unsubscribe()` alone leaves
  /// the topic registered in the Supabase client's channel map, so re-init
  /// would attach a SECOND listener and fire every callback twice. We track
  /// the topic and call `removeChannel()` to fully detach.
  String? _subscribedTopic;

  bool _initialized = false;

  // ---------------------------------------------------------------------------
  // Cache keys — ALWAYS scoped by client_id (P0 multi-tenant requirement)
  // ---------------------------------------------------------------------------

  String _configKey(String clientId) => '$_prefsPrefix.config.$clientId';
  String _logoKey(String clientId) => '$_prefsPrefix.logo.$clientId';
  String _logoSrcKey(String clientId) => '$_prefsPrefix.logo_src.$clientId';

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /// Initialize for [clientId]. Safe to call again on tenant switch.
  ///
  /// Never throws and never hangs: the cached config is applied first so the
  /// UI can paint immediately, then the server is consulted.
  Future<void> initialize(String clientId) async {
    if (clientId.isEmpty) {
      debugPrint('WhiteLabelService: empty clientId, skipping init');
      return;
    }

    // A tenant switch must not inherit the previous tenant's branding.
    if (_initialized && _clientId != clientId) {
      _config = WhiteLabelConfig();
      _logoBytes = null;
    }
    _clientId = clientId;

    try {
      // 1. Paint from cache first — no flash of default/competitor branding.
      await _loadCachedConfig(clientId);

      // 2. Then refresh from the server (bounded, failure-tolerant).
      await fetchConfig(clientId);

      // 3. Live updates without a restart.
      _subscribeToUpdates(clientId);

      _initialized = true;
      debugPrint(
        'WhiteLabelService ready [$clientId]: logo=${_config.logoUrl}, '
        'primary=${_config.primaryColor.toRadixString(16)}, '
        'accent=${_config.accentColor.toRadixString(16)}',
      );
    } catch (e) {
      // Branding must never be the reason the app fails to start.
      debugPrint('WhiteLabelService: initialize failed [$clientId]: $e');
    }
  }

  // ---------------------------------------------------------------------------
  // Cache (SharedPreferences — works on Web, unlike sqflite)
  // ---------------------------------------------------------------------------

  /// Load the last-known branding for [clientId] from disk.
  ///
  /// Reads SharedPreferences first (authoritative, web-safe) and falls back to
  /// the SQLite mirror for installs cached by an earlier build.
  Future<void> _loadCachedConfig(String clientId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_configKey(clientId));

      if (raw != null && raw.isNotEmpty) {
        final decoded = jsonDecode(raw);
        if (decoded is Map) {
          _config = _configFromMap(
            decoded.cast<String, dynamic>(),
            base: WhiteLabelConfig(),
          );
          await _loadCachedLogoBytes(clientId, prefs: prefs);
          _configController.add(_config);
          return;
        }
      }

      // Legacy path: SQLite mirror written by an older build.
      await _loadCachedConfigFromDb(clientId);
      await _loadCachedLogoBytes(clientId, prefs: prefs);
      if (_config.logoUrl.isNotEmpty || _config.companyName.isNotEmpty) {
        _configController.add(_config);
      }
    } catch (e) {
      debugPrint('WhiteLabelService: load cached config failed: $e');
    }
  }

  /// Legacy SQLite mirror read. Scoped by `client_id` — the OfflineDatabase
  /// config table is keyed on `(client_id, config_key)`.
  Future<void> _loadCachedConfigFromDb(String clientId) async {
    try {
      final all = await _db.getAllConfig(clientId: clientId);
      if (all.isEmpty) return;
      _config = _configFromMap(all, base: _config);
    } catch (e) {
      debugPrint('WhiteLabelService: sqlite cache read failed: $e');
    }
  }

  /// Persist branding for [clientId] to disk.
  Future<void> _cacheConfig(String clientId, WhiteLabelConfig cfg) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_configKey(clientId), jsonEncode(_configToMap(cfg)));
    } catch (e) {
      debugPrint('WhiteLabelService: prefs cache failed: $e');
    }

    // Best-effort mirror into SQLite so other offline consumers see it too.
    // OfflineDatabase is a no-op on Web and never throws.
    try {
      await _db.upsertConfigs(
        _configToMap(cfg).map((k, v) => MapEntry(k, v?.toString() ?? '')),
        clientId: clientId,
      );
    } catch (e) {
      debugPrint('WhiteLabelService: sqlite mirror failed: $e');
    }
  }

  Map<String, dynamic> _configToMap(WhiteLabelConfig cfg) => {
        'logo_url': cfg.logoUrl,
        'primary_color': cfg.primaryColor,
        'accent_color': cfg.accentColor,
        'company_name': cfg.companyName,
        'app_name': cfg.appName,
        'invoice_top_logo_url': cfg.invoiceTopLogoUrl,
        'invoice_background_logo_url': cfg.invoiceBackgroundLogoUrl,
        'white_label_version': cfg.version,
      };

  /// Build a config from a loosely-typed map, falling back to [base] (and then
  /// to the Vitharn defaults) for anything missing or unparseable.
  WhiteLabelConfig _configFromMap(
    Map<String, dynamic> map, {
    required WhiteLabelConfig base,
  }) {
    String str(String key, String fallback) {
      final v = map[key];
      if (v == null) return fallback;
      final s = v.toString().trim();
      return s.isEmpty ? fallback : s;
    }

    return WhiteLabelConfig(
      logoUrl: str('logo_url', base.logoUrl),
      primaryColor: parseColor(map['primary_color'], base.primaryColor),
      accentColor: parseColor(map['accent_color'], base.accentColor),
      companyName: str('company_name', base.companyName),
      appName: str('app_name', base.appName),
      invoiceTopLogoUrl: str('invoice_top_logo_url', base.invoiceTopLogoUrl),
      invoiceBackgroundLogoUrl:
          str('invoice_background_logo_url', base.invoiceBackgroundLogoUrl),
      version: int.tryParse(map['white_label_version']?.toString() ?? '') ??
          base.version,
    );
  }

  // ---------------------------------------------------------------------------
  // Colour parsing — must never crash on server-supplied junk
  // ---------------------------------------------------------------------------

  /// Parse a server-supplied colour into an ARGB int.
  ///
  /// Accepts: `int`/`num` ARGB, `#RRGGBB`, `#AARRGGBB`, `RRGGBB`, `#RGB`
  /// shorthand, `0xFFRRGGBB`, and `rgb(r,g,b)` / `rgba(r,g,b,a)`.
  /// Anything else (null, empty, garbage, out-of-range) returns [fallback].
  ///
  /// Exposed for testing — bad colours are the most likely server-side typo.
  static int parseColor(dynamic value, int fallback) {
    try {
      if (value == null) return fallback;

      if (value is int) return _normalizeArgb(value, fallback);
      if (value is num) return _normalizeArgb(value.toInt(), fallback);

      var s = value.toString().trim().toLowerCase();
      if (s.isEmpty || s == 'null') return fallback;

      // rgb(255, 170, 0) / rgba(255, 170, 0, 0.5)
      if (s.startsWith('rgb')) {
        final nums = RegExp(r'[\d.]+')
            .allMatches(s)
            .map((m) => double.tryParse(m.group(0)!))
            .whereType<double>()
            .toList();
        if (nums.length < 3) return fallback;
        final r = nums[0].round().clamp(0, 255);
        final g = nums[1].round().clamp(0, 255);
        final b = nums[2].round().clamp(0, 255);
        // 4th component is 0..1 opacity in CSS.
        final a = nums.length > 3 ? (nums[3] * 255).round().clamp(0, 255) : 255;
        return (a << 24) | (r << 16) | (g << 8) | b;
      }

      s = s.replaceFirst('#', '');
      if (s.startsWith('0x')) s = s.substring(2);
      if (s.isEmpty) return fallback;

      // #RGB / #ARGB shorthand -> expand each nibble.
      if (s.length == 3 || s.length == 4) {
        s = s.split('').map((c) => '$c$c').join();
      }

      // RRGGBB -> assume fully opaque.
      if (s.length == 6) s = 'ff$s';

      if (s.length != 8) return fallback;
      if (!RegExp(r'^[0-9a-f]{8}$').hasMatch(s)) return fallback;

      final parsed = int.tryParse(s, radix: 16);
      if (parsed == null) return fallback;
      return parsed;
    } catch (_) {
      return fallback;
    }
  }

  /// Treat a fully-transparent colour as a mistake — an invisible brand colour
  /// renders an unreadable UI, which is worse than ignoring the value.
  static int _normalizeArgb(int value, int fallback) {
    if (value < 0) return fallback;
    // Bare RGB (no alpha channel supplied) -> force opaque.
    if (value <= 0xFFFFFF) return 0xFF000000 | value;
    if (value > 0xFFFFFFFF) return fallback;
    if ((value >> 24) & 0xFF == 0) return 0xFF000000 | (value & 0xFFFFFF);
    return value;
  }

  /// Convenience accessors that are always safe to call from `build()`.
  Color get primaryColor => Color(_config.primaryColor);
  Color get accentColor => Color(_config.accentColor);

  // ---------------------------------------------------------------------------
  // Server fetch
  // ---------------------------------------------------------------------------

  /// Fetch branding from `client_config_dynamic` for [clientId].
  ///
  /// On any failure the previously cached config is retained — an outage must
  /// never blank out a client's branding.
  Future<void> fetchConfig(String clientId) async {
    if (clientId.isEmpty) return;
    try {
      final response = await SupabaseConfig.client
          .from('client_config_dynamic')
          .select('config_key, config_value, value_type')
          .eq('client_id', clientId)
          .timeout(networkTimeout);

      final rows = (response as List?) ?? const [];
      if (rows.isEmpty) {
        // No server rows is NOT a reason to discard good cached branding.
        debugPrint('WhiteLabelService: no server config for $clientId');
        return;
      }

      final configData = <String, dynamic>{};
      for (final row in rows) {
        if (row is! Map) continue;
        final map = row.cast<String, dynamic>();
        final key = (map['config_key'] as String?)?.trim() ?? '';
        if (key.isEmpty) continue;

        // config_value is jsonb; it may be a bare scalar or {"value": ...}.
        dynamic actual = map['config_value'];
        if (actual is Map && actual.containsKey('value')) {
          actual = actual['value'];
        }
        configData[key] = actual;
      }

      if (configData.isEmpty) return;

      // Merge over the current config so a partially-populated server row set
      // cannot wipe fields that were previously known.
      _config = _configFromMap(configData, base: _config);

      await _cacheConfig(clientId, _config);
      await _refreshLogoBytes(clientId, _config.logoUrl);

      _configController.add(_config);
      debugPrint('WhiteLabelService: config fetched for $clientId');
    } on TimeoutException {
      debugPrint('WhiteLabelService: fetch timed out, using cached branding');
    } catch (e) {
      debugPrint('WhiteLabelService: fetch failed: $e — using cached branding');
    }
  }

  /// Force a refresh (e.g. pull-to-refresh, or after an admin edits branding).
  Future<void> refresh() => fetchConfig(_clientId);

  // ---------------------------------------------------------------------------
  // Logo bytes — cached to disk, needed offline for PDF generation
  // ---------------------------------------------------------------------------

  Future<void> _loadCachedLogoBytes(
    String clientId, {
    SharedPreferences? prefs,
  }) async {
    try {
      final p = prefs ?? await SharedPreferences.getInstance();
      final b64 = p.getString(_logoKey(clientId));
      if (b64 == null || b64.isEmpty) return;
      _logoBytes = base64Decode(b64);
    } catch (e) {
      debugPrint('WhiteLabelService: logo cache read failed: $e');
      _logoBytes = null;
    }
  }

  /// Download the logo only when the URL actually changed, then cache bytes.
  ///
  /// A failed or 404 fetch keeps whatever bytes we already had; callers fall
  /// back to [fallbackLogoAsset] when [logoBytes] is null.
  Future<void> _refreshLogoBytes(String clientId, String logoUrl) async {
    if (logoUrl.isEmpty) return;
    if (!logoUrl.startsWith('http')) return;

    try {
      final prefs = await SharedPreferences.getInstance();
      final cachedSrc = prefs.getString(_logoSrcKey(clientId));

      // Same URL and we already have bytes -> no download. Saves Vercel
      // bandwidth on every cold start.
      if (cachedSrc == logoUrl && _logoBytes != null) return;
      if (cachedSrc == logoUrl && _logoBytes == null) {
        await _loadCachedLogoBytes(clientId, prefs: prefs);
        if (_logoBytes != null) return;
      }

      final res = await http
          .get(Uri.parse(logoUrl))
          .timeout(networkTimeout);

      if (res.statusCode != 200 || res.bodyBytes.isEmpty) {
        debugPrint(
          'WhiteLabelService: logo fetch HTTP ${res.statusCode} — '
          'keeping previous logo',
        );
        return;
      }

      // Guard against caching something absurd into SharedPreferences.
      if (res.bodyBytes.length > 2 * 1024 * 1024) {
        debugPrint('WhiteLabelService: logo >2MB, not caching bytes');
        _logoBytes = res.bodyBytes;
        return;
      }

      _logoBytes = res.bodyBytes;
      await prefs.setString(_logoKey(clientId), base64Encode(res.bodyBytes));
      await prefs.setString(_logoSrcKey(clientId), logoUrl);
    } on TimeoutException {
      debugPrint('WhiteLabelService: logo fetch timed out');
    } catch (e) {
      debugPrint('WhiteLabelService: logo fetch failed: $e');
    }
  }

  // ---------------------------------------------------------------------------
  // Realtime
  // ---------------------------------------------------------------------------

  /// Subscribe to live branding changes for [clientId].
  ///
  /// Filtered by `client_id` so a tenant can never receive another tenant's
  /// branding, and fully detached before re-subscribing to avoid duplicate
  /// callbacks.
  void _subscribeToUpdates(String clientId) {
    try {
      final topic = 'white_label:$clientId';

      // Already listening to exactly this tenant — re-subscribing would
      // double-fire every callback.
      if (_channel != null && _subscribedTopic == topic) return;

      _teardownChannel();
      final channel = SupabaseConfig.client.channel(topic);
      channel.onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'client_config_dynamic',
        filter: PostgresChangeFilter(
          type: PostgresChangeFilterType.eq,
          column: 'client_id',
          value: clientId,
        ),
        callback: _handleRealtimeUpdate,
      ).subscribe();

      _channel = channel;
      _subscribedTopic = topic;
    } catch (e) {
      debugPrint('WhiteLabelService: realtime subscription failed: $e');
    }
  }

  void _teardownChannel() {
    final channel = _channel;
    if (channel == null) return;
    try {
      // unsubscribe() alone leaves the topic in the client's channel map,
      // which would double-fire callbacks after a re-init.
      channel.unsubscribe();
      SupabaseConfig.client.removeChannel(channel);
    } catch (e) {
      debugPrint('WhiteLabelService: channel teardown failed: $e');
    } finally {
      _channel = null;
      _subscribedTopic = null;
    }
  }

  void _handleRealtimeUpdate(PostgresChangePayload payload) {
    try {
      final newRecord = payload.newRecord;
      final oldRecord = payload.oldRecord;
      final record = newRecord.isNotEmpty ? newRecord : oldRecord;
      if (record.isEmpty) return;

      // Defence in depth: never apply a row belonging to another tenant even
      // if the server-side filter were misconfigured.
      final rowClientId = record['client_id']?.toString();
      if (rowClientId != null &&
          rowClientId.isNotEmpty &&
          rowClientId != _clientId) {
        return;
      }

      final key = (record['config_key'] as String?)?.trim() ?? '';
      if (key.isEmpty) {
        // DELETE payloads often carry only the primary key (REPLICA IDENTITY
        // defaults to the PK), so re-fetch rather than guess.
        unawaited(fetchConfig(_clientId));
        return;
      }

      dynamic actual = record['config_value'];
      if (actual is Map && actual.containsKey('value')) {
        actual = actual['value'];
      }

      // A DELETE means "revert to default", which we cannot infer locally.
      if (payload.eventType == PostgresChangeEvent.delete) {
        unawaited(fetchConfig(_clientId));
        return;
      }

      final updated = _configFromMap({key: actual}, base: _config);
      if (_sameConfig(updated, _config)) return;

      final logoChanged = updated.logoUrl != _config.logoUrl;
      _config = updated;

      unawaited(_cacheConfig(_clientId, _config));
      if (logoChanged) {
        unawaited(_refreshLogoBytes(_clientId, _config.logoUrl));
      }

      _configController.add(_config);
    } catch (e) {
      debugPrint('WhiteLabelService: realtime update failed: $e');
    }
  }

  bool _sameConfig(WhiteLabelConfig a, WhiteLabelConfig b) =>
      a.logoUrl == b.logoUrl &&
      a.primaryColor == b.primaryColor &&
      a.accentColor == b.accentColor &&
      a.companyName == b.companyName &&
      a.appName == b.appName &&
      a.invoiceTopLogoUrl == b.invoiceTopLogoUrl &&
      a.invoiceBackgroundLogoUrl == b.invoiceBackgroundLogoUrl;

  // ---------------------------------------------------------------------------
  // Application
  // ---------------------------------------------------------------------------

  /// Overlay the dynamic branding on top of a compile-time [ClientConfig].
  ///
  /// Only non-empty server values win, so an unset server field always falls
  /// through to the bundled config rather than blanking the brand.
  ClientConfig applyToClientConfig(ClientConfig baseConfig) {
    return ClientConfig(
      clientId: baseConfig.clientId,
      appName: _config.appName.isNotEmpty ? _config.appName : baseConfig.appName,
      companyName: _config.companyName.isNotEmpty
          ? _config.companyName
          : baseConfig.companyName,
      companyAddress: baseConfig.companyAddress,
      companyContact: baseConfig.companyContact,
      companyEmail: baseConfig.companyEmail,
      companyProprietor: baseConfig.companyProprietor,
      gstNumber: baseConfig.gstNumber,
      bankName: baseConfig.bankName,
      bankBranch: baseConfig.bankBranch,
      bankAccountNo: baseConfig.bankAccountNo,
      bankIfsc: baseConfig.bankIfsc,
      termsAndConditions: baseConfig.termsAndConditions,
      defaultGstPercentage: baseConfig.defaultGstPercentage,
      quotePrefix: baseConfig.quotePrefix,
      logoUrl: _config.logoUrl.isNotEmpty ? _config.logoUrl : baseConfig.logoUrl,
      invoiceTopLogoUrl: _config.invoiceTopLogoUrl.isNotEmpty
          ? _config.invoiceTopLogoUrl
          : baseConfig.invoiceTopLogoUrl,
      invoiceBackgroundLogoUrl: _config.invoiceBackgroundLogoUrl.isNotEmpty
          ? _config.invoiceBackgroundLogoUrl
          : baseConfig.invoiceBackgroundLogoUrl,
      portalPasswordHash: baseConfig.portalPasswordHash,
      primaryColor: Color(_config.primaryColor),
      accentColor: Color(_config.accentColor),
      trialExpiresAt: baseConfig.trialExpiresAt,
      isActive: baseConfig.isActive,
      supabaseUrl: baseConfig.supabaseUrl,
      supabaseAnonKey: baseConfig.supabaseAnonKey,
      adminEmails: baseConfig.adminEmails,
      landingHeroTitle: baseConfig.landingHeroTitle,
      landingHeroSubtitle: baseConfig.landingHeroSubtitle,
      landingHeroImage: baseConfig.landingHeroImage,
      landingFeatures: baseConfig.landingFeatures,
      landingServices: baseConfig.landingServices,
      landingGallery: baseConfig.landingGallery,
      landingMapUrl: baseConfig.landingMapUrl,
      landingAboutTitle: baseConfig.landingAboutTitle,
      landingAboutText: baseConfig.landingAboutText,
      landingTestimonials: baseConfig.landingTestimonials,
      landingCTA: baseConfig.landingCTA,
      landingFooter: baseConfig.landingFooter,
      costMarginPercent: baseConfig.costMarginPercent,
      enablePricePresets: baseConfig.enablePricePresets,
      measuredPresets: baseConfig.measuredPresets,
      unmeasuredPresets: baseConfig.unmeasuredPresets,
      appDownloadUrl: baseConfig.appDownloadUrl,
      supplierCompanies: baseConfig.supplierCompanies,
      upiId: baseConfig.upiId,
      upiPayeeName: baseConfig.upiPayeeName,
    );
  }

  /// Clear cached branding for a tenant. Call on logout / tenant switch so one
  /// client's branding can never bleed into another's session.
  Future<void> clearCacheFor(String clientId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_configKey(clientId));
      await prefs.remove(_logoKey(clientId));
      await prefs.remove(_logoSrcKey(clientId));
    } catch (e) {
      debugPrint('WhiteLabelService: clear cache failed: $e');
    }
    if (_clientId == clientId) {
      _config = WhiteLabelConfig();
      _logoBytes = null;
      _initialized = false;
    }
  }

  /// Detach realtime listeners. Does NOT close the broadcast stream — closing
  /// it permanently would throw `StateError` on re-login or hot restart.
  void dispose() {
    _teardownChannel();
    _initialized = false;
  }
}
