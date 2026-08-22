import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:upvc_quotation_maker/models_extra.dart';
import 'package:upvc_quotation_maker/notification_service.dart';
import 'package:upvc_quotation_maker/supabase_config.dart';

/// Singleton service that subscribes to `app_notifications` table via Supabase Realtime.
/// Filters by `client_id` = current client (using x-client-id header).
/// On INSERT event, shows local notification via NotificationService.
/// Maintains in-memory list of unread notifications for badge count.
/// Provides Stream<List<AppNotification>> for UI to consume.
class NotificationCenterService {
  static final NotificationCenterService _instance = NotificationCenterService._internal();
  factory NotificationCenterService() => _instance;
  NotificationCenterService._internal();

  RealtimeChannel? _channel;
  final StreamController<List<AppNotification>> _notificationsController = StreamController<List<AppNotification>>.broadcast();
  final List<AppNotification> _notifications = [];
  String? _currentClientId;
  bool _isInitialized = false;

  /// Stream of notifications for UI to consume
  Stream<List<AppNotification>> get notificationsStream => _notificationsController.stream;

  /// Current list of notifications (cached)
  List<AppNotification> get notifications => List.unmodifiable(_notifications);

  /// Unread notifications count for badge
  int get unreadCount => _notifications.where((n) => !n.read).length;

  /// Whether the service is currently subscribed
  bool get isSubscribed => _channel != null;

  /// Initialize the notification center with the current client ID
  Future<void> initialize() async {
    if (_isInitialized) {
      debugPrint('[NotificationCenterService] Already initialized');
      return;
    }

    // Get client ID from Supabase headers
    final clientId = SupabaseConfig.client.headers['x-client-id'];
    if (clientId == null || clientId.isEmpty) {
      debugPrint('[NotificationCenterService] No client ID found in headers, waiting for config...');
      return;
    }

    _currentClientId = clientId;
    await _subscribeToNotifications();
    _isInitialized = true;
    debugPrint('[NotificationCenterService] Initialized for client: $_currentClientId');
  }

  /// Subscribe to realtime notifications for the current client
  Future<void> _subscribeToNotifications() async {
    if (_currentClientId == null || _currentClientId!.isEmpty) {
      debugPrint('[NotificationCenterService] Cannot subscribe: no client ID');
      return;
    }

    // Dispose existing channel if any
    await dispose();

    final channelName = 'notifications:$_currentClientId';
    _channel = SupabaseConfig.client.channel(channelName);

    _channel!
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'app_notifications',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'client_id',
            value: _currentClientId!,
          ),
          callback: (payload) {
            _handleRealtimeInsert(payload);
          },
        )
        .subscribe((status, error) {
          if (error != null) {
            debugPrint('[NotificationCenterService] Subscription error: $error');
          } else {
            debugPrint('[NotificationCenterService] Subscribed to $channelName with status: $status');
          }
        });

    // Also fetch existing unread notifications on startup
    await _fetchExistingNotifications();
  }

  /// Handle incoming realtime INSERT event
  void _handleRealtimeInsert(PostgresChangePayload payload) {
    try {
      final newRecord = payload.newRecord;

      final notification = AppNotification.fromMap(newRecord);
      
      // Add to in-memory list (at the top for newest first)
      _notifications.insert(0, notification);
      _notifyListeners();

      // Show local notification
      NotificationService().showNotificationFromAppNotification(notification);
      
      debugPrint('[NotificationCenterService] Received notification: ${notification.kind} - ${notification.title}');
    } catch (e) {
      debugPrint('[NotificationCenterService] Error handling realtime insert: $e');
    }
  }

  /// Fetch existing notifications from database on startup
  Future<void> _fetchExistingNotifications() async {
    if (_currentClientId == null) return;

    try {
      final response = await SupabaseConfig.client
          .from('app_notifications')
          .select()
          .eq('client_id', _currentClientId!)
          .order('created_at', ascending: false)
          .limit(100);

      final fetched = (response as List)
          .map((e) => AppNotification.fromMap(e))
          .toList();

      _notifications.clear();
      _notifications.addAll(fetched);
      _notifyListeners();
      
      debugPrint('[NotificationCenterService] Fetched ${fetched.length} existing notifications');
    } catch (e) {
      debugPrint('[NotificationCenterService] Error fetching existing notifications: $e');
    }
  }

  /// Notify all listeners of updated notification list
  void _notifyListeners() {
    if (!_notificationsController.isClosed) {
      _notificationsController.add(List.unmodifiable(_notifications));
    }
  }

  /// Get unread count for badge
  int getUnreadCount() => unreadCount;

  /// Mark a specific notification as read
  Future<void> markAsRead(String notificationId) async {
    try {
      await SupabaseConfig.client
          .from('app_notifications')
          .update({'read': true})
          .eq('id', notificationId)
          .eq('client_id', _currentClientId!);

      final index = _notifications.indexWhere((n) => n.id == notificationId);
      if (index != -1) {
        _notifications[index] = _notifications[index].copyWith(read: true);
        _notifyListeners();
      }
    } catch (e) {
      debugPrint('[NotificationCenterService] Error marking as read: $e');
    }
  }

  /// Mark all notifications as read
  Future<void> markAllAsRead() async {
    if (_currentClientId == null) return;

    try {
      await SupabaseConfig.client
          .from('app_notifications')
          .update({'read': true})
          .eq('client_id', _currentClientId!)
          .eq('read', false);

      for (int i = 0; i < _notifications.length; i++) {
        if (!_notifications[i].read) {
          _notifications[i] = _notifications[i].copyWith(read: true);
        }
      }
      _notifyListeners();
    } catch (e) {
      debugPrint('[NotificationCenterService] Error marking all as read: $e');
    }
  }

  /// Resubscribe when client config changes (e.g., user switches client)
  Future<void> resubscribe(String newClientId) async {
    if (newClientId == _currentClientId) return;
    
    debugPrint('[NotificationCenterService] Resubscribing to new client: $newClientId');
    _currentClientId = newClientId;
    _notifications.clear();
    await _subscribeToNotifications();
  }

  /// Dispose the realtime subscription and clean up
  Future<void> dispose() async {
    if (_channel != null) {
      await SupabaseConfig.client.removeChannel(_channel!);
      _channel = null;
    }
    _isInitialized = false;
    debugPrint('[NotificationCenterService] Disposed');
  }

  /// Clean up on app shutdown
  void shutdown() {
    dispose();
    if (!_notificationsController.isClosed) {
      _notificationsController.close();
    }
  }
}