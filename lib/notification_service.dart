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

  Future<void> requestPermissions() async {
    if (kIsWeb || (!Platform.isAndroid && !Platform.isIOS && !Platform.isMacOS)) return;

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
  }

  Future<void> showImportantNotification({required String title, required String body}) async {
    if (kIsWeb || (!Platform.isAndroid && !Platform.isIOS && !Platform.isMacOS)) return;

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
      DateTime.now().millisecond,
      title,
      body,
      platformChannelDetails,
    );
  }

  /// Show a local notification derived from an AppNotification (from realtime)
  Future<void> showNotificationFromAppNotification(AppNotification notification) async {
    if (kIsWeb || (!Platform.isAndroid && !Platform.isIOS && !Platform.isMacOS)) return;

    // Map notification kind to appropriate channel/details
    String channelId;
    String channelName;
    String channelDescription;
    Importance importance = Importance.max;
    Priority priority = Priority.high;

    switch (notification.kind) {
      case AppNotification.kindQuoteOpened:
        channelId = 'quote_opened';
        channelName = 'Quote Opened';
        channelDescription = 'Customer opened a quotation';
        break;
      case AppNotification.kindPaymentReceived:
        channelId = 'payment_received';
        channelName = 'Payment Received';
        channelDescription = 'Payment received for a quotation';
        break;
      case AppNotification.kindQuoteSent:
        channelId = 'quote_sent';
        channelName = 'Quote Sent';
        channelDescription = 'Quotation was sent to customer';
        break;
      case AppNotification.kindQuoteWon:
        channelId = 'quote_won';
        channelName = 'Quote Won';
        channelDescription = 'Quotation status changed to Won';
        break;
      case AppNotification.kindPhotoAdded:
        channelId = 'photo_added';
        channelName = 'Site Photo Added';
        channelDescription = 'A site photo was attached to a quotation';
        break;
      default:
        channelId = 'general_notifications';
        channelName = 'General Notifications';
        channelDescription = 'General app notifications';
    }

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
      DateTime.now().millisecond,
      notification.title,
      notification.body,
      platformChannelDetails,
    );
  }
}
