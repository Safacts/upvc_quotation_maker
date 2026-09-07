import 'package:flutter/material.dart';

/// An indicator widget that shows the current offline/online status.
///
/// Displays a quiet, passive status row when the device is offline.
/// Automatically hides when online.
class OfflineIndicator extends StatelessWidget {
  const OfflineIndicator({
    super.key,
    required this.isOffline,
    this.message = 'You are offline. Changes will sync when connected.',
  });

  /// Whether the device is currently offline.
  final bool isOffline;

  /// The message to display when offline.
  final String message;

  @override
  Widget build(BuildContext context) {
    if (!isOffline) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: Row(
        children: [
          Icon(
            Icons.wifi_off,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
            size: 16,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A compact offline/pending row. It only offers a retry action when useful.
class OfflineBanner extends StatelessWidget {
  const OfflineBanner({
    super.key,
    required this.isOffline,
    this.pendingSyncCount = 0,
    this.onTap,
  });

  /// Whether the device is currently offline.
  final bool isOffline;

  /// Number of items pending sync.
  final int pendingSyncCount;

  /// Callback when the banner is tapped.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    if (!isOffline && pendingSyncCount == 0) return const SizedBox.shrink();

    final isOfflineMode = isOffline;
    final hasPendingSync = pendingSyncCount > 0;

    String message;
    Color bgColor;
    IconData icon;

    if (isOfflineMode) {
      message =
          hasPendingSync
              ? 'Saved here • $pendingSyncCount waiting for internet'
              : 'Offline • your work is saved on this device';
      bgColor = Theme.of(context).colorScheme.surfaceContainerHighest;
      icon = Icons.wifi_off;
    } else if (hasPendingSync) {
      message =
          '$pendingSyncCount item${pendingSyncCount == 1 ? '' : 's'} waiting to sync';
      bgColor = Theme.of(context).colorScheme.surfaceContainerHighest;
      icon = Icons.sync;
    } else {
      return const SizedBox.shrink();
    }

    return Material(
      color: bgColor,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: Row(
          children: [
            Icon(
              icon,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              size: 16,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                message,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  fontSize: 13,
                ),
              ),
            ),
            if (hasPendingSync && !isOfflineMode && onTap != null)
              TextButton(onPressed: onTap, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}
