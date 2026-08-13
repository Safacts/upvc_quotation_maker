import 'package:flutter/material.dart';
import '../services/sync_engine.dart';

/// A compact sync status indicator for the dashboard header.
///
/// Shows a colored dot + text: green "Synced just now", yellow "Syncing...",
/// or red "Sync error". Tap to retry.
class SyncIndicator extends StatelessWidget {
  const SyncIndicator({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<SyncStatus>(
      stream: SyncEngine.instance.syncStatusStream,
      initialData: SyncEngine.instance.currentStatus,
      builder: (context, snapshot) {
        final status = snapshot.data ?? SyncStatus.idle;
        final isSyncing = status == SyncStatus.syncing;
        final hasError = status == SyncStatus.error;
        final lastSync = SyncEngine.instance.lastSyncTime;

        String label;
        Color dotColor;

        if (isSyncing) {
          label = 'Syncing...';
          dotColor = Colors.amber;
        } else if (hasError) {
          label = 'Sync error';
          dotColor = Colors.red;
        } else if (lastSync != null) {
          final diff = DateTime.now().difference(lastSync);
          if (diff.inMinutes < 1) {
            label = 'Synced just now';
          } else if (diff.inMinutes < 60) {
            label = 'Synced ${diff.inMinutes}m ago';
          } else if (diff.inHours < 24) {
            label = 'Synced ${diff.inHours}h ago';
          } else {
            label = 'Synced ${diff.inDays}d ago';
          }
          dotColor = Colors.green;
        } else {
          label = 'Never synced';
          dotColor = Colors.grey;
        }

        return InkWell(
          onTap: isSyncing ? null : () => SyncEngine.instance.syncAll(),
          borderRadius: BorderRadius.circular(16),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: dotColor.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (isSyncing)
                  const SizedBox(
                    width: 8,
                    height: 8,
                    child: CircularProgressIndicator(strokeWidth: 1.5),
                  )
                else
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
                  ),
                const SizedBox(width: 6),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: dotColor.withValues(alpha: 0.8),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
