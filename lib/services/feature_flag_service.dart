import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../supabase_config.dart';
import 'offline_database.dart';

/// feature_flag_service.dart -- CLIENT-SIDE FEATURE GATING (the UX half of the
/// paywall).
///
/// ============================================================================
///  WHAT THIS IS AND IS NOT
/// ============================================================================
/// This service decides what the APP SHOWS. `src/lib/tiers.ts` decides what the
/// SERVER ALLOWS, and that one is the real boundary -- it returns HTTP 402. This
/// file exists so a Low-tier client is not offered a button that would only
/// produce a 402 three taps later.
///
/// Because it is only the UX half, the failure modes are asymmetric and the
/// correct bias is NOT obvious:
///
///   * OVER-GATE (hide something they paid for)  -> loud. The client phones
///     Aadi within the hour and it is fixed in seconds.
///   * UNDER-GATE (show something they did not pay for) -> silent. A Rs.10,000
///     client uses a Rs.55,000 feature until someone happens to audit. That is
///     a pure revenue leak and it is the failure this file is written to
///     prevent.
///
/// So: FAIL CLOSED, with exactly one deliberate exception -- the grandfathered
/// allow-list (see [_grandfathered]) which mirrors `GRANDFATHERED` in
/// `src/lib/tiers.ts`, because over-gating our first two paying clients would
/// revoke features they use daily.
///
/// ============================================================================
///  THE FOUR RULES
/// ============================================================================
/// 1. THE TIER COMES FROM THE DATABASE (`clients.tier`, migration 014), never
///    from a caller-supplied argument that could be spoofed or stale.
/// 2. AN UNKNOWN / NULL / MISSPELLED TIER DEGRADES TO THE LOWEST TIER, never
///    the highest. `parseTier` in tiers.ts does the same thing server-side.
/// 3. WE NEVER RETURN "EVERYTHING ENABLED". Not on a network error, not on
///    first launch, not when the flag table is empty, not on Flutter Web where
///    sqflite does not exist. The fallback chain terminates in
///    [_kFeatureMinTier], a hardcoded ladder -- never in `true`.
/// 4. [isEnabled] IS SYNCHRONOUS. It is called from `build()`. It must never
///    await, never touch the disk, and never throw.
///
/// ============================================================================
///  FALLBACK CHAIN (in order)
/// ============================================================================
///   1. In-memory flags fetched from the server this session.
///   2. Flags cached in SharedPreferences from a previous session, scoped to
///      (clientId, tier).
///   3. [_kFeatureMinTier] evaluated against the last known tier.
///   4. [_kFeatureMinTier] evaluated against `low` (the lowest tier).
/// There is no step 5 that grants everything.

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

/// Tiers in ASCENDING order of capability. The index IS the rank.
///
/// These strings are BYTE-IDENTICAL to `TIERS` in `src/lib/tiers.ts` and to the
/// `clients_tier_chk` CHECK constraint in
/// `supabase/migrations/014_client_tiers.sql`. Note the canonical spelling is
/// `nextplus` with NO underscore. Do not "tidy" this -- see [_kTierAliases].
const List<String> kTierLadder = <String>['low', 'base', 'next', 'nextplus', 'final'];

/// The lowest tier. Every unknown tier degrades to this, never to `final`.
const String kLowestTier = 'low';

/// Human labels, mirroring `TIER_LABEL` in src/lib/tiers.ts.
const Map<String, String> kTierLabels = <String, String>{
  'low': 'Low',
  'base': 'Base',
  'next': 'Next',
  'nextplus': 'Next+',
  'final': 'Final',
};

/// Every spelling of a tier that real data actually contains, mapped onto the
/// canonical value.
///
/// ###########################################################################
/// #  THIS MAP IS LOAD-BEARING -- IT PAPERS OVER A REAL SCHEMA SPLIT         #
/// ###########################################################################
/// Two migrations disagree about how to spell the Rs.45,000 tier:
///   * `014_client_tiers.sql`  -> `clients.tier` CHECK allows `nextplus`
///   * `014_in_app_updates.sql` -> `feature_flags.tier` rows are seeded
///                                 `next_plus`
/// So the client's tier reads back as `nextplus`, and a naive
/// `.eq('tier', 'nextplus')` against `feature_flags` matches ZERO rows -- a
/// paying Next+ client silently receives no flags at all. [_dbTierSpellings]
/// below is the other half of the workaround: we query BOTH spellings.
///
/// Anything NOT in this map resolves to null = unknown = lowest tier. A typo
/// must lock the account down and generate a support call, never unlock it.
const Map<String, String> _kTierAliases = <String, String>{
  'low': 'low',
  'offline': 'low',
  'base': 'base',
  'basic': 'base',
  'standard': 'base',
  'next': 'next',
  'nextplus': 'nextplus',
  'next+': 'nextplus',
  'next_plus': 'nextplus',
  'next plus': 'nextplus',
  'final': 'final',
  'full': 'final',
  'premium': 'final',
};

/// Every spelling a canonical tier may appear as in `feature_flags.tier`.
/// We query all of them so the `nextplus` / `next_plus` split cannot silently
/// disable a paid tier. Harmless for the tiers that have only one spelling.
const Map<String, List<String>> _dbTierSpellings = <String, List<String>>{
  'low': <String>['low'],
  'base': <String>['base'],
  'next': <String>['next'],
  'nextplus': <String>['nextplus', 'next_plus', 'next+'],
  'final': <String>['final'],
};

// ---------------------------------------------------------------------------
// The hardcoded fallback matrix
// ---------------------------------------------------------------------------

/// Feature key -> the LOWEST tier that unlocks it.
///
/// This is the offline / no-cache / server-is-down answer, and it is the reason
/// this service can never leak. Expressing it as "minimum tier" rather than as
/// a per-tier boolean table gives tier INHERITANCE for free and makes an
/// inheritance bug unrepresentable: `final` cannot accidentally lose a feature
/// that `low` has, because the comparison is a single rank >= rank.
///
/// The first eleven keys are the authoritative product matrix. The last four
/// pre-date it and are aligned to `FEATURE_TIERS` in `src/lib/tiers.ts` --
/// see the ALIGNMENT NOTE on each. They must agree with tiers.ts, because
/// tiers.ts is what actually returns 402: offering a button the server will
/// reject is a worse user experience than not showing the button.
const Map<String, String> _kFeatureMinTier = <String, String>{
  // --- Authoritative product matrix ---------------------------------------
  'offline_mode': 'low',
  'product_catalog': 'low',
  'push_notifications': 'base',
  'customer_history': 'base',
  'site_photos': 'next',
  'upi_qr': 'next',
  'custom_domain': 'nextplus',
  'analytics': 'base',
  'desktop_console': 'final',
  'multi_user': 'final',
  'api_access': 'final',

  // --- Legacy keys, aligned to src/lib/tiers.ts FEATURE_TIERS -------------
  // ALIGNMENT NOTE: tiers.ts `invoicing: "base"`.
  'gst_invoices': 'base',
  // ALIGNMENT NOTE: tiers.ts `email_notifications: "next"`.
  'email_portal': 'next',
  // ALIGNMENT NOTE: tiers.ts `whatsapp_share: "nextplus"`. The seed data in
  // 014_in_app_updates.sql enables this at `low`, which contradicts the
  // paywall and would leak a Rs.45,000 feature to a Rs.10,000 client. The
  // server wins; this default is the safe one.
  'whatsapp_share': 'nextplus',
  // ALIGNMENT NOTE: tiers.ts `data_export: "final"`. Same contradiction as
  // whatsapp_share -- the seed enables it at `low`. Fail closed.
  'excel_export': 'final',
};

/// Rank of a tier on the ladder. -1 for unknown, i.e. below everything.
int _rankOf(String? tier) {
  if (tier == null || tier.isEmpty) return -1;
  return kTierLadder.indexOf(tier);
}

/// Normalise any stored/typed value to a canonical tier, or null if we do not
/// recognise it. Mirrors `parseTier()` in src/lib/tiers.ts.
String? normalizeTier(Object? raw) {
  if (raw is! String) return null;
  final String key = raw.trim().toLowerCase();
  if (key.isEmpty) return null;
  return _kTierAliases[key];
}

// ---------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------

/// Per-tier feature flags, cached offline, updated live over Supabase Realtime.
class FeatureFlagService {
  FeatureFlagService._();
  static final FeatureFlagService instance = FeatureFlagService._();

  /// Our first two clients keep full access forever (Aadi, 09-08-2026). This
  /// mirrors `GRANDFATHERED` in src/lib/tiers.ts and is the ONLY place this
  /// service ever biases towards granting rather than denying. Without it, a
  /// tier lookup failure would over-gate Venkateshwara mid-quotation -- they
  /// use the desktop console and GST invoicing daily.
  static const Set<String> _grandfathered = <String>{'venkateshwara', 'kprupvc'};

  /// Hard ceiling on the startup flag fetch. `main.dart` awaits
  /// [initialize] before `runApp`, so an unbounded request here is a splash
  /// screen that never ends on a bad train-station connection. On timeout we
  /// simply keep the cached flags -- correctness is unaffected.
  static const Duration _networkTimeout = Duration(seconds: 8);

  static const String _prefsFlagsPrefix = 'ff_flags_v1';
  static const String _prefsTierPrefix = 'ff_tier_v1';

  final OfflineDatabase _db = OfflineDatabase.instance;

  /// The client whose flags are currently loaded. Empty until initialised.
  String _clientId = '';
  String get clientId => _clientId;

  /// Current canonical tier.
  ///
  /// Defaults to the LOWEST tier, never `base` and never `final`: before we
  /// have heard from the database we must assume the cheapest plan, otherwise
  /// the pre-initialisation window is itself a revenue leak.
  String _tier = kLowestTier;
  String get tier => _tier;

  /// Human label for the current tier, for the billing/upgrade UI.
  String get tierLabel => kTierLabels[_tier] ?? kTierLabels[kLowestTier]!;

  /// True once [initialize] has completed at least once, so the UI can tell
  /// "not loaded yet" apart from "genuinely disabled" if it wants to.
  bool _ready = false;
  bool get isReady => _ready;

  /// True when the flags in memory came from the network this session (as
  /// opposed to the offline cache or the hardcoded ladder).
  bool _fromServer = false;
  bool get isFromServer => _fromServer;

  /// In-memory flags. Authoritative for [isEnabled] while non-empty.
  final Map<String, bool> _flags = <String, bool>{};

  StreamController<Map<String, bool>> _flagsController =
      StreamController<Map<String, bool>>.broadcast();
  Stream<Map<String, bool>> get flagsStream => _flagsController.stream;

  RealtimeChannel? _channel;

  /// Topic of the channel we are currently joined to. Guards against the
  /// double-subscribe that a second [initialize] would otherwise cause: the
  /// Supabase client keys channels by topic, so re-creating the same topic
  /// yields two live subscriptions and two callbacks per row change.
  String? _subscribedTopic;

  /// Serialises [initialize] so two concurrent callers cannot interleave a
  /// cache load with a network apply and leave `_flags` half-written.
  Future<void>? _initInFlight;

  // -------------------------------------------------------------------------
  // Public API -- everything a widget touches is SYNCHRONOUS
  // -------------------------------------------------------------------------

  /// Whether [featureKey] is available to this client RIGHT NOW.
  ///
  /// Synchronous, non-throwing, and safe to call from `build()` -- it reads
  /// only in-memory state. There is deliberately no `Future` variant for the
  /// UI to accidentally reach for, because a `FutureBuilder` around a feature
  /// gate flashes the ungated UI for one frame before hiding it.
  ///
  /// `defaultValue` is honoured ONLY for keys this service has never heard of
  /// (an experiment, a key added by a newer server than this APK). For every
  /// known key the answer comes from the server, then the offline cache, then
  /// the [_kFeatureMinTier] ladder -- a caller cannot pass `defaultValue: true`
  /// and thereby unlock a paid feature on a Low-tier device.
  bool isEnabled(String featureKey, {bool defaultValue = false}) {
    final String key = featureKey.trim();
    if (key.isEmpty) return false;

    final bool? live = _flags[key];
    if (live != null) return live;

    // Known key with no row: the server has not seeded it for this tier yet.
    // Answer from the ladder rather than `false`, so shipping a new feature
    // does not silently over-gate every client until someone runs an INSERT.
    final String? minTier = _kFeatureMinTier[key];
    if (minTier != null) return _rankOf(_tier) >= _rankOf(minTier);

    return defaultValue;
  }

  /// The minimum tier that unlocks [featureKey], for rendering an honest
  /// "upgrade to Next+ (Rs.45,000)" prompt instead of a dead greyed-out button.
  String? requiredTierFor(String featureKey) => _kFeatureMinTier[featureKey.trim()];

  /// Label of the tier that unlocks [featureKey], or null if unknown.
  String? requiredTierLabelFor(String featureKey) {
    final String? t = requiredTierFor(featureKey);
    return t == null ? null : kTierLabels[t];
  }

  /// Snapshot of every flag currently in effect, resolved through the same
  /// fallback chain as [isEnabled] so the account screen and the buttons can
  /// never disagree.
  Map<String, bool> getAllFlags() {
    final Map<String, bool> resolved = <String, bool>{};
    for (final String key in _kFeatureMinTier.keys) {
      resolved[key] = isEnabled(key);
    }
    // Server-only keys this build does not know about, surfaced as-is.
    for (final MapEntry<String, bool> e in _flags.entries) {
      resolved.putIfAbsent(e.key, () => e.value);
    }
    return Map<String, bool>.unmodifiable(resolved);
  }

  /// Does this client's tier meet [requiredTier]? Unknown tiers never satisfy
  /// anything. Mirrors `tierSatisfies()` in src/lib/tiers.ts.
  bool tierSatisfies(String requiredTier) {
    final String? need = normalizeTier(requiredTier);
    if (need == null) return false;
    return _rankOf(_tier) >= _rankOf(need);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /// Load flags for [clientId] and start listening for live changes.
  ///
  /// Order matters and is chosen so the app is never worse off than before the
  /// call: cache first (instant, works offline), tier second, network last. A
  /// failure at any step leaves the previous good state intact.
  ///
  /// [tier] is an OPTIONAL HINT only. The database is authoritative; passing a
  /// tier here cannot escalate a client's plan, it only avoids one round trip
  /// before the real value arrives.
  Future<void> initialize(String clientId, {String? tier}) {
    final Future<void> pending = _initInFlight ?? Future<void>.value();
    final Future<void> next = pending
        .catchError((_) {})
        .then((_) => _initializeInternal(clientId, tierHint: tier));
    _initInFlight = next;
    return next;
  }

  Future<void> _initializeInternal(String clientId, {String? tierHint}) async {
    final String id = clientId.trim();
    if (id.isEmpty) {
      // No tenant = no entitlement. Stay at the lowest tier and do not
      // subscribe to anything; a channel with an empty client_id filter would
      // stream every tenant's flags.
      _tier = kLowestTier;
      _ready = true;
      debugPrint('FeatureFlagService: empty clientId -> locked to $kLowestTier');
      return;
    }

    // Switching tenants (Flutter Web, same browser, second login) must not
    // inherit the previous tenant's flags for even one frame.
    if (_clientId.isNotEmpty && _clientId != id) {
      _flags.clear();
      _fromServer = false;
      _tier = kLowestTier;
    }
    _clientId = id;

    // 1. Last known tier, so an offline launch gates correctly instead of
    //    dropping a Final client to Low.
    _tier = await _loadCachedTier(id) ?? normalizeTier(tierHint) ?? kLowestTier;

    // 2. Cached flags for exactly this (client, tier).
    final Map<String, bool>? cached = await _loadCachedFlags(id, _tier);
    if (cached != null && cached.isNotEmpty) {
      _flags
        ..clear()
        ..addAll(cached);
    }

    // 3. Authoritative tier from `clients.tier`, then flags for it.
    final String resolvedTier = await _resolveTierFromServer(id, fallback: _tier);
    if (resolvedTier != _tier) {
      _tier = resolvedTier;
      await _persistTier(id, resolvedTier);
      final Map<String, bool>? forNewTier = await _loadCachedFlags(id, resolvedTier);
      _flags
        ..clear()
        ..addAll(forNewTier ?? const <String, bool>{});
    } else {
      await _persistTier(id, resolvedTier);
    }

    await fetchFlags(id);

    _subscribeToUpdates(id);

    _ready = true;
    _emit();
    debugPrint(
      'FeatureFlagService ready: client=$id tier=$_tier '
      'flags=${_flags.length} fromServer=$_fromServer',
    );
  }

  /// Fetch flags from the server and adopt them.
  ///
  /// NEVER destroys good state. Three distinct outcomes:
  ///   * rows returned  -> adopt and persist.
  ///   * ZERO rows      -> keep whatever we had. An empty result is almost
  ///                       always a seeding gap or a tier-spelling mismatch,
  ///                       not "this client bought nothing", and clearing the
  ///                       cache on it would wipe the offline fallback too.
  ///   * error/timeout  -> keep whatever we had.
  Future<void> fetchFlags(String clientId) async {
    final String id = clientId.trim();
    if (id.isEmpty) return;

    final List<String> spellings = _dbTierSpellings[_tier] ?? <String>[_tier];

    try {
      final dynamic response = await SupabaseConfig.client
          .from('feature_flags')
          .select('feature_key, enabled, tier, client_id')
          .eq('client_id', id)
          .inFilter('tier', spellings)
          .timeout(_networkTimeout);

      if (response is! List) {
        debugPrint('FeatureFlagService: unexpected payload shape, keeping cache');
        return;
      }

      final Map<String, bool> fetched = <String, bool>{};
      for (final dynamic row in response) {
        if (row is! Map) continue;
        final Map<String, dynamic> map = row.cast<String, dynamic>();

        // Defence in depth. RLS and the .eq() above already scope this, but a
        // misconfigured policy must not be able to hand us another tenant's
        // entitlements -- that is both a leak and a privacy breach.
        final String rowClient = (map['client_id'] as String?)?.trim() ?? id;
        if (rowClient != id) continue;

        final String key = (map['feature_key'] as String?)?.trim() ?? '';
        if (key.isEmpty) continue;

        fetched[key] = map['enabled'] == true;
      }

      if (fetched.isEmpty) {
        debugPrint(
          'FeatureFlagService: 0 rows for client=$id tier=$_tier '
          '(spellings=$spellings) -- keeping ${_flags.length} cached flags. '
          'Check that feature_flags is seeded for this client/tier.',
        );
        return;
      }

      _flags
        ..clear()
        ..addAll(fetched);
      _fromServer = true;

      await _persistFlags(id, _tier, fetched);
      _emit();
      debugPrint('FeatureFlagService: fetched ${fetched.length} flags for tier=$_tier');
    } on TimeoutException {
      debugPrint('FeatureFlagService: fetch timed out, keeping ${_flags.length} cached flags');
    } catch (e) {
      // Offline, RLS denial, table missing (migration not applied), PostgREST
      // schema cache stale... all of them mean "use what we already have".
      debugPrint('FeatureFlagService: fetch failed ($e), keeping ${_flags.length} cached flags');
    }
  }

  /// Force a refresh from the server, e.g. after the user taps "I've upgraded".
  /// Re-resolves the tier too, so an upgrade takes effect without a restart.
  Future<void> refresh() async {
    if (_clientId.isEmpty) return;
    final String resolved = await _resolveTierFromServer(_clientId, fallback: _tier);
    if (resolved != _tier) {
      _tier = resolved;
      await _persistTier(_clientId, resolved);
      _flags
        ..clear()
        ..addAll(await _loadCachedFlags(_clientId, resolved) ?? const <String, bool>{});
    }
    await fetchFlags(_clientId);
    _emit();
  }

  /// Apply a tier change locally (subscription upgrade/downgrade).
  ///
  /// An unrecognised [newTier] degrades to the lowest tier rather than being
  /// ignored: silently keeping the old tier after a downgrade is the leak.
  Future<void> setTier(String newTier, String clientId) async {
    final String id = clientId.trim().isEmpty ? _clientId : clientId.trim();
    final String canonical = normalizeTier(newTier) ?? kLowestTier;

    if (normalizeTier(newTier) == null) {
      debugPrint(
        'FeatureFlagService: unrecognised tier "$newTier" -> degrading to '
        '$kLowestTier (fail closed). Valid: $kTierLadder',
      );
    }
    if (canonical == _tier) return;

    _tier = canonical;
    await _persistTier(id, canonical);

    // Flags are tier-scoped. Carrying the old tier's map across a downgrade
    // would keep paid features lit until the network answered.
    _flags
      ..clear()
      ..addAll(await _loadCachedFlags(id, canonical) ?? const <String, bool>{});
    _fromServer = false;
    _emit();

    debugPrint('FeatureFlagService: tier -> $_tier');
    await fetchFlags(id);
  }

  // -------------------------------------------------------------------------
  // Tier resolution
  // -------------------------------------------------------------------------

  /// Read the authoritative tier from `clients.tier` (migration 014).
  ///
  /// Returns [fallback] on any failure. A database blip must not downgrade a
  /// paying client -- that is the over-gate that generates an angry phone call
  /// -- but equally it must never upgrade one, which is why the only path to a
  /// higher tier here is a successful read or the grandfathered allow-list.
  Future<String> _resolveTierFromServer(String clientId, {required String fallback}) async {
    if (_grandfathered.contains(clientId)) return 'final';

    try {
      final dynamic rows = await SupabaseConfig.client
          .from('clients')
          .select('id, tier, config')
          .eq('id', clientId)
          .limit(1)
          .timeout(_networkTimeout);

      if (rows is! List || rows.isEmpty) return fallback;

      final Map<String, dynamic> row = (rows.first as Map).cast<String, dynamic>();

      // Dedicated column first (014_client_tiers), then the legacy config blob,
      // so a database where 014 has not been applied still gates correctly.
      String? tier = normalizeTier(row['tier']);
      if (tier == null) {
        final dynamic config = row['config'];
        if (config is Map) tier = normalizeTier(config['tier']);
      }

      if (tier == null) {
        // NULL tier means "not yet sold" -- fail closed to the lowest tier,
        // exactly as src/lib/tiers.ts does. It does NOT mean "everything".
        debugPrint('FeatureFlagService: client=$clientId has no tier -> $kLowestTier');
        return kLowestTier;
      }
      return tier;
    } on TimeoutException {
      debugPrint('FeatureFlagService: tier lookup timed out, keeping "$fallback"');
      return fallback;
    } catch (e) {
      debugPrint('FeatureFlagService: tier lookup failed ($e), keeping "$fallback"');
      return fallback;
    }
  }

  // -------------------------------------------------------------------------
  // Realtime
  // -------------------------------------------------------------------------

  /// Subscribe to live flag changes for THIS client only.
  ///
  /// The `client_id` equality filter is a hard multi-tenant requirement, not an
  /// optimisation: without it the socket streams every tenant's entitlements to
  /// every device.
  void _subscribeToUpdates(String clientId) {
    final String topic = 'feature_flags:$clientId';

    // Already joined to exactly this topic -> do nothing. Re-creating it would
    // leave two live subscriptions firing two callbacks per row change.
    if (_channel != null && _subscribedTopic == topic) return;

    _teardownChannel();

    try {
      final RealtimeChannel channel = SupabaseConfig.client.channel(topic);
      channel.onPostgresChanges(
        event: PostgresChangeEvent.all,
        schema: 'public',
        table: 'feature_flags',
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
      // Realtime is a nicety; the app is fully functional on cached flags plus
      // the next foreground fetch. Never let this break startup.
      _channel = null;
      _subscribedTopic = null;
      debugPrint('FeatureFlagService: realtime subscribe failed: $e');
    }
  }

  void _handleRealtimeUpdate(PostgresChangePayload payload) {
    try {
      final Map<String, dynamic> newRow = payload.newRecord.cast<String, dynamic>();
      final Map<String, dynamic> oldRow = payload.oldRecord.cast<String, dynamic>();

      if (payload.eventType == PostgresChangeEvent.delete) {
        // A Postgres DELETE only carries the columns in the table's REPLICA
        // IDENTITY -- by default just the primary key, so `feature_key` is
        // usually absent here. If we cannot identify the row we re-fetch
        // rather than guess; guessing wrong on a delete means leaving a
        // revoked feature switched on.
        final String key = (oldRow['feature_key'] as String?)?.trim() ?? '';
        if (key.isEmpty) {
          unawaited(fetchFlags(_clientId));
          return;
        }
        final String rowClient = (oldRow['client_id'] as String?)?.trim() ?? _clientId;
        if (rowClient != _clientId) return;
        _flags.remove(key);
      } else {
        final String rowClient = (newRow['client_id'] as String?)?.trim() ?? _clientId;
        if (rowClient != _clientId) return;

        final String key = (newRow['feature_key'] as String?)?.trim() ?? '';
        if (key.isEmpty) return;

        // Only rows for OUR tier apply. Without this check, an admin editing
        // the `final` row would flip the flag on for a `low` client.
        final String? rowTier = normalizeTier(newRow['tier']);
        if (rowTier != _tier) return;

        _flags[key] = newRow['enabled'] == true;
      }

      unawaited(_persistFlags(_clientId, _tier, Map<String, bool>.from(_flags)));
      _emit();
    } catch (e) {
      debugPrint('FeatureFlagService: realtime update failed: $e');
    }
  }

  void _teardownChannel() {
    final RealtimeChannel? channel = _channel;
    _channel = null;
    _subscribedTopic = null;
    if (channel == null) return;
    try {
      // removeChannel (not unsubscribe) also drops it from the client's
      // internal topic map, so a later channel() with the same topic returns a
      // genuinely new channel instead of a stale joined one.
      unawaited(SupabaseConfig.client.removeChannel(channel));
    } catch (e) {
      debugPrint('FeatureFlagService: channel teardown failed: $e');
    }
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  // SharedPreferences, not sqflite, is the cache of record here, for two
  // reasons that both bite in production:
  //   1. WEB. sqflite has no Flutter Web implementation, so OfflineDatabase
  //      throws on this app's Vercel build and every flag read would fall
  //      through to a default. SharedPreferences is backed by localStorage on
  //      web and works everywhere.
  //   2. TENANCY. `offline_feature_flags` is keyed by `feature_key` ALONE, so
  //      two clients in the same browser overwrite each other's flags. Our key
  //      includes both client id and tier, which makes that unrepresentable.
  // We still mirror into sqflite best-effort so existing readers keep working.

  String _flagsKey(String clientId, String tier) => '$_prefsFlagsPrefix::$clientId::$tier';
  String _tierKey(String clientId) => '$_prefsTierPrefix::$clientId';

  Future<Map<String, bool>?> _loadCachedFlags(String clientId, String tier) async {
    try {
      final SharedPreferences prefs = await SharedPreferences.getInstance();
      final String? raw = prefs.getString(_flagsKey(clientId, tier));
      if (raw == null || raw.isEmpty) return null;

      final dynamic decoded = jsonDecode(raw);
      if (decoded is! Map) return null;

      final Map<String, bool> flags = <String, bool>{};
      decoded.forEach((dynamic k, dynamic v) {
        if (k is String && k.isNotEmpty) flags[k] = v == true;
      });
      return flags;
    } catch (e) {
      debugPrint('FeatureFlagService: cache read failed: $e');
      return null;
    }
  }

  Future<void> _persistFlags(String clientId, String tier, Map<String, bool> flags) async {
    if (clientId.isEmpty || flags.isEmpty) return;
    try {
      final SharedPreferences prefs = await SharedPreferences.getInstance();
      await prefs.setString(_flagsKey(clientId, tier), jsonEncode(flags));
    } catch (e) {
      debugPrint('FeatureFlagService: cache write failed: $e');
    }

    // Best-effort mirror into SQLite for other readers. Guarded and skipped on
    // web, where sqflite is unavailable and this would throw on every write.
    if (kIsWeb) return;
    try {
      // Pass client + tier explicitly. `upsertFeatureFlags` defaults to
      // tier 'base' and the ambient client id; relying on either would file a
      // Final client's flags under 'base' and make the row unreadable.
      await _db.upsertFeatureFlags(flags, tier: tier, clientId: clientId);
    } catch (e) {
      debugPrint('FeatureFlagService: sqflite mirror failed (non-fatal): $e');
    }
  }

  Future<String?> _loadCachedTier(String clientId) async {
    try {
      final SharedPreferences prefs = await SharedPreferences.getInstance();
      return normalizeTier(prefs.getString(_tierKey(clientId)));
    } catch (e) {
      debugPrint('FeatureFlagService: tier cache read failed: $e');
      return null;
    }
  }

  Future<void> _persistTier(String clientId, String tier) async {
    if (clientId.isEmpty) return;
    try {
      final SharedPreferences prefs = await SharedPreferences.getInstance();
      await prefs.setString(_tierKey(clientId), tier);
    } catch (e) {
      debugPrint('FeatureFlagService: tier cache write failed: $e');
    }
  }

  // -------------------------------------------------------------------------
  // Teardown
  // -------------------------------------------------------------------------

  void _emit() {
    if (_flagsController.isClosed) return;
    _flagsController.add(getAllFlags());
  }

  /// Detach from the current client without killing the service.
  /// Use this on logout / tenant switch -- it is reversible, unlike [dispose].
  Future<void> reset() async {
    _teardownChannel();
    _flags.clear();
    _clientId = '';
    _tier = kLowestTier;
    _fromServer = false;
    _ready = false;
    _emit();
  }

  /// Release everything. Safe to call twice.
  ///
  /// The controller is recreated rather than left closed, because this is a
  /// singleton: a hot restart or a re-login calling [initialize] after
  /// [dispose] would otherwise add to a closed controller and throw a
  /// StateError from a place with no obvious connection to the cause.
  Future<void> dispose() async {
    _teardownChannel();
    if (!_flagsController.isClosed) {
      await _flagsController.close();
    }
    _flagsController = StreamController<Map<String, bool>>.broadcast();
    _ready = false;
  }

  // -------------------------------------------------------------------------
  // Convenience getters
  // -------------------------------------------------------------------------
  //
  // All of these are plain [isEnabled] calls with NO `defaultValue: true`.
  // A `defaultValue: true` here was the original revenue leak: with an empty
  // flag map (offline, first launch, web, or an unseeded tier) it handed a
  // Rs.10,000 Low client the Rs.45,000 WhatsApp share and the Rs.55,000 export.
  // The tier ladder in [_kFeatureMinTier] gives the correct answer instead --
  // `low` still gets offline_mode and product_catalog, and nothing more.

  bool get offlineMode => isEnabled('offline_mode');
  bool get productCatalog => isEnabled('product_catalog');
  bool get pushNotifications => isEnabled('push_notifications');
  bool get customerHistory => isEnabled('customer_history');
  bool get sitePhotos => isEnabled('site_photos');
  bool get upiQr => isEnabled('upi_qr');
  bool get customDomain => isEnabled('custom_domain');
  bool get desktopConsole => isEnabled('desktop_console');
  bool get analytics => isEnabled('analytics');
  bool get multiUser => isEnabled('multi_user');
  bool get apiAccess => isEnabled('api_access');
  bool get excelExport => isEnabled('excel_export');
  bool get whatsappShare => isEnabled('whatsapp_share');
  bool get emailPortal => isEnabled('email_portal');
  bool get gstInvoices => isEnabled('gst_invoices');
}
