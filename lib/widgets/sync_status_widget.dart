import 'package:flutter/material.dart';
import '../services/sync_engine.dart';

/// A widget that displays the current sync status.
///
/// Shows a small indicator in the app bar or elsewhere that displays
/// whether a sync is in progress, the last sync time, or any errors.
class SyncStatusWidget extends StatelessWidget {
  const SyncStatusWidget({
    super.key,
    this.compact = false,
    this.onTap,
  });

  /// Whether to show a compact version (just the icon).
  final bool compact;

  /// Callback when the widget is tapped.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<SyncStatus>(
      stream: SyncEngine.instance.syncStatusStream,
      initialData: SyncEngine.instance.currentStatus,
      builder: (context, snapshot) {
        final status = snapshot.data ?? SyncStatus.idle;
        final isSyncing = status == SyncStatus.syncing;
        final hasError = status == SyncStatus.error;

        if (compact) {
          return _buildCompactIcon(isSyncing, hasError);
        }

        return _buildFullWidget(context, isSyncing, hasError);
      },
    );
  }

  Widget _buildCompactIcon(bool isSyncing, bool hasError) {
    return IconButton(
      icon: isSyncing
          ? const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
              ),
            )
          : Icon(
              hasError ? Icons.sync_problem : Icons.sync,
              color: hasError ? Colors.red : null,
            ),
      onPressed: isSyncing ? null : () => SyncEngine.instance.syncAll(),
      tooltip: isSyncing
          ? 'Syncing...'
          : hasError
              ? 'Sync failed. Tap to retry.'
              : 'Sync now',
    );
  }

  Widget _buildFullWidget(BuildContext context, bool isSyncing, bool hasError) {
    final lastSync = SyncEngine.instance.lastSyncTime;
    String subtitle;
    if (isSyncing) {
      subtitle = 'Syncing...';
    } else if (hasError) {
      subtitle = 'Sync failed';
    } else if (lastSync != null) {
      final diff = DateTime.now().difference(lastSync);
      if (diff.inMinutes < 1) {
        subtitle = 'Just now';
      } else if (diff.inMinutes < 60) {
        subtitle = '${diff.inMinutes}m ago';
      } else if (diff.inHours < 24) {
        subtitle = '${diff.inHours}h ago';
      } else {
        subtitle = '${diff.inDays}d ago';
      }
    } else {
      subtitle = 'Never synced';
    }

    return InkWell(
      onTap: isSyncing ? null : () => SyncEngine.instance.syncAll(),
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (isSyncing)
              const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(Colors.blue),
                ),
              )
            else
              Icon(
                hasError ? Icons.sync_problem : Icons.sync,
                size: 16,
                color: hasError ? Colors.red : Colors.grey,
              ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  isSyncing ? 'Syncing' : hasError ? 'Sync Error' : 'Synced',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: hasError ? Colors.red : Colors.grey.shade700,
                  ),
                ),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 10,
                    color: Colors.grey.shade500,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// A floating sync button that appears when there are pending changes.
class SyncFloatingButton extends StatelessWidget {
  const SyncFloatingButton({
    super.key,
    required this.pendingCount,
    required this.isSyncing,
    this.onPressed,
  });

  /// Number of items pending sync.
  final int pendingCount;

  /// Whether a sync is currently in progress.
  final bool isSyncing;

  /// Callback when the button is pressed.
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    if (pendingCount == 0 && !isSyncing) return const SizedBox.shrink();

    return FloatingActionButton.small(
      onPressed: isSyncing ? null : onPressed,
      backgroundColor: isSyncing ? Colors.blue : Colors.orange,
      child: isSyncing
          ? const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
              ),
            )
          : Badge(
              label: Text('$pendingCount'),
              child: const Icon(Icons.sync, color: Colors.white),
            ),
    );
  }
}
