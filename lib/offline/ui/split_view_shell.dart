/// Responsive master/detail shell for the OFFLINE tier's desktop/tablet console.
///
/// Wide (>= [SplitViewShell.breakpoint]): a fixed-width master list on the left,
/// a `VerticalDivider`, and a detail pane on the right.
/// Narrow (< breakpoint): the master fills the screen and opening a detail is a
/// normal `Navigator.push`.
///
/// ---------------------------------------------------------------------------
/// 🔴 THREE RULES THIS FILE EXISTS TO ENFORCE
/// ---------------------------------------------------------------------------
/// 1. **`LayoutBuilder` on `constraints.maxWidth` — never `MediaQuery.size`, and
///    NEVER a platform check.** `Platform.isAndroid` hands a 12" tablet in
///    landscape the phone layout, and a Windows window dragged narrow keeps a
///    two-pane layout squeezed into 400px. The only thing that matters is how
///    much width this widget was actually given.
///
/// 2. **A detail open when the layout collapses must NOT vanish.** The user
///    resized a window; their open quotation disappearing looks like a crash
///    that ate their work. See [_SplitViewShellState._syncToNarrow] for the
///    chosen behaviour (documented there in full).
///
/// 3. **The detail pane is keyed by the selection.** Without a `Key` derived
///    from the selected record, Flutter re-uses the existing `State` when the
///    selection changes — so a `StatefulWidget` detail (the quotation editor)
///    keeps the PREVIOUS record's `TextEditingController` text and shows
///    customer A's data under customer B's heading. On a money screen that is
///    the single most dangerous bug a split view can have.
///
/// The shell is deliberately GENERIC: it imports no application screens. Compose
/// it with `QuotationListScreen` / `QuotationEditorScreen` from the call site.
library;

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

/// Signature handed to [SplitViewShell.masterBuilder].
///
/// Call [OpenDetail] with the widget to show. Optionally pass a [selectionKey]
/// so the shell can (a) key the detail pane and (b) tell the master which row is
/// currently selected for highlighting.
typedef OpenDetail = void Function(Widget detail, {Object? selectionKey});

/// Everything the master list needs to render itself correctly in both layouts.
@immutable
class SplitViewController {
  const SplitViewController({
    required this.isWide,
    required this.openDetail,
    required this.closeDetail,
    required this.selectionKey,
    required this.hasDetail,
  });

  /// `true` when the shell is rendering two panes.
  ///
  /// The master should show selection highlighting ONLY when this is true — in
  /// narrow mode the detail is a pushed route, so a highlighted row behind it
  /// is stale the moment the user pops back.
  final bool isWide;

  /// Opens [detail]. In wide mode it replaces the right pane; in narrow mode it
  /// performs a `Navigator.push`.
  final OpenDetail openDetail;

  /// Clears the right pane (wide) / pops the pushed route (narrow).
  final VoidCallback closeDetail;

  /// The `selectionKey` of the currently open detail, or `null`.
  /// Compare against your row id to drive highlighting.
  final Object? selectionKey;

  /// Whether a detail is currently open.
  final bool hasDetail;

  /// Convenience for row highlighting: `selected: c.isSelected(row.id)`.
  bool isSelected(Object? key) =>
      isWide && key != null && selectionKey != null && key == selectionKey;
}

/// Builds the left/master pane.
typedef SplitMasterBuilder = Widget Function(
  BuildContext context,
  SplitViewController controller,
);

/// Optional builder for the right/detail pane.
///
/// Receives whatever was handed to [OpenDetail] so the host can wrap it (padding,
/// a Card, a close button, a `Scaffold` of its own). Return [child] untouched if
/// no wrapping is wanted. When null, the raw widget is shown.
typedef SplitDetailBuilder = Widget Function(
  BuildContext context,
  Widget child,
  Object? selectionKey,
);

class SplitViewShell extends StatefulWidget {
  const SplitViewShell({
    super.key,
    required this.masterBuilder,
    required this.detailBuilder,
    required this.emptyDetail,
    this.breakpoint = 900,
    this.minMasterWidth = 320,
    this.maxMasterWidth = 420,
    this.masterWidthFraction = 0.35,
    this.onDetailClosed,
  });

  /// Builds the master list. Use the supplied [SplitViewController] to open a
  /// detail and to decide whether to render selection highlighting.
  final SplitMasterBuilder masterBuilder;

  /// Wraps the detail widget. Pass `(_, child, __) => child` when no wrapping is
  /// needed. Applied in BOTH layouts, so a wrapper stays consistent when a
  /// window is resized.
  final SplitDetailBuilder detailBuilder;

  /// Shown in the right pane when nothing is selected (wide mode only — in
  /// narrow mode there is no empty pane to fill).
  final Widget emptyDetail;

  /// Width at or above which the two-pane layout is used.
  final double breakpoint;

  /// Master pane clamp. ~35% of available width, never narrower than
  /// [minMasterWidth] nor wider than [maxMasterWidth]: a list of quotation rows
  /// stops being readable below ~320px and wastes the detail pane above ~420px.
  final double minMasterWidth;
  final double maxMasterWidth;
  final double masterWidthFraction;

  /// Fired whenever the detail is cleared (wide) or the pushed route pops
  /// (narrow). Useful for refreshing the master after an edit.
  final ValueChanged<Object?>? onDetailClosed;

  @override
  State<SplitViewShell> createState() => _SplitViewShellState();
}

class _SplitViewShellState extends State<SplitViewShell> {
  /// The currently open detail. Held in STATE (not merely on the navigator) so
  /// it survives a wide->narrow->wide resize round trip.
  Widget? _detail;
  Object? _selectionKey;

  /// Monotonic counter used to key the detail pane when the caller supplies no
  /// `selectionKey`. Guarantees a fresh subtree per open even for anonymous
  /// details — see rule 3 in the library doc.
  int _openCounter = 0;
  int _detailSerial = 0;

  /// Layout state as of the last build. Used to detect the wide<->narrow
  /// transition; a resize is NOT a rebuild-with-new-widget, so this cannot be
  /// done in `didUpdateWidget`.
  bool? _wasWide;

  /// Non-null while a detail is showing as a pushed route (narrow mode).
  /// Tracked so a narrow->wide resize can pop the route and re-home the same
  /// detail into the right pane instead of leaving it stranded on top.
  Route<void>? _pushedRoute;

  /// Serials whose route completion must NOT clear the detail.
  ///
  /// 🔴 `Navigator.removeRoute` COMPLETES the route: `_RouteEntry.complete()`
  /// calls `Route.didComplete()`, which resolves the future returned by
  /// `Navigator.push`. So the `.then` handler registered in [_pushDetail] fires
  /// for a programmatic removal exactly as it does for a user-driven pop —
  /// and would clear `_detail`, making the open record VANISH on a
  /// narrow->wide resize. Caught by widget test, not by the analyzer.
  final Set<int> _suppressClose = <int>{};

  bool get _hasDetail => _detail != null;

  // ---------------------------------------------------------------------------
  // Opening / closing
  // ---------------------------------------------------------------------------

  void _openDetail(bool isWide, Widget detail, {Object? selectionKey}) {
    _openCounter++;
    final int serial = _openCounter;

    setState(() {
      _detail = detail;
      _selectionKey = selectionKey;
      _detailSerial = serial;
    });

    if (!isWide) {
      _pushDetail(serial);
    }
  }

  void _pushDetail(int serial) {
    final Widget? detail = _detail;
    if (detail == null) return;

    final NavigatorState navigator = Navigator.of(context);
    final Object? key = _selectionKey;

    final MaterialPageRoute<void> route = MaterialPageRoute<void>(
      builder: (BuildContext ctx) => KeyedSubtree(
        // Same keying rule as the wide pane: a pushed detail must never
        // re-use another record's State either.
        key: ValueKey<String>('offline-split-detail-$serial'),
        child: widget.detailBuilder(ctx, detail, key),
      ),
    );
    _pushedRoute = route;

    navigator.push(route).then((_) {
      // Fires for a real user pop AND for a programmatic `removeRoute`.
      // A removal we initiated (re-homing into the wide pane) must be ignored,
      // or widening the window silently discards the open record.
      if (_suppressClose.remove(serial)) return;
      if (!mounted) return;
      // Only clear if this route is still the live one. A fast
      // open -> open -> pop sequence must not wipe a newer selection.
      if (_detailSerial != serial) return;
      _pushedRoute = null;
      setState(() {
        _detail = null;
        _selectionKey = null;
      });
      widget.onDetailClosed?.call(key);
    });
  }

  void _closeDetail(bool isWide) {
    if (!_hasDetail) return;
    final Object? key = _selectionKey;

    if (!isWide && _pushedRoute != null) {
      // Suppress the push handler: we clear the state (and fire onDetailClosed)
      // right here, and a second pass would fire the callback twice.
      _suppressClose.add(_detailSerial);
      Navigator.of(context).removeRoute(_pushedRoute!);
      _pushedRoute = null;
    }

    setState(() {
      _detail = null;
      _selectionKey = null;
    });
    widget.onDetailClosed?.call(key);
  }

  // ---------------------------------------------------------------------------
  // 🔴 Layout transitions — rule 2
  // ---------------------------------------------------------------------------

  /// WIDE -> NARROW with a detail open.
  ///
  /// **Decision: PUSH the open detail as a route.**
  ///
  /// The alternatives were:
  ///   (a) drop the detail          — REJECTED. This is the actual bug being
  ///       fixed: the user drags a window narrower and the quotation they were
  ///       editing silently disappears. On a `StatefulWidget` editor that also
  ///       destroys unsaved `TextEditingController` text with no warning.
  ///   (b) show the detail INSTEAD of the master, with no route
  ///                                — REJECTED. There is then no back affordance
  ///       that returns to the list; Android back would leave the whole screen.
  ///   (c) push it as a route       — CHOSEN. The detail stays fully alive, the
  ///       system back button and gesture behave exactly as they do for a detail
  ///       opened natively in narrow mode, and the master is intact underneath.
  ///
  /// The pushed subtree keeps the SAME `_detailSerial` key, so widget State is
  /// preserved across the transition — the editor's typed text survives the
  /// resize.
  void _syncToNarrow() {
    if (!_hasDetail) return;
    if (_pushedRoute != null) return; // already routed
    // Deferred: we are inside build/layout, and Navigator.push must not run
    // during a layout pass.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (_pushedRoute != null || !_hasDetail) return;
      _pushDetail(_detailSerial);
    });
  }

  /// NARROW -> WIDE with a detail pushed.
  ///
  /// Remove the route and let the same detail render in the right pane. Without
  /// this the user widens the window and the two-pane layout appears *behind* a
  /// full-screen detail route — the master is visible for a frame and then
  /// covered, which reads as a rendering glitch.
  void _syncToWide() {
    final Route<void>? route = _pushedRoute;
    if (route == null) return;
    _pushedRoute = null;

    // Mark this serial BEFORE the removal so the push completion handler knows
    // the close was ours and must not clear the detail. See [_suppressClose].
    _suppressClose.add(_detailSerial);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        _suppressClose.clear();
        return;
      }
      final NavigatorState navigator = Navigator.of(context);
      if (route.isActive) {
        navigator.removeRoute(route);
      } else {
        _suppressClose.remove(_detailSerial);
      }
      if (mounted) setState(() {});
    });
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        // The ONLY layout signal. Not MediaQuery, not Platform.
        final bool isWide = constraints.maxWidth >= widget.breakpoint;

        if (_wasWide != null && _wasWide != isWide) {
          if (isWide) {
            _syncToWide();
          } else {
            _syncToNarrow();
          }
        }
        _wasWide = isWide;

        final SplitViewController controller = SplitViewController(
          isWide: isWide,
          openDetail: (Widget detail, {Object? selectionKey}) =>
              _openDetail(isWide, detail, selectionKey: selectionKey),
          closeDetail: () => _closeDetail(isWide),
          selectionKey: isWide ? _selectionKey : null,
          hasDetail: _hasDetail,
        );

        final Widget master = widget.masterBuilder(context, controller);

        // PopScope<bool>: in wide mode, back clears the selection first so the
        // user is not thrown out of the console by a single back press while a
        // record is open. `onPopInvoked` is deprecated — this is the generic
        // `onPopInvokedWithResult` form.
        final bool interceptBack = isWide && _hasDetail;

        final Widget body = isWide
            ? _buildWide(context, constraints, master)
            : master;

        return PopScope<bool>(
          canPop: !interceptBack,
          onPopInvokedWithResult: (bool didPop, bool? result) {
            if (didPop) return;
            _closeDetail(true);
          },
          child: body,
        );
      },
    );
  }

  Widget _buildWide(
    BuildContext context,
    BoxConstraints constraints,
    Widget master,
  ) {
    final ThemeData theme = Theme.of(context);

    final double masterWidth = (constraints.maxWidth * widget.masterWidthFraction)
        .clamp(widget.minMasterWidth, widget.maxMasterWidth)
        .toDouble();

    final Widget detailChild = _hasDetail
        ? widget.detailBuilder(context, _detail!, _selectionKey)
        : widget.emptyDetail;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        SizedBox(width: masterWidth, child: master),
        VerticalDivider(
          width: 1,
          thickness: 1,
          color: theme.dividerColor.withValues(alpha: 0.5),
        ),
        Expanded(
          child: KeyedSubtree(
            // 🔴 RULE 3. Keying by the selection forces a full rebuild of the
            // pane when the record changes, so a StatefulWidget detail cannot
            // carry the previous record's controllers/scroll offset over.
            // Anonymous opens fall back to the serial, which is still unique.
            key: ValueKey<String>(
              _hasDetail
                  ? 'offline-split-detail-'
                      '${_selectionKey ?? ''}-$_detailSerial'
                  : 'offline-split-detail-empty',
            ),
            child: detailChild,
          ),
        ),
      ],
    );
  }
}

/// A calm placeholder for [SplitViewShell.emptyDetail].
///
/// Restrained animation only: a single 180ms fade on first appearance. Anything
/// that animates on every layout pass turns a window drag into a slideshow,
/// because a resize rebuilds this subtree on every frame of the drag.
class SplitViewEmptyDetail extends StatelessWidget {
  const SplitViewEmptyDetail({
    super.key,
    this.icon = Icons.description_outlined,
    this.title = 'Nothing selected',
    this.message = 'Choose an item from the list to see it here.',
  });

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Color faded =
        theme.colorScheme.onSurface.withValues(alpha: 0.45);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(icon, size: 48, color: faded),
            const SizedBox(height: 16),
            Text(
              title,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium?.copyWith(color: faded),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withValues(alpha: 0.35),
              ),
            ),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 180.ms);
  }
}
