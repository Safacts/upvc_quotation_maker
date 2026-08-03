import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'models.dart';
import 'app_state.dart';
import 'supabase_config.dart';
import 'theme.dart';

// ─────────────────────────────────────────────────────────────────────────────
//  Analytics Screen
// ─────────────────────────────────────────────────────────────────────────────
class AnalyticsScreen extends StatefulWidget {
  final List<QuotationData>? quotations;
  const AnalyticsScreen({this.quotations, super.key});

  @override
  _AnalyticsScreenState createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  bool _isLoading = true;
  List<QuotationData> _quotations = [];
  Map<String, List<MeasuredItem>> _measuredItemsMap = {};

  @override
  void initState() {
    super.initState();
    if (widget.quotations != null && widget.quotations!.isNotEmpty) {
      _quotations = widget.quotations!;
      _fetchItems();
    } else {
      _fetchAll();
    }
  }

  Future<void> _fetchAll() async {
    setState(() => _isLoading = true);
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final resp = await SupabaseConfig.client
          .from('quotations')
          .select()
          .eq('client_id', clientId)
          .order('created_at', ascending: false);
      _quotations = (resp as List).map((e) => QuotationData.fromMap(e)).toList();
      await _fetchItems();
    } catch (e) {
      debugPrint('Analytics fetch error: $e');
      setState(() => _isLoading = false);
    }
  }

  Future<void> _fetchItems() async {
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final mItems = await SupabaseConfig.client
          .from('measured_items')
          .select()
          .eq('client_id', clientId);

      final map = <String, List<MeasuredItem>>{};
      for (final row in mItems as List) {
        final qId = row['quotation_id'] as String?;
        if (qId != null) {
          map.putIfAbsent(qId, () => []).add(MeasuredItem.fromMap(row));
        }
      }

      // attach items to quotations for grandTotal computation
      for (final q in _quotations) {
        if (q.id != null) q.measuredItems = map[q.id!] ?? [];
      }

      setState(() {
        _measuredItemsMap = map;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint('Items fetch error: $e');
      setState(() => _isLoading = false);
    }
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  List<QuotationData> get _wonQuotes => _quotations.where((q) => q.status == QuotationStatus.won).toList();
  List<QuotationData> get _thisMonthQuotes {
    final now = DateTime.now();
    return _quotations.where((q) => q.createdAt.year == now.year && q.createdAt.month == now.month).toList();
  }

  double get _wonRevenue => _wonQuotes.fold(0.0, (s, q) => s + q.grandTotal);
  double get _totalIgst => _quotations.fold(0.0, (s, q) => s + q.igst);
  double get _thisMonthIgst => _thisMonthQuotes.fold(0.0, (s, q) => s + q.igst);

  // GST for current quarter
  double get _thisQuarterIgst {
    final now = DateTime.now();
    final qStart = DateTime(now.year, ((now.month - 1) ~/ 3) * 3 + 1, 1);
    return _quotations
        .where((q) => q.createdAt.isAfter(qStart) || q.createdAt.isAtSameMomentAs(qStart))
        .fold(0.0, (s, q) => s + q.igst);
  }

  // Last 8 weeks bar data: list of (weekLabel, totalAmount)
  List<_WeekBar> get _weekBars {
    final now = DateTime.now();
    final bars = <_WeekBar>[];
    for (int i = 7; i >= 0; i--) {
      final weekStart = now.subtract(Duration(days: now.weekday - 1 + i * 7));
      final weekEnd = weekStart.add(const Duration(days: 6));
      final quotes = _quotations.where((q) =>
          q.createdAt.isAfter(weekStart.subtract(const Duration(seconds: 1))) &&
          q.createdAt.isBefore(weekEnd.add(const Duration(days: 1))));
      final total = quotes.fold(0.0, (s, q) => s + q.grandTotal);
      bars.add(_WeekBar(
        label: DateFormat('d MMM').format(weekStart),
        amount: total,
        count: quotes.length,
      ));
    }
    return bars;
  }

  // Top 5 most-quoted products by description
  List<MapEntry<String, int>> get _topProducts {
    final counts = <String, int>{};
    for (final q in _quotations) {
      for (final item in q.measuredItems) {
        if (item.description.trim().isNotEmpty) {
          counts[item.description.trim()] = (counts[item.description.trim()] ?? 0) + 1;
        }
      }
    }
    final sorted = counts.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    return sorted.take(5).toList();
  }

  // Repeat customers (2+ quotes)
  List<MapEntry<String, double>> get _repeatCustomers {
    final totals = <String, double>{};
    final counts = <String, int>{};
    for (final q in _quotations) {
      if (q.customerName.trim().isEmpty) continue;
      totals[q.customerName] = (totals[q.customerName] ?? 0) + q.grandTotal;
      counts[q.customerName] = (counts[q.customerName] ?? 0) + 1;
    }
    final repeats = totals.entries.where((e) => (counts[e.key] ?? 0) >= 2).toList();
    repeats.sort((a, b) => b.value.compareTo(a.value));
    return repeats.take(5).toList();
  }

  // ── Build helpers ───────────────────────────────────────────────────────────

  Widget _sectionTitle(String title, IconData icon, Color color) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 10),
          Text(title, style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: color)),
        ],
      ),
    );
  }

  Widget _card({required Widget child, int delay = 0}) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: child,
      ),
    ).animate().fade(delay: Duration(milliseconds: delay)).slideY(begin: 0.1);
  }

  // ── Hero stat tile ──────────────────────────────────────────────────────────
  Widget _buildHeroTile() {
    final currFmt = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
    final thisMonth = _thisMonthQuotes.length;
    final thisMonthVal = _thisMonthQuotes.fold(0.0, (s, q) => s + q.grandTotal);

    return _card(
      delay: 0,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionTitle('This Month', Icons.calendar_today_outlined, Colors.indigo),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('$thisMonth', style: TextStyle(fontSize: 52, fontWeight: FontWeight.w900, color: Theme.of(context).primaryColor, height: 1)),
                    Text('quotations', style: TextStyle(color: Colors.grey.shade600, fontSize: 14)),
                    const SizedBox(height: 8),
                    Text(currFmt.format(thisMonthVal), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    Text('quoted value', style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
                  ],
                ),
              ),
              // Mini sparkline (simple bars for last 8 weeks)
              SizedBox(
                width: 120, height: 60,
                child: CustomPaint(painter: _MiniSparkPainter(bars: _weekBars, color: Theme.of(context).primaryColor)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ── Funnel donut ────────────────────────────────────────────────────────────
  Widget _buildDonut() {
    final counts = {
      QuotationStatus.draft: _quotations.where((q) => q.status == QuotationStatus.draft).length,
      QuotationStatus.sent:  _quotations.where((q) => q.status == QuotationStatus.sent).length,
      QuotationStatus.won:   _quotations.where((q) => q.status == QuotationStatus.won).length,
      QuotationStatus.lost:  _quotations.where((q) => q.status == QuotationStatus.lost).length,
    };
    final total = _quotations.length;
    final colors = {
      QuotationStatus.draft: Colors.grey.shade400,
      QuotationStatus.sent:  Colors.blue.shade400,
      QuotationStatus.won:   Colors.green.shade500,
      QuotationStatus.lost:  Colors.red.shade400,
    };
    final winRate = total == 0 ? 0 : ((counts[QuotationStatus.won]! / total) * 100).round();

    return _card(
      delay: 100,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionTitle('Quotation Funnel', Icons.donut_large_outlined, Colors.blue.shade600),
          Row(
            children: [
              SizedBox(
                width: 130, height: 130,
                child: CustomPaint(
                  painter: _DonutPainter(counts: counts, colors: colors, total: total),
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text('$winRate%', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                        Text('win rate', style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 20),
              Expanded(
                child: Column(
                  children: QuotationStatus.values.map((s) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        Container(width: 10, height: 10, decoration: BoxDecoration(color: colors[s], shape: BoxShape.circle)),
                        const SizedBox(width: 8),
                        Text(s.label, style: const TextStyle(fontSize: 13)),
                        const Spacer(),
                        Text('${counts[s]}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                      ],
                    ),
                  )).toList(),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ── Weekly bar chart ────────────────────────────────────────────────────────
  Widget _buildBarChart() {
    final bars = _weekBars;
    final maxVal = bars.fold(0.0, (m, b) => b.amount > m ? b.amount : m);
    final currFmt = NumberFormat.compactCurrency(locale: 'en_IN', symbol: '₹');

    return _card(
      delay: 200,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionTitle('Weekly Sales Trend', Icons.bar_chart_outlined, Colors.purple.shade600),
          const SizedBox(height: 8),
          SizedBox(
            height: 130,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: bars.map((b) {
                final ratio = maxVal == 0 ? 0.0 : (b.amount / maxVal);
                final isLast = b == bars.last;
                return Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 3),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        if (b.amount > 0)
                          Text(currFmt.format(b.amount), style: TextStyle(fontSize: 8, color: Colors.grey.shade600)),
                        const SizedBox(height: 2),
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 600),
                          height: math.max(4, ratio * 90),
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.bottomCenter,
                              end: Alignment.topCenter,
                              colors: isLast
                                  ? [const Color(0xFF6366F1), const Color(0xFFA855F7)]
                                  : [const Color(0xFFE0E7FF), const Color(0xFFC7D2FE)],
                            ),
                            borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(b.label, style: TextStyle(fontSize: 8, color: Colors.grey.shade500)),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }

  // ── GST Summary ─────────────────────────────────────────────────────────────
  Widget _buildGstSummary() {
    final currFmt = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);
    final gstText = 'GST This Month: ${currFmt.format(_thisMonthIgst)}\n'
        'GST This Quarter: ${currFmt.format(_thisQuarterIgst)}\n'
        'Total GST Collected: ${currFmt.format(_totalIgst)}';

    return _card(
      delay: 300,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionTitle('GST Summary', Icons.receipt_long_outlined, Colors.teal.shade600),
          _gstRow('This Month', _thisMonthIgst),
          _gstRow('This Quarter', _thisQuarterIgst),
          const Divider(),
          _gstRow('All Time', _totalIgst, bold: true),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () {
              Clipboard.setData(ClipboardData(text: gstText));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('GST summary copied to clipboard')),
              );
            },
            icon: const Icon(Icons.copy, size: 16),
            label: const Text('Copy for Accountant'),
          ),
        ],
      ),
    );
  }

  Widget _gstRow(String label, double amount, {bool bold = false}) {
    final fmt = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(fontWeight: bold ? FontWeight.bold : FontWeight.normal, fontSize: 14)),
          Text(fmt.format(amount), style: TextStyle(fontWeight: bold ? FontWeight.bold : FontWeight.normal, fontSize: 14, color: bold ? Colors.teal.shade700 : null)),
        ],
      ),
    );
  }

  // ── Top Products ────────────────────────────────────────────────────────────
  Widget _buildTopProducts() {
    final products = _topProducts;
    if (products.isEmpty) return const SizedBox.shrink();

    final max = products.first.value;

    return _card(
      delay: 400,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionTitle('Top Products', Icons.window_outlined, Colors.orange.shade700),
          ...products.asMap().entries.map((e) {
            final ratio = max == 0 ? 0.0 : e.value.value / max;
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text('#${e.key + 1}', style: TextStyle(color: Colors.grey.shade500, fontSize: 12, fontWeight: FontWeight.bold)),
                      const SizedBox(width: 8),
                      Expanded(child: Text(e.value.key, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500), maxLines: 1, overflow: TextOverflow.ellipsis)),
                      Text('${e.value.value}×', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.orange.shade700)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: ratio,
                      minHeight: 6,
                      backgroundColor: Colors.orange.shade50,
                      valueColor: AlwaysStoppedAnimation(Colors.orange.shade400),
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  // ── Repeat Customers ────────────────────────────────────────────────────────
  Widget _buildRepeatCustomers() {
    final customers = _repeatCustomers;
    if (customers.isEmpty) return const SizedBox.shrink();

    final currFmt = NumberFormat.compactCurrency(locale: 'en_IN', symbol: '₹');

    return _card(
      delay: 500,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionTitle('Repeat Customers', Icons.people_outline, Colors.pink.shade600),
          ...customers.map((e) => ListTile(
            contentPadding: EdgeInsets.zero,
            leading: CircleAvatar(
              backgroundColor: Colors.pink.shade50,
              child: Text(e.key[0].toUpperCase(), style: TextStyle(color: Colors.pink.shade700, fontWeight: FontWeight.bold)),
            ),
            title: Text(e.key, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            trailing: Text(currFmt.format(e.value), style: TextStyle(fontWeight: FontWeight.bold, color: Colors.pink.shade600)),
          )),
        ],
      ),
    );
  }

  // ── Net Earnings ────────────────────────────────────────────────────────────
  Widget _buildNetEarnings() {
    final appState = Provider.of<AppState>(context, listen: false);
    final margin = appState.costMarginPercent;
    final currFmt = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

    // Only count won quotes for net earnings
    final netEarnings = _wonRevenue * (1 - margin / 100);

    return _card(
      delay: 600,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionTitle('Estimated Net Earnings', Icons.trending_up_outlined, Colors.green.shade700),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(currFmt.format(netEarnings),
                        style: TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: Colors.green.shade700)),
                    const SizedBox(height: 4),
                    Text('from ${_wonQuotes.length} won quotes · ${margin.toInt()}% cost margin',
                        style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Colors.amber.shade50,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: Colors.amber.shade200),
                      ),
                      child: Text(
                        'Rough estimate only — adjust your cost margin % in Settings for accuracy.',
                        style: TextStyle(fontSize: 11, color: Colors.amber.shade900),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Business Analytics', style: TextStyle(fontWeight: FontWeight.bold))),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _fetchAll,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _buildHeroTile(),
                  _buildDonut(),
                  _buildBarChart(),
                  _buildGstSummary(),
                  _buildTopProducts(),
                  _buildRepeatCustomers(),
                  _buildNetEarnings(),
                  const SizedBox(height: 32),
                ],
              ),
            ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Data class for weekly bars
// ─────────────────────────────────────────────────────────────────────────────
class _WeekBar {
  final String label;
  final double amount;
  final int count;
  const _WeekBar({required this.label, required this.amount, required this.count});
}

// ─────────────────────────────────────────────────────────────────────────────
//  Mini Sparkline Painter (last 8 weeks, tiny bar chart)
// ─────────────────────────────────────────────────────────────────────────────
class _MiniSparkPainter extends CustomPainter {
  final List<_WeekBar> bars;
  final Color color;

  _MiniSparkPainter({required this.bars, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    if (bars.isEmpty) return;
    final maxVal = bars.fold(0.0, (m, b) => b.amount > m ? b.amount : m);
    if (maxVal == 0) return;

    final barW = size.width / (bars.length * 1.8);
    final gap = (size.width - barW * bars.length) / (bars.length + 1);

    final paint = Paint()..style = PaintingStyle.fill;
    for (int i = 0; i < bars.length; i++) {
      final ratio = bars[i].amount / maxVal;
      final barH = ratio * size.height;
      final x = gap + i * (barW + gap);
      final rect = RRect.fromRectAndRadius(
        Rect.fromLTWH(x, size.height - barH, barW, barH),
        const Radius.circular(3),
      );
      paint.color = i == bars.length - 1 ? color : color.withOpacity(0.3);
      canvas.drawRRect(rect, paint);
    }
  }

  @override
  bool shouldRepaint(_MiniSparkPainter old) => false;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Donut Chart Painter
// ─────────────────────────────────────────────────────────────────────────────
class _DonutPainter extends CustomPainter {
  final Map<QuotationStatus, int> counts;
  final Map<QuotationStatus, Color> colors;
  final int total;

  _DonutPainter({required this.counts, required this.colors, required this.total});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = math.min(size.width, size.height) / 2;
    final strokeWidth = radius * 0.35;

    if (total == 0) {
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..color = Colors.grey.shade200;
      canvas.drawCircle(center, radius - strokeWidth / 2, paint);
      return;
    }

    double startAngle = -math.pi / 2;
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    for (final s in QuotationStatus.values) {
      final count = counts[s] ?? 0;
      if (count == 0) continue;
      final sweep = (count / total) * 2 * math.pi;
      paint.color = colors[s]!;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius - strokeWidth / 2),
        startAngle,
        sweep - 0.05,
        false,
        paint,
      );
      startAngle += sweep;
    }
  }

  @override
  bool shouldRepaint(_DonutPainter old) => false;
}
