import 'package:flutter/material.dart';

/// An indicator widget that shows the current offline/online status.
///
/// Displays a small banner at the top of the screen when the device is offline.
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
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: Colors.orange.shade700,
      child: Row(
        children: [
          const Icon(Icons.wifi_off, color: Colors.white, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A banner-style offline indicator with more prominence.
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
      message = hasPendingSync
          ? 'Offline • $pendingSyncCount items pending sync'
          : 'You are offline';
      bgColor = Colors.orange.shade700;
      icon = Icons.wifi_off;
    } else if (hasPendingSync) {
      message = '$pendingSyncCount items pending sync';
      bgColor = Colors.blue.shade700;
      icon = Icons.sync;
    } else {
      return const SizedBox.shrink();
    }

    return Material(
      color: bgColor,
      child: InkWell(
        onTap: onTap,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              Icon(icon, color: Colors.white, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  message,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              if (hasPendingSync && !isOfflineMode)
                const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                  ),
                ),
              if (hasPendingSync && isOfflineMode)
                const Icon(Icons.cloud_off, color: Colors.white, size: 16),
            ],
          ),
        ),
      ),
    );
  }
}
