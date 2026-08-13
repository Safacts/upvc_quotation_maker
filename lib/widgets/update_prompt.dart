import 'dart:async';

import 'package:flutter/material.dart';

import '../services/auto_update_service.dart';

/// Listens to [AutoUpdateService] events and surfaces the in-app update flow
/// as dialogs. Renders nothing itself — mount it once in the dashboard Scaffold
/// (e.g. as the first child of the body Column).
///
/// Behaviour:
/// - [UpdateAvailableEvent] → "Update available" dialog with release notes,
///   [Update Now] + [Later]. When `forceUpdate` is set the dialog is
///   non-dismissable (no barrier dismiss, no back button, no "Later").
/// - [Update Now] → progress dialog fed by [DownloadProgressEvent].
/// - [InstallTriggeredEvent] → progress dialog closes (system installer owns
///   the screen from here).
/// - Download/install failures → dialog closes + a SnackBar.
///
/// Android only — the service itself never emits on web, so this widget is a
/// no-op there.
class UpdatePrompt extends StatefulWidget {
  const UpdatePrompt({super.key});

  @override
  State<UpdatePrompt> createState() => _UpdatePromptState();
}

class _UpdatePromptState extends State<UpdatePrompt> {
  StreamSubscription<AutoUpdateEvent>? _sub;

  UpdateInfo? _activeInfo;
  bool _dialogOpen = false;
  bool _installing = false;
  double _progress = 0;
  void Function(void Function())? _refreshDialog;

  @override
  void initState() {
    super.initState();
    _sub = AutoUpdateService.instance.events.listen(_onEvent);
    // A pending update may already exist if one was found while this dashboard
    // instance was being built.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final pending = AutoUpdateService.instance.pendingUpdate;
      if (pending != null && mounted) _showUpdateDialog(pending);
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  void _onEvent(AutoUpdateEvent event) {
    if (event is UpdateAvailableEvent) {
      _showUpdateDialog(event.info);
    } else if (event is DownloadProgressEvent) {
      _progress = event.total > 0 ? event.downloaded / event.total : 0;
      _refreshDialog?.call(() {});
    } else if (event is InstallTriggeredEvent) {
      _closeDialog();
    } else if (event is DownloadFailedEvent) {
      _closeDialog();
      _toast('Update download failed: ${event.message}');
    } else if (event is InstallFailedEvent) {
      _closeDialog();
      _toast('Update install failed: ${event.message}');
    }
  }

  void _showUpdateDialog(UpdateInfo info) {
    if (_dialogOpen || !mounted) return;
    _dialogOpen = true;
    _activeInfo = info;
    _installing = false;
    _progress = 0;

    final force = info.forceUpdate;
    showDialog<void>(
      context: context,
      barrierDismissible: !force,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (dialogContext, setDialogState) {
            _refreshDialog = setDialogState;
            return PopScope(
              canPop: !_installing && !force,
              child: AlertDialog(
                title: Text(_installing ? 'Updating app…' : 'Update available'),
                content: _installing ? _buildProgress(info) : _buildInfo(force),
                actions: _installing ? const [] : _buildActions(force),
              ),
            );
          },
        );
      },
    ).whenComplete(() {
      _dialogOpen = false;
      _installing = false;
      _refreshDialog = null;
    });
  }

  Widget _buildInfo(bool force) {
    final info = _activeInfo!;
    return SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Version v${info.versionName} is ready to install.'),
          if (info.releaseNotes.trim().isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              "What's new:",
              style: TextStyle(fontWeight: FontWeight.bold, color: Theme.of(context).colorScheme.primary),
            ),
            const SizedBox(height: 4),
            Text(info.releaseNotes),
          ],
          if (force) ...[
            const SizedBox(height: 12),
            Text(
              'This update is required. You cannot continue using the app until it is installed.',
              style: TextStyle(color: Theme.of(context).colorScheme.error, fontWeight: FontWeight.w500),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildProgress(UpdateInfo info) {
    return Row(
      children: [
        const SizedBox(width: 36, height: 36, child: CircularProgressIndicator()),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Downloading v${info.versionName}…'),
              const SizedBox(height: 8),
              LinearProgressIndicator(
                value: _progress > 0 ? _progress : null,
                minHeight: 4,
                borderRadius: BorderRadius.circular(2),
              ),
              if (_progress > 0) ...[
                const SizedBox(height: 4),
                Text('${(_progress * 100).toStringAsFixed(0)}%'),
              ],
            ],
          ),
        ),
      ],
    );
  }

  List<Widget> _buildActions(bool force) {
    return [
      if (!force)
        TextButton(
          onPressed: () {
            // "Later" silences this version until a newer one ships.
            AutoUpdateService.instance.dismissPending();
            _closeDialog();
          },
          child: const Text('Later'),
        ),
      FilledButton(
        onPressed: _startInstall,
        child: const Text('Update Now'),
      ),
    ];
  }

  void _startInstall() {
    _installing = true;
    _progress = 0;
    _refreshDialog?.call(() {});
    AutoUpdateService.instance.downloadAndInstall();
  }

  void _closeDialog() {
    if (_dialogOpen && mounted) {
      Navigator.of(context, rootNavigator: true).pop();
    }
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
