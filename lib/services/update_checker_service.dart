import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../models_sync.dart';
import 'connectivity_service.dart';
import 'content_sync_service.dart';

// ---------------------------------------------------------------------------
// UpdateCheckResult — outcome of a single manifest comparison
// ---------------------------------------------------------------------------

/// Why a check did not actually hit the network.
enum UpdateCheckSkipReason {
  /// The check ran and compared against the server manifest.
  none,

  /// Skipped because the minimum interval has not elapsed yet.
  throttled,

  /// Skipped because the device is offline.
  offline,

  /// Skipped because another check is already running.
  alreadyRunning,

  /// Skipped because no client id was supplied.
  noClientId,

  /// The network/parse step failed. `errorMessage` explains why.
  error,
}

/// The result of comparing the server content manifest against the versions
/// this device last stored.
///
/// Defined here (not in `models_sync.dart`) because it is an artefact of the
/// update checker, not of the sync wire protocol.
@immutable
class UpdateCheckResult {
  const UpdateCheckResult({
    required this.clientId,
    required this.checkedAt,
    this.staleContentTypes = const <String>[],
    this.serverVersions = const <String, int>{},
    this.localVersions = const <String, int>{},
    this.skipReason = UpdateCheckSkipReason.none,
    this.errorMessage = '',
  });

  /// An empty, "nothing to do" result.
  factory UpdateCheckResult.skipped(
    String clientId,
    UpdateCheckSkipReason reason, {
    String errorMessage = '',
  }) {
    return UpdateCheckResult(
      clientId: clientId,
      checkedAt: DateTime.now(),
      skipReason: reason,
      errorMessage: errorMessage,
    );
  }

  /// The tenant this result belongs to. Never merge results across clients.
  final String clientId;

  /// When the comparison was produced.
  final DateTime checkedAt;

  /// Content types whose server version is ahead of the local version.
  final List<String> staleContentTypes;

  /// Server-side version per content type, as reported by the manifest.
  final Map<String, int> serverVersions;

  /// Locally stored version per content type at the time of the check.
  final Map<String, int> localVersions;

  /// Why the check was skipped, if it was.
  final UpdateCheckSkipReason skipReason;

  /// Error detail when [skipReason] is [UpdateCheckSkipReason.error].
  final String errorMessage;

  /// Whether there is at least one stale content type.
  bool get hasUpdates => staleContentTypes.isNotEmpty;

  /// Whether the check actually reached the server.
  bool get didCheck => skipReason == UpdateCheckSkipReason.none;

  /// Human-readable list of what changed, e.g. "Products, Terms".
  String get summary {
    if (staleContentTypes.isEmpty) return 'Up to date';
    return staleContentTypes
        .map(UpdateCheckerService.labelForContentType)
        .join(', ');
  }

  /// A stable fingerprint of "this exact set of pending updates". Used to make
  /// a user's dismissal stick until something genuinely new arrives.
  String get signature {
    if (staleContentTypes.isEmpty) return '';
    final parts = <String>[];
    for (final type in staleContentTypes) {
      parts.add('$type:${serverVersions[type] ?? 0}');
    }
    return parts.join('|');
  }

  @override
  String toString() =>
      'UpdateCheckResult(client=$clientId, stale=$staleContentTypes, '
      'skip=$skipReason, err=$errorMessage)';
}

// ---------------------------------------------------------------------------
// UpdateCheckerService
// ---------------------------------------------------------------------------

/// Detects when the server has newer *content* (products, pricing templates,
/// terms, bank details, branding) than this device has cached, and lets the
/// user pull it down without reinstalling the app.
///
/// This is deliberately separate from `lib/update_checker.dart`, which checks
/// for a new **APK binary**. This service checks for new **content versions**.
///
/// Design constraints baked in here:
/// * **Never throws.** Every public entry point is defensive; a failure to
///   check must never block app startup or crash a build.
/// * **Never spams Vercel.** Checks are throttled to [minCheckInterval] and the
///   last-check timestamp is persisted, so a restart loop cannot burn
///   serverless invocations on the Hobby plan.
/// * **Web-safe.** State lives in `SharedPreferences` (works on Flutter Web),
///   not SQLite, and there are no `dart:io` imports.
/// * **Multi-tenant.** Every persisted key is namespaced by `client_id`, and a
///   result computed for one tenant is never applied to another.
/// * **Re-entrant-safe.** Concurrent calls collapse onto the in-flight future.
class UpdateCheckerService {
  UpdateCheckerService._();
  static final UpdateCheckerService instance = UpdateCheckerService._();

  // -------------------------------------------------------------------------
  // Tunables
  // -------------------------------------------------------------------------

  /// Minimum time between two network manifest checks for the same client.
  ///
  /// 15 minutes. Rationale: the app is hosted on the Vercel **Hobby** plan
  /// where serverless invocations are a real cost constraint. At 15 minutes a
  /// device that is open all working day (~9h) costs ~36 manifest calls/day,
  /// i.e. ~1.1k/month for a single heavy user — comfortably inside Hobby
  /// limits even at 100 clients, while still surfacing a rate-card change to
  /// the sales team within a quarter of an hour.
  static const Duration minCheckInterval = Duration(minutes: 15);

  /// Network timeout for the manifest request. Short by design — a slow
  /// manifest must never make the UI feel stuck.
  static const Duration requestTimeout = Duration(seconds: 12);

  /// Content types this service tracks.
  ///
  /// Matches the `content_type` values written by migration 014's
  /// `bump_content_version()` helper.
  static const List<String> trackedContentTypes = <String>[
    'products',
    'pricing_templates',
    'terms',
    'bank_details',
    'branding',
  ];

  /// Aliases the server may use for the branding/white-label manifest row.
  static const Map<String, String> _contentTypeAliases = <String, String>{
    'white_label': 'branding',
    'white_label_config': 'branding',
    'client_config_dynamic': 'branding',
    'branding_config': 'branding',
  };

  /// Display labels for the banner.
  static String labelForContentType(String contentType) {
    switch (contentType) {
      case 'products':
        return 'Products';
      case 'pricing_templates':
        return 'Pricing';
      case 'terms':
        return 'Terms';
      case 'bank_details':
        return 'Bank details';
      case 'branding':
        return 'Branding';
      default:
        return contentType
            .split('_')
            .where((w) => w.isNotEmpty)
            .map((w) => '${w[0].toUpperCase()}${w.substring(1)}')
            .join(' ');
    }
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  final ConnectivityService _connectivity = ConnectivityService.instance;
  final ContentSyncService _contentSync = ContentSyncService.instance;

  SharedPreferences? _prefs;
  bool _initialized = false;

  /// Re-entrancy guards. Concurrent callers await the same future rather than
  /// firing a second request.
  Future<UpdateCheckResult>? _inFlightCheck;
  Future<bool>? _inFlightApply;

  /// The most recent result, used by the UI and by [hasPendingUpdates].
  UpdateCheckResult? _lastResult;
  UpdateCheckResult? get lastResult => _lastResult;

  /// Broadcast stream of results. Matches the stream style used by
  /// `ConnectivityService`, `SyncEngine` and `FeatureFlagService`.
  final StreamController<UpdateCheckResult> _resultsController =
      StreamController<UpdateCheckResult>.broadcast();
  Stream<UpdateCheckResult> get updatesStream => _resultsController.stream;

  /// Whether an apply is currently running (drives the banner spinner).
  bool _isApplying = false;
  bool get isApplying => _isApplying;

  /// Broadcast stream of the applying flag.
  final StreamController<bool> _applyingController =
      StreamController<bool>.broadcast();
  Stream<bool> get applyingStream => _applyingController.stream;

  /// Whether the last check found content this device does not have yet.
  bool get hasPendingUpdates => _lastResult?.hasUpdates ?? false;

  /// The stale content types from the last check.
  List<String> get pendingContentTypes =>
      List<String>.unmodifiable(_lastResult?.staleContentTypes ?? const []);

  /// Whether the user has already dismissed *this exact* set of updates.
  bool get isDismissed {
    final result = _lastResult;
    if (result == null || !result.hasUpdates) return true;
    final stored = _prefs?.getString(_dismissedKey(result.clientId));
    return stored != null && stored == result.signature;
  }

  /// Convenience for the UI: something to show, and not already dismissed.
  bool get shouldShowBanner => hasPendingUpdates && !isDismissed;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /// Initialize the service. Safe to call more than once. Never throws.
  Future<void> initialize() async {
    if (_initialized) return;
    try {
      _prefs = await SharedPreferences.getInstance();
      _initialized = true;
      debugPrint('UpdateCheckerService initialized');
    } catch (e) {
      // SharedPreferences can fail on a locked profile / restricted browser.
      // Degrade to "no persistence" rather than breaking startup.
      _initialized = true;
      debugPrint('UpdateCheckerService: prefs unavailable, running stateless: $e');
    }
  }

  /// Dispose of resources.
  void dispose() {
    _resultsController.close();
    _applyingController.close();
  }

  // -------------------------------------------------------------------------
  // Checking
  // -------------------------------------------------------------------------

  /// Compare the server content manifest against locally stored versions.
  ///
  /// Returns the set of content types that are behind. Honours the
  /// [minCheckInterval] throttle unless [force] is set, skips silently when
  /// offline, and never throws.
  Future<UpdateCheckResult> checkForUpdates(
    String clientId, {
    bool force = false,
  }) {
    // Re-entrancy: collapse onto the in-flight check.
    final inFlight = _inFlightCheck;
    if (inFlight != null) return inFlight;

    final future = _checkForUpdatesInternal(clientId, force: force);
    _inFlightCheck = future;
    return future.whenComplete(() {
      _inFlightCheck = null;
    });
  }

  /// Fire-and-forget check for app startup. Never awaits the caller's frame,
  /// never throws, and does nothing when offline or throttled.
  ///
  /// ```dart
  /// unawaited(UpdateCheckerService.instance.checkOnStart(clientId));
  /// ```
  Future<void> checkOnStart(String clientId) async {
    try {
      await initialize();
      await checkForUpdates(clientId);
    } catch (e) {
      debugPrint('UpdateCheckerService: checkOnStart failed: $e');
    }
  }

  Future<UpdateCheckResult> _checkForUpdatesInternal(
    String clientId, {
    required bool force,
  }) async {
    try {
      await initialize();

      final cid = clientId.trim();
      if (cid.isEmpty) {
        return _emit(UpdateCheckResult.skipped(
          clientId,
          UpdateCheckSkipReason.noClientId,
        ));
      }

      // Throttle — persisted, so an app restart loop cannot bypass it.
      if (!force && !_isIntervalElapsed(cid)) {
        // Keep the previous result visible; do not clobber it.
        return _lastResult ??
            UpdateCheckResult.skipped(cid, UpdateCheckSkipReason.throttled);
      }

      // Offline — skip silently, do not burn the throttle window.
      final online = await _isOnline();
      if (!online) {
        debugPrint('UpdateCheckerService: offline, skipping check');
        return _lastResult ??
            UpdateCheckResult.skipped(cid, UpdateCheckSkipReason.offline);
      }

      final manifest = await _fetchManifest(cid);

      // Record the attempt only after a successful fetch, so a failing
      // endpoint does not lock us out for a full interval.
      await _setLastCheckAt(cid, DateTime.now());

      final serverVersions = <String, int>{};
      final localVersions = <String, int>{};
      final stale = <String>[];

      for (final item in manifest) {
        final type = _normalizeContentType(item.contentType);
        if (!trackedContentTypes.contains(type)) continue;

        final serverVersion = item.version;
        final localVersion = _localVersion(cid, type);
        serverVersions[type] = serverVersion;
        localVersions[type] = localVersion;

        if (_isStale(
          cid: cid,
          contentType: type,
          serverVersion: serverVersion,
          localVersion: localVersion,
          serverLastModified: item.lastModified,
        )) {
          stale.add(type);
        }
      }

      // Preserve the declared ordering so the banner text is stable.
      stale.sort((a, b) => trackedContentTypes
          .indexOf(a)
          .compareTo(trackedContentTypes.indexOf(b)));

      return _emit(UpdateCheckResult(
        clientId: cid,
        checkedAt: DateTime.now(),
        staleContentTypes: List<String>.unmodifiable(stale),
        serverVersions: Map<String, int>.unmodifiable(serverVersions),
        localVersions: Map<String, int>.unmodifiable(localVersions),
      ));
    } catch (e) {
      debugPrint('UpdateCheckerService: check failed: $e');
      return _emit(UpdateCheckResult.skipped(
        clientId,
        UpdateCheckSkipReason.error,
        errorMessage: e.toString(),
      ));
    }
  }

  /// Staleness rule.
  ///
  /// A content type is stale when the server `version` integer is greater than
  /// the version this device stored after its last successful apply. If the
  /// versions match, we fall back to `last_modified` so an out-of-band edit
  /// that forgot to bump the counter is still caught.
  ///
  /// First run (no stored version) counts as stale: a fresh install genuinely
  /// has no cached content.
  bool _isStale({
    required String cid,
    required String contentType,
    required int serverVersion,
    required int localVersion,
    required DateTime serverLastModified,
  }) {
    if (localVersion <= 0) return true;
    if (serverVersion > localVersion) return true;

    final storedModified = _localLastModified(cid, contentType);
    if (storedModified == null) return false;
    return serverLastModified.isAfter(storedModified);
  }

  // -------------------------------------------------------------------------
  // Applying
  // -------------------------------------------------------------------------

  /// Pull the pending content down by delegating to the existing
  /// [ContentSyncService]. This service intentionally does **not** reimplement
  /// sync — it only decides *when* a sync is worth doing.
  ///
  /// Returns `true` on success. Never throws. (A `Future<bool>` is usable
  /// anywhere a `Future<void>` is expected in Dart, since `void` is a top
  /// type — callers that do not care can simply `await` it.)
  Future<bool> applyUpdates({String? clientId}) {
    final inFlight = _inFlightApply;
    if (inFlight != null) return inFlight;

    final future = _applyUpdatesInternal(clientId);
    _inFlightApply = future;
    return future.whenComplete(() {
      _inFlightApply = null;
    });
  }

  Future<bool> _applyUpdatesInternal(String? clientId) async {
    final cid = (clientId ?? _lastResult?.clientId ?? '').trim();
    if (cid.isEmpty) {
      debugPrint('UpdateCheckerService: applyUpdates with no client id');
      return false;
    }

    _setApplying(true);
    try {
      await initialize();

      if (!await _isOnline()) {
        debugPrint('UpdateCheckerService: applyUpdates skipped, offline');
        return false;
      }

      // Delegate the actual fetching to the existing coordinator.
      await _contentSync.forceSync(cid);

      // Commit the versions we knew about so the banner clears. Use the
      // versions captured by the check that produced the current result — the
      // sync just materialised exactly that content.
      final result = _lastResult;
      if (result != null && result.clientId == cid) {
        for (final entry in result.serverVersions.entries) {
          await _setLocalVersion(cid, entry.key, entry.value);
        }
      }
      await _setLocalLastModifiedNowForAll(cid);
      await _clearDismissal(cid);

      // Re-check against the server so the cleared state is authoritative
      // rather than assumed. Forced, because we just spent an invocation
      // anyway and correctness beats one extra call here.
      await checkForUpdates(cid, force: true);

      return true;
    } catch (e) {
      debugPrint('UpdateCheckerService: applyUpdates failed: $e');
      return false;
    } finally {
      _setApplying(false);
    }
  }

  /// Dismiss the current set of pending updates. The banner stays hidden until
  /// a genuinely newer version arrives (the signature changes).
  Future<void> dismissCurrentUpdates() async {
    try {
      final result = _lastResult;
      if (result == null || !result.hasUpdates) return;
      await initialize();
      await _prefs?.setString(
        _dismissedKey(result.clientId),
        result.signature,
      );
      // Re-emit so listeners re-evaluate `shouldShowBanner`.
      _resultsController.add(result);
    } catch (e) {
      debugPrint('UpdateCheckerService: dismiss failed: $e');
    }
  }

  /// Wipe all stored state for a client. Useful on logout / tenant switch so
  /// one tenant's versions can never mask another's.
  Future<void> resetForClient(String clientId) async {
    try {
      await initialize();
      final prefs = _prefs;
      if (prefs == null) return;
      for (final type in trackedContentTypes) {
        await prefs.remove(_versionKey(clientId, type));
        await prefs.remove(_modifiedKey(clientId, type));
      }
      await prefs.remove(_lastCheckKey(clientId));
      await prefs.remove(_dismissedKey(clientId));
      if (_lastResult?.clientId == clientId) {
        _lastResult = null;
      }
    } catch (e) {
      debugPrint('UpdateCheckerService: reset failed: $e');
    }
  }

  // -------------------------------------------------------------------------
  // Networking
  // -------------------------------------------------------------------------

  /// Fetch the content manifest. Mirrors the URL strategy already used by
  /// `SyncEngine`: same-origin on web, absolute on Android.
  Future<List<ContentManifestItem>> _fetchManifest(String clientId) async {
    final path = '/api/content/manifest?client_id=$clientId';
    final url = kIsWeb ? path : 'https://app.vitharn.com$path';

    final response = await http.get(
      Uri.parse(url),
      headers: const {'Accept': 'application/json'},
    ).timeout(requestTimeout);

    if (response.statusCode != 200) {
      throw Exception('manifest HTTP ${response.statusCode}');
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map) throw Exception('manifest: unexpected payload');

    final json = decoded.cast<String, dynamic>();
    final list = (json['manifest'] as List?) ?? const [];

    final items = <ContentManifestItem>[];
    for (final raw in list) {
      if (raw is! Map) continue;
      try {
        items.add(ContentManifestItem.fromMap(raw.cast<String, dynamic>()));
      } catch (_) {
        // Skip malformed rows rather than failing the whole check.
      }
    }
    return items;
  }

  Future<bool> _isOnline() async {
    try {
      return await _connectivity.checkOnline();
    } catch (e) {
      debugPrint('UpdateCheckerService: connectivity check failed: $e');
      // Fail open — matches ConnectivityService's own behaviour.
      return true;
    }
  }

  // -------------------------------------------------------------------------
  // Persistence (SharedPreferences — web-safe, keyed by client_id)
  // -------------------------------------------------------------------------

  static String _versionKey(String cid, String type) =>
      'update_checker.version.$cid.$type';

  static String _modifiedKey(String cid, String type) =>
      'update_checker.modified.$cid.$type';

  static String _lastCheckKey(String cid) => 'update_checker.last_check.$cid';

  static String _dismissedKey(String cid) => 'update_checker.dismissed.$cid';

  int _localVersion(String cid, String type) {
    try {
      return _prefs?.getInt(_versionKey(cid, type)) ?? 0;
    } catch (_) {
      return 0;
    }
  }

  Future<void> _setLocalVersion(String cid, String type, int version) async {
    try {
      await _prefs?.setInt(_versionKey(cid, type), version);
    } catch (e) {
      debugPrint('UpdateCheckerService: persist version failed: $e');
    }
  }

  DateTime? _localLastModified(String cid, String type) {
    try {
      final raw = _prefs?.getString(_modifiedKey(cid, type));
      if (raw == null || raw.isEmpty) return null;
      return DateTime.tryParse(raw);
    } catch (_) {
      return null;
    }
  }

  Future<void> _setLocalLastModifiedNowForAll(String cid) async {
    final now = DateTime.now().toIso8601String();
    for (final type in trackedContentTypes) {
      try {
        await _prefs?.setString(_modifiedKey(cid, type), now);
      } catch (e) {
        debugPrint('UpdateCheckerService: persist last_modified failed: $e');
      }
    }
  }

  bool _isIntervalElapsed(String cid) {
    try {
      final millis = _prefs?.getInt(_lastCheckKey(cid));
      if (millis == null) return true;
      final last = DateTime.fromMillisecondsSinceEpoch(millis);
      return DateTime.now().difference(last) >= minCheckInterval;
    } catch (_) {
      return true;
    }
  }

  /// When the last successful network check happened, or `null` if never.
  DateTime? lastCheckAt(String clientId) {
    try {
      final millis = _prefs?.getInt(_lastCheckKey(clientId));
      if (millis == null) return null;
      return DateTime.fromMillisecondsSinceEpoch(millis);
    } catch (_) {
      return null;
    }
  }

  Future<void> _setLastCheckAt(String cid, DateTime when) async {
    try {
      await _prefs?.setInt(_lastCheckKey(cid), when.millisecondsSinceEpoch);
    } catch (e) {
      debugPrint('UpdateCheckerService: persist last_check failed: $e');
    }
  }

  Future<void> _clearDismissal(String cid) async {
    try {
      await _prefs?.remove(_dismissedKey(cid));
    } catch (_) {}
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  String _normalizeContentType(String raw) {
    final key = raw.trim().toLowerCase();
    return _contentTypeAliases[key] ?? key;
  }

  UpdateCheckResult _emit(UpdateCheckResult result) {
    _lastResult = result;
    if (!_resultsController.isClosed) {
      _resultsController.add(result);
    }
    return result;
  }

  void _setApplying(bool value) {
    if (_isApplying == value) return;
    _isApplying = value;
    if (!_applyingController.isClosed) {
      _applyingController.add(value);
    }
  }
}
