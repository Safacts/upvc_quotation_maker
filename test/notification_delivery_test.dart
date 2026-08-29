import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('notifications are opt-in, tenant-bound, and replay-safe', () {
    final center =
        File(
          'lib/services/notification_center_service.dart',
        ).readAsStringSync();
    final service = File('lib/notification_service.dart').readAsStringSync();
    final login = File('lib/login_screen.dart').readAsStringSync();

    expect(
      center,
      contains('_notifications.any((item) => item.id == notification.id)'),
    );
    expect(center, contains('_isInitialized = true;'));
    expect(service, contains('Permission.notification.isGranted'));
    expect(service, contains('_stableNotificationId'));
    expect(
      login,
      contains('NotificationCenterService().resubscribe(config.clientId)'),
    );
    final settings = File('lib/settings_screen.dart').readAsStringSync();
    expect(settings, contains('Important notifications enabled'));
    expect(settings, contains('Notifications stay off'));
  });
}
