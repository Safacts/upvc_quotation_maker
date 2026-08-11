/// OFFLINE TIER — REPORTS / ANALYTICS SCREEN.
///
/// ZERO-SERVER CONTRACT: no `supabase_flutter`, no `http`, no `connectivity_plus`,
/// no `lib/services/**`. See `lib/offline/core/models.dart` for the full rule.
///
/// Six tabs (Summary / Trend / Customers / Products / Outstanding / GST) over
/// a shared date range. All figures come from [ReportService], which aggregates
/// in SQLite — this screen never folds rows in Dart.
library;

import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';

import '../branding/brand_service.dart';
import '../core/models.dart';
import 'report_service.dart';

// ---------------------------------------------------------------------------
// Date-range presets. Indian financial year starts 1 April.
// ---------------------------------------------------------------------------

enum _DatePreset { thisMonth, lastMonth, thisFy, lastFy, allTime, custom }

extension _DatePresetX on _DatePreset {
  String get label => switch (this) {
        _DatePreset.thisMonth => 'This Month',
        _DatePreset.lastMonth => 'Last Month',
        _DatePreset.thisFy => 'This FY',
        _DatePreset.lastFy => 'Last FY',
        _DatePreset.allTime => 'All Time',
        _DatePreset.custom => 'Custom',
      };
}

/// Computes the (from, to) bounds for [preset] relative to [now].
/// "This FY" for any date on/after 1 Apr is Apr-1 of the current year to
/// Mar-31 of the next year; before 1 Apr it is Apr-1 of the previous year to
/// Mar-31 of the current year. `null` bounds mean "no filter" (All Time).
({DateTime? from, DateTime? to}) _boundsFor(_DatePreset preset, DateTime now) {
  switch (preset) {
    case _DatePreset.thisMonth:
      return (
        from: DateTime(now.year, now.month, 1),
        to: DateTime(now.year, now.month + 1, 0),
      );
    case _DatePreset.lastMonth:
      return (
        from: DateTime(now.year, now.month - 1, 1),
        to: DateTime(now.year, now.month, 0),
      );
    case _DatePreset.thisFy:
      if (now.month >= 4) {
        return (from: DateTime(now.year, 4, 1), to: DateTime(now.year + 1, 3, 31));
      }
      return (from: DateTime(now.year - 1, 4, 1), to: DateTime(now.year, 3, 31));
    case _DatePreset.lastFy:
      if (now.month >= 4) {
        return (from: DateTime(now.year - 1, 4, 1), to: DateTime(now.year, 3, 31));
      }
      return (
        from: DateTime(now.year - 2, 4, 1),
        to: DateTime(now.year - 1, 3, 31),
      );
    case _DatePreset.allTime:
      return (from: null, to: null);
    case _DatePreset.custom:
      // Custom ranges are stored on the state; this helper is not used for them.
      return (from: null, to: null);
  }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  static final _service = ReportService();

  _DatePreset _preset = _DatePreset.thisMonth;
  DateTime? _customFrom;
  DateTime? _customTo;

  // Stale-query guard: bumped on every range change; every await bails if it
  // changed while we were waiting, so a fast tap-tap-tap can't repaint with
  // results for a range the user has already moved past.
  int _queryEpoch = 0;

  bool _loading = true;
  String? _error;

  SalesSummary? _summary;
  List<MonthlyPoint>? _trend;
  List<CustomerReportRow>? _customers;
  List<ProductReportRow>? _products;
  List<OutstandingRow>? _outstanding;
  GstSummary? _gst;

  // ---- current range -------------------------------------------------------

  ({DateTime? from, DateTime? to}) get _range {
    if (_preset == _DatePreset.custom) {
      return (from: _customFrom, to: _customTo);
    }
    return _boundsFor(_preset, DateTime.now());
  }

  bool get _isAllTime => _preset == _DatePreset.allTime;

  // ---- lifecycle -----------------------------------------------------------

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  // ---- data loading --------------------------------------------------------

  Future<void> _loadAll() async {
    final epoch = ++_queryEpoch;
    final range = _range;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final results = await Future.wait([
        _service.salesSummary(from: range.from, to: range.to),
        _service.monthlyTrend(),
        _service.topCustomers(from: range.from, to: range.to),
        _service.topProducts(from: range.from, to: range.to),
        _service.outstanding(),
        _service.gstSummary(from: range.from, to: range.to),
      ]);

      if (!mounted || epoch != _queryEpoch) return;
      setState(() {
        _summary = results[0] as SalesSummary;
        _trend = results[1] as List<MonthlyPoint>;
        _customers = results[2] as List<CustomerReportRow>;
        _products = results[3] as List<ProductReportRow>;
        _outstanding = results[4] as List<OutstandingRow>;
        _gst = results[5] as GstSummary;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || epoch != _queryEpoch) return;
      setState(() {
        _error = '$e';
        _loading = false;
      });
    }
  }

  // ---- preset selection ----------------------------------------------------

  void _onPreset(_DatePreset preset) {
    if (preset == _DatePreset.custom) {
      _pickCustomRange();
      return;
    }
    if (preset == _preset) return;
    setState(() => _preset = preset);
    _loadAll();
  }

  Future<void> _pickCustomRange() async {
    final now = DateTime.now();
    final initial = _customFrom != null && _customTo != null
        ? DateTimeRange(start: _customFrom!, end: _customTo!)
        : DateTimeRange(
            start: DateTime(now.year, now.month, 1),
            end: DateTime(now.year, now.month + 1, 0),
          );
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime(now.year + 2),
      initialDateRange: initial,
    );
    if (picked == null) return;
    if (!mounted) return;
    setState(() {
      _preset = _DatePreset.custom;
      _customFrom = picked.start;
      _customTo = picked.end;
    });
    _loadAll();
  }

  String get _rangeLabel {
    if (_preset == _DatePreset.custom &&
        _customFrom != null &&
        _customTo != null) {
      return '${formatQuoteDate(_customFrom!)} – ${formatQuoteDate(_customTo!)}';
    }
    return _preset.label;
  }

  // ---- build ---------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 6,
      child: ListenableBuilder(
        listenable: BrandService.instance,
        builder: (context, _) {
          final brand = BrandService.instance.config;
          final title = brand.companyName.trim().isEmpty
              ? 'Reports'
              : '${brand.companyName.trim()} · Reports';
          return Scaffold(
            appBar: AppBar(
              title: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              actions: [
                PopupMenuButton<_DatePreset>(
                  tooltip: 'Date range',
                  onSelected: _onPreset,
                  itemBuilder: (context) => [
                    for (final p in _DatePreset.values)
                      PopupMenuItem<_DatePreset>(
                        value: p,
                        child: Row(
                          children: [
                            Icon(
                              p == _preset
                                  ? Icons.radio_button_checked
                                  : Icons.radio_button_unchecked,
                              size: 18,
                            ),
                            const SizedBox(width: 8),
                            Text(p.label),
                          ],
                        ),
                      ),
                  ],
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Center(
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.date_range, size: 18),
                          const SizedBox(width: 6),
                          Text(_rangeLabel),
                          const Icon(Icons.arrow_drop_down),
                        ],
                      ),
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.refresh),
                  tooltip: 'Refresh',
                  onPressed: _loadAll,
                ),
              ],
              bottom: const TabBar(
                isScrollable: true,
                tabs: [
                  Tab(text: 'Summary'),
                  Tab(text: 'Trend'),
                  Tab(text: 'Customers'),
                  Tab(text: 'Products'),
                  Tab(text: 'Outstanding'),
                  Tab(text: 'GST'),
                ],
              ),
            ),
            body: SafeArea(child: _buildBody()),
          );
        },
      ),
    );
  }

  Widget _buildBody() {
    if (_loading && _summary == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _summary == null) {
      return _ErrorView(message: _error!, onRetry: _loadAll);
    }
    final summary = _summary;
    if (summary == null) {
      return _ErrorView(message: 'Could not load reports.', onRetry: _loadAll);
    }

    return TabBarView(
      children: [
        _SummaryTab(summary: summary, isAllTime: _isAllTime, onLoad: _loadAll),
        _TrendTab(trend: _trend ?? const []),
        _CustomersTab(rows: _customers ?? const [], isAllTime: _isAllTime),
        _ProductsTab(rows: _products ?? const [], isAllTime: _isAllTime),
        _OutstandingTab(rows: _outstanding ?? const []),
        _GstTab(summary: _gst ?? const GstSummary(taxableValue: 0, gstAmount: 0, totalWithGst: 0, quotationCount: 0), isAllTime: _isAllTime),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Empty-state helper — distinguishes "no data ever" from "none in range".
// ---------------------------------------------------------------------------

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.icon,
    required this.title,
    required this.body,
    this.onClearFilters,
  });

  final IconData icon;
  final String title;
  final String body;
  final VoidCallback? onClearFilters;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 56, color: Colors.grey.withValues(alpha: 0.5)),
            const SizedBox(height: 16),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              body,
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey.withValues(alpha: 0.8)),
            ),
            if (onClearFilters != null) ...[
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: onClearFilters,
                icon: const Icon(Icons.filter_alt_off),
                label: const Text('Clear filters'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.red),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Shared row animator — fade+slideY 200ms, stagger only the first 8 rows.
// ---------------------------------------------------------------------------

Widget _animateRow(int index, Widget child) {
  final delay = index < 8 ? (index * 25).ms : 0.ms;
  return child
      .animate()
      .fadeIn(duration: 200.ms, delay: delay)
      .slideY(begin: 0.08, duration: 200.ms, delay: delay);
}

// ---------------------------------------------------------------------------
// Summary tab
// ---------------------------------------------------------------------------

class _SummaryTab extends StatelessWidget {
  const _SummaryTab({
    required this.summary,
    required this.isAllTime,
    required this.onLoad,
  });

  final SalesSummary summary;
  final bool isAllTime;
  final VoidCallback onLoad;

  @override
  Widget build(BuildContext context) {
    if (summary.totalCount == 0) {
      return _EmptyState(
        icon: Icons.assessment_outlined,
        title: isAllTime ? 'No quotations yet' : 'No quotations in this range',
        body: isAllTime
            ? 'Create your first quotation to see your business insights here.'
            : 'Try a wider date range or clear the filter.',
        onClearFilters: isAllTime ? null : onLoad,
      );
    }

    return RefreshIndicator(
      onRefresh: () async => onLoad(),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          _summaryKpi('Total Quotations', '${summary.totalCount}'),
          const SizedBox(height: 8),
          _summaryKpi('Pipeline Value', formatInr(summary.totalValue)),
          const SizedBox(height: 8),
          _summaryKpi('Average Quotation', formatInr(summary.averageValue)),
          const SizedBox(height: 8),
          _summaryKpi(
            'Win Rate',
            summary.winRate == null ? '—' : '${summary.winRate!.toStringAsFixed(0)}%',
          ),
          const SizedBox(height: 8),
          _summaryKpi('Received', formatInr(summary.received)),
          const SizedBox(height: 8),
          _summaryKpi('Outstanding', formatInr(summary.outstanding)),
          const SizedBox(height: 16),
          const _SectionTitle('By status'),
          const SizedBox(height: 8),
          ..._statusRows(),
        ],
      ),
    );
  }

  List<Widget> _statusRows() {
    final tiles = <_StatusTile>[
      _StatusTile('Draft', OfflineQuotationStatus.draft.value, Icons.edit_note, Colors.blueGrey),
      _StatusTile('Sent', OfflineQuotationStatus.sent.value, Icons.send_outlined, Colors.blue),
      _StatusTile('Won', OfflineQuotationStatus.won.value, Icons.check_circle_outline, Colors.green),
      _StatusTile('Lost', OfflineQuotationStatus.lost.value, Icons.cancel_outlined, Colors.red),
    ];
    var index = 0;
    return [
      for (final t in tiles)
        _animateRow(
          index++,
          _StatusKpi(
            label: t.label,
            count: summary.countByStatus[t.status] ?? 0,
            value: formatInr(summary.valueByStatus[t.status] ?? 0),
            icon: t.icon,
            color: t.color,
          ),
        ),
    ];
  }
}

class _StatusTile {
  const _StatusTile(this.label, this.status, this.icon, this.color);
  final String label;
  final String status;
  final IconData icon;
  final Color color;
}

class _SummaryKpi extends StatelessWidget {
  const _SummaryKpi({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.grey.withValues(alpha: 0.2)),
      ),
      child: ListTile(
        title: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
        trailing: Text(
          value,
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
        ),
      ),
    );
  }
}

Widget _summaryKpi(String label, String value) => _SummaryKpi(label: label, value: value);

class _StatusKpi extends StatelessWidget {
  const _StatusKpi({
    required this.label,
    required this.count,
    required this.value,
    required this.icon,
    required this.color,
  });

  final String label;
  final int count;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.grey.withValues(alpha: 0.2)),
      ),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: color.withValues(alpha: 0.12),
          child: Icon(icon, color: color),
        ),
        title: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text('$count quotation${count == 1 ? '' : 's'}'),
        trailing: Text(
          value,
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.title);
  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
    );
  }
}

// ---------------------------------------------------------------------------
// Trend tab — bar chart (quoted) with a line overlay (received).
// ---------------------------------------------------------------------------

class _TrendTab extends StatelessWidget {
  const _TrendTab({required this.trend});
  final List<MonthlyPoint> trend;

  @override
  Widget build(BuildContext context) {
    if (trend.every((p) => p.quotedValue == 0 && p.receivedValue == 0)) {
      return const _EmptyState(
        icon: Icons.show_chart,
        title: 'No sales yet',
        body: 'Once you log a few quotations, your monthly trend appears here.',
      );
    }

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: Colors.grey.withValues(alpha: 0.2)),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Quoted vs received',
                    style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Row(
                  children: [
                    _legend(const Color(0xFF3F51B5), 'Quoted'),
                    const SizedBox(width: 16),
                    _legend(const Color(0xFF2E7D32), 'Received'),
                  ],
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 220,
                  width: double.infinity,
                  child: CustomPaint(
                    painter: _TrendPainter(trend),
                  ),
                ),
              ],
            ),
          ),
        ).animate().fadeIn(duration: 200.ms),
        const SizedBox(height: 16),
        ..._trendTable(),
      ],
    );
  }

  Widget _legend(Color color, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3)),
        ),
        const SizedBox(width: 6),
        Text(label, style: const TextStyle(fontSize: 12)),
      ],
    );
  }

  List<Widget> _trendTable() {
    var i = 0;
    return [
      for (final p in trend)
        _animateRow(
          i++,
          Card(
            elevation: 0,
            margin: const EdgeInsets.only(bottom: 6),
            child: ListTile(
              dense: true,
              title: Text(DateFormat('MMMM yyyy').format(p.month),
                  style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text(
                  '${p.quotationCount} quotation${p.quotationCount == 1 ? '' : 's'}'),
              trailing: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(formatInr(p.quotedValue),
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                  Text(
                    'rec. ${formatInr(p.receivedValue)}',
                    style: const TextStyle(fontSize: 11, color: Colors.grey),
                  ),
                ],
              ),
            ),
          ),
        ),
    ];
  }
}

class _TrendPainter extends CustomPainter {
  _TrendPainter(this.data);
  final List<MonthlyPoint> data;

  @override
  void paint(Canvas canvas, Size size) {
    const bottomPad = 26.0;
    const topPad = 6.0;
    final chartW = size.width;
    final chartH = size.height - bottomPad - topPad;
    final baseline = size.height - bottomPad;

    final maxVal = data
        .map((p) => math.max(p.quotedValue, p.receivedValue))
        .fold(0.0, math.max);

    // Guard: an all-zero series must NOT divide by zero. Draw a baseline and
    // return — bars have zero height, which is the correct picture.
    final bool allZero = maxVal == 0;

    final barCount = data.length;
    if (barCount == 0) return;
    final slotW = chartW / barCount;
    final barW = (slotW * 0.55).clamp(4.0, 40.0);

    final barPaint = Paint()..color = const Color(0xFF3F51B5);
    final receivedLinePaint = Paint()
      ..color = const Color(0xFF2E7D32)
      ..strokeWidth = 2.5
      ..style = PaintingStyle.stroke;
    final receivedDotPaint = Paint()..color = const Color(0xFF2E7D32);

    // Baseline.
    final baselinePaint = Paint()
      ..color = const Color(0xFFBDBDBD)
      ..strokeWidth = 1;
    canvas.drawLine(Offset(0, baseline), Offset(chartW, baseline), baselinePaint);

    final path = Path();
    for (var i = 0; i < barCount; i++) {
      final p = data[i];
      final cx = slotW * (i + 0.5);

      final h = allZero ? 0.0 : (p.quotedValue / maxVal) * chartH;
      final barRect = Rect.fromLTWH(cx - barW / 2, baseline - h, barW, h);
      canvas.drawRect(barRect, barPaint);

      final rh = allZero ? 0.0 : (p.receivedValue / maxVal) * chartH;
      final ry = baseline - rh;
      if (i == 0) {
        path.moveTo(cx, ry);
      } else {
        path.lineTo(cx, ry);
      }
      canvas.drawCircle(Offset(cx, ry), 3, receivedDotPaint);

      final label = DateFormat('MMM').format(p.month);
      _paintCenteredText(canvas, label, Offset(cx, bottomPad + 12), chartW);
    }
    canvas.drawPath(path, receivedLinePaint);
  }

  void _paintCenteredText(
      Canvas canvas, String text, Offset center, double maxWidth) {
    final tp = TextPainter(
      text: TextSpan(
        text: text,
        style: const TextStyle(color: Color(0xFF616161), fontSize: 9),
      ),
      textDirection: ui.TextDirection.ltr,
      maxLines: 1,
    )..layout(maxWidth: maxWidth);
    tp.paint(canvas, Offset(center.dx - tp.width / 2, center.dy - tp.height / 2));
  }

  @override
  bool shouldRepaint(covariant _TrendPainter old) => old.data != data;
}

// ---------------------------------------------------------------------------
// Customers tab
// ---------------------------------------------------------------------------

class _CustomersTab extends StatelessWidget {
  const _CustomersTab({required this.rows, required this.isAllTime});
  final List<CustomerReportRow> rows;
  final bool isAllTime;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) {
      return _EmptyState(
        icon: Icons.people_outline,
        title: isAllTime ? 'No customers yet' : 'No customers in this range',
        body: isAllTime
            ? 'Customers appear here once you log quotations against them.'
            : 'Try a wider date range.',
      );
    }
    return ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      itemCount: rows.length,
      itemBuilder: (context, i) {
        final r = rows[i];
        return _animateRow(
          i,
          Card(
            elevation: 0,
            margin: const EdgeInsets.only(bottom: 8),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(color: Colors.grey.withValues(alpha: 0.2)),
            ),
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: Colors.indigo.withValues(alpha: 0.1),
                child: Text(
                  r.customerName.characters.first.toUpperCase(),
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
              title: Text(r.customerName,
                  maxLines: 1, overflow: TextOverflow.ellipsis),
              subtitle: Text(
                  '${r.quotationCount} quotation${r.quotationCount == 1 ? '' : 's'}'),
              trailing: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(formatInr(r.totalValue),
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                  Text(
                    'bal ${formatInr(r.balance)}',
                    style: TextStyle(
                      fontSize: 11,
                      color: r.balance > 0 ? Colors.orange.shade700 : Colors.green,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Products tab
// ---------------------------------------------------------------------------

class _ProductsTab extends StatelessWidget {
  const _ProductsTab({required this.rows, required this.isAllTime});
  final List<ProductReportRow> rows;
  final bool isAllTime;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) {
      return _EmptyState(
        icon: Icons.category_outlined,
        title: isAllTime ? 'No products sold yet' : 'No products in this range',
        body: isAllTime
            ? 'Line items from your quotations roll up here.'
            : 'Try a wider date range.',
      );
    }
    return ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      itemCount: rows.length,
      itemBuilder: (context, i) {
        final r = rows[i];
        return _animateRow(
          i,
          Card(
            elevation: 0,
            margin: const EdgeInsets.only(bottom: 8),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(color: Colors.grey.withValues(alpha: 0.2)),
            ),
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: Colors.brown.withValues(alpha: 0.1),
                child: const Icon(Icons.grid_view, size: 18),
              ),
              title: Text(r.description,
                  maxLines: 1, overflow: TextOverflow.ellipsis),
              subtitle: Text(
                  '${r.lineCount} line${r.lineCount == 1 ? '' : 's'} · '
                  '${formatAmount(r.totalUnits)} units'),
              trailing: Text(
                formatInr(r.totalValue),
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
          ),
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Outstanding tab
// ---------------------------------------------------------------------------

class _OutstandingTab extends StatelessWidget {
  const _OutstandingTab({required this.rows});
  final List<OutstandingRow> rows;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) {
      return const _EmptyState(
        icon: Icons.verified_outlined,
        title: 'All clear!',
        body: 'No outstanding receivables on non-lost quotations.',
      );
    }
    return ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      itemCount: rows.length,
      itemBuilder: (context, i) {
        final r = rows[i];
        return _animateRow(
          i,
          Card(
            elevation: 0,
            margin: const EdgeInsets.only(bottom: 8),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(color: Colors.grey.withValues(alpha: 0.2)),
            ),
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: r.ageDays > 30
                    ? Colors.red.withValues(alpha: 0.12)
                    : Colors.orange.withValues(alpha: 0.12),
                child: Text('${r.ageDays}d',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
              ),
              title: Text(r.quoteNo.isEmpty ? r.customerName : r.quoteNo,
                  maxLines: 1, overflow: TextOverflow.ellipsis),
              subtitle: Text('${r.customerName} · ${formatQuoteDate(r.date)}'),
              trailing: Text(
                formatInr(r.balance),
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
          ),
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// GST tab
// ---------------------------------------------------------------------------

class _GstTab extends StatelessWidget {
  const _GstTab({required this.summary, required this.isAllTime});
  final GstSummary summary;
  final bool isAllTime;

  @override
  Widget build(BuildContext context) {
    if (summary.quotationCount == 0) {
      return _EmptyState(
        icon: Icons.receipt_long_outlined,
        title: isAllTime ? 'No GST quotations yet' : 'No GST quotations in this range',
        body: isAllTime
            ? 'Quotations with GST turned on appear here for filing.'
            : 'Try a wider date range.',
      );
    }
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        _gstCard('GST-quotations', '${summary.quotationCount}'),
        const SizedBox(height: 8),
        _gstCard('Taxable value', formatInr(summary.taxableValue)),
        const SizedBox(height: 8),
        _gstCard('GST amount', formatInr(summary.gstAmount)),
        const SizedBox(height: 8),
        _gstCard('Total (incl. GST)', formatInr(summary.totalWithGst)),
      ].animate().fadeIn(duration: 200.ms),
    );
  }

  Widget _gstCard(String label, String value) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.grey.withValues(alpha: 0.2)),
      ),
      child: ListTile(
        title: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
        trailing: Text(value,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
      ),
    );
  }
}
