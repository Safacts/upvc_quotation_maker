import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:permission_handler/permission_handler.dart';
import 'models_extra.dart';

class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  final FlutterLocalNotificationsPlugin _notificationsPlugin = FlutterLocalNotificationsPlugin();

  Future<void> init() async {
    if (kIsWeb || (!Platform.isAndroid && !Platform.isIOS && !Platform.isMacOS)) return;

    const AndroidInitializationSettings initSettingsAndroid = AndroidInitializationSettings('@mipmap/launcher_icon');
    const DarwinInitializationSettings initSettingsDarwin = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    const InitializationSettings initSettings = InitializationSettings(
      android: initSettingsAndroid,
      iOS: initSettingsDarwin,
      macOS: initSettingsDarwin,
    );

    await _notificationsPlugin.initialize(initSettings);
  }

  Future<bool> requestPermissions() async {
    if (kIsWeb || (!Platform.isAndroid && !Platform.isIOS && !Platform.isMacOS)) return false;

    // Request permission using permission_handler
    if (await Permission.notification.isDenied) {
      await Permission.notification.request();
    }
    
    // Platform specific requests
    _notificationsPlugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.requestNotificationsPermission();
    _notificationsPlugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()?.requestPermissions(
      alert: true,
      badge: true,
      sound: true,
    );
    _notificationsPlugin.resolvePlatformSpecificImplementation<MacOSFlutterLocalNotificationsPlugin>()?.requestPermissions(
      alert: true,
      badge: true,
      sound: true,
    );
    return Permission.notification.isGranted;
  }

  Future<void> showImportantNotification({required String title, required String body}) async {
    if (kIsWeb || (!Platform.isAndroid && !Platform.isIOS && !Platform.isMacOS)) return;
    if (!await Permission.notification.isGranted) return;

    const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
      'important_notifications',
      'Important Notifications',
      channelDescription: 'Notifications for important updates and actions',
      importance: Importance.max,
      priority: Priority.high,
    );
    const DarwinNotificationDetails darwinDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );
    const NotificationDetails platformChannelDetails = NotificationDetails(
      android: androidDetails,
      iOS: darwinDetails,
      macOS: darwinDetails,
    );

    await _notificationsPlugin.show(
      _stableNotificationId('$title\n$body'),
      title,
      body,
      platformChannelDetails,
    );
  }

  /// Show a local notification derived from an AppNotification (from realtime)
  Future<void> showNotificationFromAppNotification(AppNotification notification) async {
    if (kIsWeb || (!Platform.isAndroid && !Platform.isIOS && !Platform.isMacOS)) return;
    if (!await Permission.notification.isGranted) return;


    const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
      'important_notifications',
      'Important Notifications',
      channelDescription: 'Notifications for important updates and actions',
      importance: Importance.max,
      priority: Priority.high,
    );
    const DarwinNotificationDetails darwinDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );
    const NotificationDetails platformChannelDetails = NotificationDetails(
      android: androidDetails,
      iOS: darwinDetails,
      macOS: darwinDetails,
    );

    await _notificationsPlugin.show(
      _stableNotificationId(
        notification.id ?? '${notification.kind}\n${notification.title}\n${notification.body}',
      ),
      notification.title,
      notification.body,
      platformChannelDetails,
    );
  }

  /// Stable across reconnects and restarts, unlike String.hashCode. Replaying
  /// one cloud event updates the same platform notification instead of
  /// producing another alert.
  int _stableNotificationId(String key) {
    var hash = 0x811c9dc5;
    for (final unit in key.codeUnits) {
      hash ^= unit;
      hash = (hash * 0x01000193) & 0x7fffffff;
    }
    return hash;
  }
}
