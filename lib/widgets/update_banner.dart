import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:toastification/toastification.dart';

import '../services/update_checker_service.dart';

/// A dismissible, non-intrusive banner shown when the server has newer content
/// (products, pricing, terms, bank details, branding) than this device.
///
/// Structural sibling of `OfflineBanner` and `SyncStatusWidget`: same
/// full-width strip, same icon + message + trailing action layout, same
/// "collapse to `SizedBox.shrink()` when there is nothing to say" contract.
///
/// Unlike `lib/update_checker.dart` (which prompts for a new APK), this banner
/// is about *content* and applies in place — no reinstall.
class UpdateBanner extends StatefulWidget {
  const UpdateBanner({
    super.key,
    required this.clientId,
    this.onApplied,
  });

  /// The tenant this banner is checking for. Required — never global.
  final String clientId;

  /// Optional callback fired after a successful apply, so the host screen can
  /// refresh whatever it renders from the synced content.
  final VoidCallback? onApplied;

  @override
  State<UpdateBanner> createState() => _UpdateBannerState();
}

enum _BannerPhase { idle, applying, success, failure }

class _UpdateBannerState extends State<UpdateBanner> {
  final UpdateCheckerService _service = UpdateCheckerService.instance;

  _BannerPhase _phase = _BannerPhase.idle;

  static const Color _vitharnOrange = Color(0xFFF97316);
  static const Color _vitharnDark = Color(0xFF1E293B);
  static const Color _successGreen = Color(0xFF16A34A);
  static const Color _failureRed = Color(0xFFDC2626);

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<UpdateCheckResult>(
      stream: _service.updatesStream,
      initialData: _service.lastResult,
      builder: (context, snapshot) {
        // Keep showing the success/failure strip briefly even once the
        // underlying result has cleared.
        final showsOutcome =
            _phase == _BannerPhase.success || _phase == _BannerPhase.failure;

        if (!showsOutcome && !_service.shouldShowBanner) {
          return const SizedBox.shrink();
        }

        final result = snapshot.data;
        return _buildBanner(context, result)
            .animate()
            .fade(duration: 250.ms)
            .slideY(begin: -0.35, curve: Curves.easeOutCubic);
      },
    );
  }

  Widget _buildBanner(BuildContext context, UpdateCheckResult? result) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    late final Color background;
    late final IconData icon;
    late final String message;

    switch (_phase) {
      case _BannerPhase.applying:
        background = isDark ? _vitharnDark : _vitharnOrange;
        icon = Icons.cloud_download_outlined;
        message = 'Updating content...';
        break;
      case _BannerPhase.success:
        background = _successGreen;
        icon = Icons.check_circle_outline;
        message = 'Content updated';
        break;
      case _BannerPhase.failure:
        background = _failureRed;
        icon = Icons.error_outline;
        message = 'Update failed. Tap retry.';
        break;
      case _BannerPhase.idle:
        background = isDark ? _vitharnDark : _vitharnOrange;
        icon = Icons.system_update_alt;
        final summary = result?.summary ?? '';
        message = summary.isEmpty
            ? 'New content is available'
            : 'New content available: $summary';
        break;
    }

    return Material(
      color: background,
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
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            const SizedBox(width: 8),
            _buildTrailing(),
          ],
        ),
      ),
    );
  }

  Widget _buildTrailing() {
    if (_phase == _BannerPhase.applying) {
      return const SizedBox(
        width: 18,
        height: 18,
        child: CircularProgressIndicator(
          strokeWidth: 2,
          valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
        ),
      );
    }

    if (_phase == _BannerPhase.success) {
      return _dismissButton();
    }

    final actionLabel = _phase == _BannerPhase.failure ? 'RETRY' : 'UPDATE NOW';

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        TextButton(
          onPressed: _applyUpdates,
          style: TextButton.styleFrom(
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            minimumSize: Size.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
              side: const BorderSide(color: Color(0x66FFFFFF)),
            ),
          ),
          child: Text(
            actionLabel,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
            ),
          ),
        ),
        _dismissButton(),
      ],
    );
  }

  Widget _dismissButton() {
    return IconButton(
      onPressed: _dismiss,
      icon: const Icon(Icons.close, color: Colors.white, size: 16),
      splashRadius: 16,
      constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
      padding: EdgeInsets.zero,
      tooltip: 'Dismiss',
    );
  }

  Future<void> _applyUpdates() async {
    if (_phase == _BannerPhase.applying) return;
    setState(() => _phase = _BannerPhase.applying);

    final ok = await _service.applyUpdates(clientId: widget.clientId);
    if (!mounted) return;

    setState(() => _phase = ok ? _BannerPhase.success : _BannerPhase.failure);

    if (ok) {
      toastification.show(
        context: context,
        title: const Text('Content updated'),
        description: const Text('Your catalog and settings are now current.'),
        type: ToastificationType.success,
        style: ToastificationStyle.fillColored,
        autoCloseDuration: const Duration(seconds: 3),
        alignment: Alignment.bottomCenter,
      );
      widget.onApplied?.call();

      // Fade the success strip out after a beat.
      await Future<void>.delayed(const Duration(seconds: 3));
      if (!mounted) return;
      setState(() => _phase = _BannerPhase.idle);
    } else {
      toastification.show(
        context: context,
        title: const Text('Update failed'),
        description: const Text('Could not fetch the latest content. Check your connection and retry.'),
        type: ToastificationType.error,
        style: ToastificationStyle.fillColored,
        autoCloseDuration: const Duration(seconds: 5),
        alignment: Alignment.bottomCenter,
      );
    }
  }

  Future<void> _dismiss() async {
    await _service.dismissCurrentUpdates();
    if (!mounted) return;
    setState(() => _phase = _BannerPhase.idle);
  }
}

/// A compact app-bar affordance that surfaces pending content updates without
/// taking a full-width strip. Mirrors `SyncStatusWidget(compact: true)`.
class UpdateAvailableIcon extends StatelessWidget {
  const UpdateAvailableIcon({
    super.key,
    required this.clientId,
    this.onPressed,
  });

  /// The tenant this indicator is checking for.
  final String clientId;

  /// Override the default action (which applies updates immediately).
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final service = UpdateCheckerService.instance;

    return StreamBuilder<UpdateCheckResult>(
      stream: service.updatesStream,
      initialData: service.lastResult,
      builder: (context, snapshot) {
        if (!service.hasPendingUpdates) return const SizedBox.shrink();

        return IconButton(
          tooltip: 'New content available',
          onPressed: onPressed ??
              () => service.applyUpdates(clientId: clientId),
          icon: Badge(
            smallSize: 8,
            backgroundColor: const Color(0xFFF97316),
            child: const Icon(Icons.system_update_alt),
          ),
        )
            .animate(onPlay: (c) => c.repeat(reverse: true))
            .fade(begin: 0.75, end: 1.0, duration: 1200.ms);
      },
    );
  }
}
