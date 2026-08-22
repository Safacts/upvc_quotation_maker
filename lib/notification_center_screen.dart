import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import 'package:toastification/toastification.dart';
import 'models.dart';
import 'models_extra.dart';
import 'quotation_screen.dart';
import 'app_state.dart';
import 'supabase_config.dart';
import 'services/notification_center_service.dart';

class NotificationCenterScreen extends StatefulWidget {
  const NotificationCenterScreen({super.key});

  @override
  State<NotificationCenterScreen> createState() => _NotificationCenterScreenState();
}

class _NotificationCenterScreenState extends State<NotificationCenterScreen> {
  final NotificationCenterService _notificationCenter = NotificationCenterService();
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _notificationCenter.initialize().then((_) {
      if (mounted) setState(() => _isLoading = false);
    });
  }

  Future<void> _refreshNotifications() async {
    await _notificationCenter.initialize();
    if (mounted) setState(() => _isLoading = false);
  }

  IconData _iconForKind(String kind) {
    switch (kind) {
      case AppNotification.kindQuoteOpened:
        return Icons.visibility_outlined;
      case AppNotification.kindPaymentReceived:
        return Icons.payment_outlined;
      case AppNotification.kindQuoteSent:
        return Icons.send_outlined;
      case AppNotification.kindQuoteWon:
        return Icons.emoji_events_outlined;
      case AppNotification.kindPhotoAdded:
        return Icons.photo_camera_outlined;
      default:
        return Icons.notifications_outlined;
    }
  }

  Color _colorForKind(String kind) {
    switch (kind) {
      case AppNotification.kindQuoteOpened:
        return Colors.blue;
      case AppNotification.kindPaymentReceived:
        return Colors.green;
      case AppNotification.kindQuoteSent:
        return Colors.purple;
      case AppNotification.kindQuoteWon:
        return Colors.amber.shade700;
      case AppNotification.kindPhotoAdded:
        return Colors.teal;
      default:
        return Colors.grey;
    }
  }

  Future<void> _handleNotificationTap(AppNotification notification) async {
    // Mark as read first
    await _notificationCenter.markAsRead(notification.id!);

    // Navigate based on entity type
    if (!mounted) return;

    switch (notification.entityType) {
      case 'quotation':
        if (notification.entityId.isNotEmpty) {
          try {
            final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
            final response = await SupabaseConfig.client
                .from('quotations')
                .select()
                .eq('id', notification.entityId)
                .eq('client_id', clientId)
                .single();

            final quotation = QuotationData.fromMap(response);
            if (mounted) {
              await Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => QuotationScreen(existingData: quotation)),
              );
              _refreshNotifications();
            }
          } catch (e) {
            toastification.show(
              context: context,
              title: const Text('Error'),
              description: Text('Failed to open quotation: $e'),
              type: ToastificationType.error,
              style: ToastificationStyle.fillColored,
              autoCloseDuration: const Duration(seconds: 3),
            );
          }
        }
        break;
      case 'payment':
        // TODO: Navigate to payment detail screen when implemented
        toastification.show(
          context: context,
          title: const Text('Payment Details'),
          description: Text('Payment detail screen coming soon. Ref: ${notification.entityId}'),
          type: ToastificationType.info,
          style: ToastificationStyle.fillColored,
          autoCloseDuration: const Duration(seconds: 3),
        );
        break;
      default:
        // Just mark as read, no navigation
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final notifications = _notificationCenter.notifications;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          if (notifications.any((n) => !n.read))
            TextButton.icon(
              onPressed: () async {
                await _notificationCenter.markAllAsRead();
                if (mounted) setState(() {});
              },
              icon: const Icon(Icons.done_all, size: 18),
              label: const Text('Mark All Read'),
              style: TextButton.styleFrom(foregroundColor: theme.colorScheme.primary),
            ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _refreshNotifications,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : notifications.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.notifications_none, size: 64, color: Colors.grey.shade400),
                      const SizedBox(height: 16),
                      Text('No notifications yet', style: TextStyle(color: Colors.grey.shade600, fontSize: 18)),
                      const SizedBox(height: 8),
                      Text(
                        'You\'ll see updates here when quotes are opened, payments are received, etc.',
                        style: TextStyle(color: Colors.grey.shade500, fontSize: 14),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ).animate().fade(),
                )
              : RefreshIndicator(
                  onRefresh: _refreshNotifications,
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: notifications.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final notification = notifications[index];
                      return Dismissible(
                        key: ValueKey(notification.id),
                        direction: DismissDirection.endToStart,
                        background: Container(
                          alignment: Alignment.centerRight,
                          padding: const EdgeInsets.only(right: 24),
                          decoration: BoxDecoration(
                            color: Colors.red.shade100,
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: const Icon(Icons.delete_outline, color: Colors.red),
                        ),
                        confirmDismiss: (direction) async {
                          // Mark as read instead of deleting (server-side delete not implemented)
                          await _notificationCenter.markAsRead(notification.id!);
                          return false; // Don't actually dismiss from list, just mark read
                        },
                        child: Card(
                          color: notification.read
                              ? theme.cardColor
                              : theme.colorScheme.primaryContainer.withValues(alpha: 0.3),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(16),
                            onTap: () => _handleNotificationTap(notification),
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Container(
                                    width: 44,
                                    height: 44,
                                    decoration: BoxDecoration(
                                      color: _colorForKind(notification.kind).withValues(alpha: 0.15),
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: Icon(
                                      _iconForKind(notification.kind),
                                      color: _colorForKind(notification.kind),
                                      size: 22,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Expanded(
                                              child: Text(
                                                notification.title,
                                                style: TextStyle(
                                                  fontWeight: notification.read ? FontWeight.w500 : FontWeight.bold,
                                                  fontSize: 15,
                                                  color: theme.textTheme.bodyLarge?.color,
                                                ),
                                              ),
                                            ),
                                            if (!notification.read)
                                              Container(
                                                width: 8,
                                                height: 8,
                                                decoration: BoxDecoration(
                                                  color: theme.colorScheme.primary,
                                                  shape: BoxShape.circle,
                                                ),
                                              ),
                                          ],
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          notification.body,
                                          style: TextStyle(
                                            fontSize: 13,
                                            color: Colors.grey.shade600,
                                          ),
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        const SizedBox(height: 8),
                                        Text(
                                          notification.relativeTime,
                                          style: TextStyle(
                                            fontSize: 11,
                                            color: Colors.grey.shade500,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Icon(
                                    Icons.chevron_right,
                                    color: Colors.grey.shade400,
                                    size: 20,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ).animate().fade(delay: Duration(milliseconds: 50 * index)).slideX(begin: 0.1),
                      );
                    },
                  ),
                ),
    );
  }
}