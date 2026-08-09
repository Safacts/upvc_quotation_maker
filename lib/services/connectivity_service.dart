import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

/// Network connectivity service that monitors the device's connection status.
///
/// Uses `connectivity_plus` to detect network changes and provides a stream
/// of connectivity status updates. The sync engine uses this to trigger
/// automatic sync when the device comes online.
///
/// Fail-open by design: if connectivity cannot be determined the service
/// reports ONLINE. A false "offline" would send the app down the offline path
/// and block Supabase calls that would actually have succeeded; a false
/// "online" only costs one failed request that the caller already handles.
///
/// On Flutter Web `connectivity_plus` reports the browser's navigator state,
/// which says nothing about whether our API is reachable — so a `none` result
/// there is still treated as online.
class ConnectivityService {
  ConnectivityService._();
  static final ConnectivityService instance = ConnectivityService._();

  final Connectivity _connectivity = Connectivity();

  /// Stream of connectivity status changes.
  final _connectivityController = StreamController<bool>.broadcast();
  Stream<bool> get connectivityStream => _connectivityController.stream;

  /// The change subscription — retained so it can actually be cancelled.
  /// Without this the listener outlived every dispose() and leaked.
  StreamSubscription<List<ConnectivityResult>>? _subscription;

  bool _initialized = false;

  /// Current connectivity status.
  bool _isOnline = true;
  bool get isOnline => _isOnline;

  /// Initialize the connectivity service. Idempotent and never throws.
  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    // Check initial connectivity
    try {
      final result = await _connectivity.checkConnectivity();
      _isOnline = _isConnected(result);
    } catch (e) {
      debugPrint('ConnectivityService: initial check failed: $e');
      _isOnline = true; // fail open
    }

    // Listen for connectivity changes
    try {
      await _subscription?.cancel();
      _subscription = _connectivity.onConnectivityChanged.listen(
        (result) {
          final wasOnline = _isOnline;
          _isOnline = _isConnected(result);

          if (wasOnline != _isOnline) {
            debugPrint('ConnectivityService: ${_isOnline ? "online" : "offline"}');
            _emit(_isOnline);
          }
        },
        onError: (Object e) {
          debugPrint('ConnectivityService: stream error: $e');
        },
        cancelOnError: false,
      );
    } catch (e) {
      debugPrint('ConnectivityService: listen failed: $e');
    }

    debugPrint('ConnectivityService initialized: online=$_isOnline');
  }

  /// Check if the device is online. Never throws.
  Future<bool> checkOnline() async {
    try {
      final result = await _connectivity.checkConnectivity();
      final next = _isConnected(result);
      if (next != _isOnline) {
        _isOnline = next;
        _emit(_isOnline);
      }
    } catch (e) {
      debugPrint('ConnectivityService: check failed: $e');
      // If we can't check, keep the last known value (fail open on first run).
    }
    return _isOnline;
  }

  /// Check if the connectivity result indicates a connection.
  bool _isConnected(List<ConnectivityResult> results) {
    // Browsers under-report; never declare the web build offline from this.
    if (kIsWeb) return true;
    if (results.isEmpty) return true; // unknown -> fail open
    return results.any((r) => r != ConnectivityResult.none);
  }

  void _emit(bool value) {
    if (_connectivityController.isClosed) return;
    _connectivityController.add(value);
  }

  /// Release the platform listener. Safe to call more than once, and safe to
  /// call before a later [initialize].
  ///
  /// The broadcast controller is deliberately NOT closed here: this is a
  /// process-lifetime singleton and long-lived `StreamBuilder`s (the dashboard
  /// offline banner) subscribe to it. Closing it would make those builders
  /// permanently stale. Use [shutdown] on real teardown.
  Future<void> dispose() async {
    await _subscription?.cancel();
    _subscription = null;
    _initialized = false;
  }

  /// Full teardown — cancels the listener AND closes the stream. Only call
  /// this when the app is going away for good (tests, desktop window close).
  Future<void> shutdown() async {
    await dispose();
    if (!_connectivityController.isClosed) {
      await _connectivityController.close();
    }
  }
}
