/// OFFLINE TIER — HOME / DASHBOARD.
///
/// ZERO-SERVER CONTRACT: no `supabase_flutter`, no `http`, no `connectivity_plus`,
/// no `lib/services/**`. See `lib/offline/core/models.dart` for the full rule.
/// Everything on this screen is computed by SQLite on the device.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../branding/brand_service.dart';
import '../branding/brand_settings_screen.dart';
import '../core/models.dart';
import '../data/customer_repository.dart';
import '../data/product_repository.dart';
import '../data/quotation_repository.dart';
import '../export/export_screen.dart';
import '../reports/reports_screen.dart';
import 'customers_screen.dart';
import 'payments_screen.dart';
import 'products_screen.dart';
import 'quotation_editor_screen.dart';
import 'quotation_list_screen.dart';

/// Everything the dashboard paints, loaded in one pass.
///
/// WHY a single immutable snapshot instead of six nullable fields: the KPI row
/// must never show a mix of old and new numbers while a refresh is in flight.
/// Half-updated figures on a money screen read as a bug, not as loading.
@immutable
class _DashboardData {
  const _DashboardData({
    required this.total,
    required this.byStatus,
    required this.totalValue,
    required this.customerCount,
    required this.productCount,
    required this.recent,
  });

  final int total;
  final Map<String, int> byStatus;
  final double totalValue;
  final int customerCount;
  final int productCount;
  final List<QuotationSummary> recent;

  int get won => byStatus[OfflineQuotationStatus.won.value] ?? 0;
  int get lost => byStatus[OfflineQuotationStatus.lost.value] ?? 0;
  int get draft => byStatus[OfflineQuotationStatus.draft.value] ?? 0;
  int get sent => byStatus[OfflineQuotationStatus.sent.value] ?? 0;

  /// Null when nothing has been decided yet — showing "0%" before a single
  /// quotation has closed would look like the owner is losing every deal.
  double? get winRate {
    final decided = won + lost;
    if (decided == 0) return null;
    return (won / decided) * 100.0;
  }
}

class OfflineDashboardScreen extends StatefulWidget {
  const OfflineDashboardScreen({super.key});

  @override
  State<OfflineDashboardScreen> createState() => _OfflineDashboardScreenState();
}

class _OfflineDashboardScreenState extends State<OfflineDashboardScreen>
    with WidgetsBindingObserver {
  final QuotationRepository _quotations = QuotationRepository();
  final CustomerRepository _customers = CustomerRepository();
  final ProductRepository _products = ProductRepository();

  _DashboardData? _data;
  Uint8List? _logoBytes;
  bool _loading = true;
  bool _inFlight = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadLogo();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Re-read the aggregates whenever this screen is (re)attached, so returning
    // from any route — even one that forgot to pop `true` — never leaves a
    // stale total on screen. `_inFlight` stops the duplicate load that a theme
    // or MediaQuery change would otherwise trigger.
    _load();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // The owner routinely edits a quotation, switches to WhatsApp and comes
    // back. Without this the KPIs would still show the pre-edit numbers.
    if (state == AppLifecycleState.resumed) _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _loadLogo() async {
    try {
      final bytes = await BrandService.instance.loadLogoBytes();
      if (!mounted) return;
      setState(() => _logoBytes = bytes);
    } catch (_) {
      // A missing/corrupt logo must degrade to the text title, never break the
      // home screen. BrandService already returns null for a missing file.
    }
  }

  Future<void> _load() async {
    if (_inFlight) return;
    _inFlight = true;
    try {
      final total = await _quotations.count();
      final byStatus = await _quotations.countsByStatus();
      final value = await _quotations.totalValue();
      final customerCount = await _customers.count();
      final productCount = await _products.count();
      final recent = await _quotations.list(limit: 5);

      if (!mounted) return;
      setState(() {
        _data = _DashboardData(
          total: total,
          byStatus: byStatus,
          totalValue: value,
          customerCount: customerCount,
          productCount: productCount,
          recent: recent,
        );
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _loading = false;
      });
    } finally {
      _inFlight = false;
    }
  }

  /// Push [child] and refresh the KPIs when it reports a change.
  ///
  /// The editor pops `true` after a save. Anything else (plain back) leaves the
  /// figures alone, which keeps a simple browse from re-querying the database.
  Future<void> _openAndRefresh(Widget child) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(builder: (_) => child),
    );
    if (!mounted) return;
    if (changed == true) await _load();
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(behavior: SnackBarBehavior.floating, content: Text(message)),
    );
  }

  @override
  Widget build(BuildContext context) {
    // ListenableBuilder, not a one-shot read: renaming the company in Settings
    // must retitle the app bar the moment the user comes back.
    return ListenableBuilder(
      listenable: BrandService.instance,
      builder: (context, _) {
        final brand = BrandService.instance.config;
        final title = brand.companyName.trim().isEmpty
            ? 'UPVC Quotations'
            : brand.companyName.trim();

        return Scaffold(
          appBar: AppBar(
            titleSpacing: _logoBytes == null ? null : 0,
            leading: _logoBytes == null ? null : _buildLogoAvatar(),
            title: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            actions: [
              IconButton(
                icon: const Icon(Icons.refresh),
                tooltip: 'Refresh',
                onPressed: _load,
              ),
              PopupMenuButton<String>(
                tooltip: 'More',
                onSelected: _onMenu,
                itemBuilder: (context) => const [
                  PopupMenuItem<String>(
                    value: 'payments',
                    child: ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(Icons.payments_outlined),
                      title: Text('Payments'),
                    ),
                  ),
                  PopupMenuItem<String>(
                    value: 'reports',
                    child: ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(Icons.bar_chart_outlined),
                      title: Text('Reports'),
                    ),
                  ),
                  PopupMenuItem<String>(
                    value: 'export',
                    child: ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(Icons.file_download_outlined),
                      title: Text('Export / Tally'),
                    ),
                  ),
                  PopupMenuDivider(),
                  PopupMenuItem<String>(
                    value: 'products',
                    child: ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(Icons.inventory_2_outlined),
                      title: Text('Products'),
                    ),
                  ),
                  PopupMenuItem<String>(
                    value: 'customers',
                    child: ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(Icons.people_outline),
                      title: Text('Customers'),
                    ),
                  ),
                  PopupMenuItem<String>(
                    value: 'settings',
                    child: ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(Icons.settings_outlined),
                      title: Text('Settings'),
                    ),
                  ),
                ],
              ),
            ],
          ),
          body: SafeArea(child: _buildBody()),
        );
      },
    );
  }

  Widget _buildLogoAvatar() {
    final bytes = _logoBytes;
    if (bytes == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(left: 12),
      child: CircleAvatar(
        radius: 16,
        backgroundColor: Colors.white,
        // A decode failure must not take the app bar down with it.
        backgroundImage: MemoryImage(bytes),
        onBackgroundImageError: (_, __) {},
      ),
    );
  }

  Future<void> _onMenu(String value) async {
    switch (value) {
      case 'payments':
        await _openAndRefresh(const PaymentsScreen());
      case 'reports':
        // Reports are read-only, but they are pushed through the same helper so
        // a payment recorded from a drill-down still refreshes the KPIs.
        await _openAndRefresh(const ReportsScreen());
      case 'export':
        await _openAndRefresh(const ExportScreen());
      case 'products':
        await _openAndRefresh(const ProductsScreen());
      case 'customers':
        await _openAndRefresh(const CustomersScreen());
      case 'settings':
        await _openAndRefresh(const BrandSettingsScreen());
    }
    // Branding (and therefore the logo) may have changed in Settings.
    await _loadLogo();
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null && _data == null) {
      return _ErrorView(
        message: _error!,
        onRetry: () {
          setState(() => _loading = true);
          _load();
        },
      );
    }

    final data = _data;
    if (data == null) {
      return _ErrorView(
        message: 'Could not read your data.',
        onRetry: () {
          setState(() => _loading = true);
          _load();
        },
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        // AlwaysScrollable so pull-to-refresh still works on a short list.
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          const _OfflineBadge(),
          const SizedBox(height: 16),
          _buildPrimaryCta(),
          const SizedBox(height: 20),
          _buildKpiSection(data),
          const SizedBox(height: 20),
          _buildQuickActions(data),
          const SizedBox(height: 24),
          _buildRecent(data),
        ],
      ),
    );
  }

  Widget _buildPrimaryCta() {
    return SizedBox(
      height: 54,
      child: ElevatedButton.icon(
        icon: const Icon(Icons.add_circle_outline),
        label: const Text(
          'New Quotation',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
        ),
        style: ElevatedButton.styleFrom(
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(16)),
          ),
        ),
        onPressed: () =>
            _openAndRefresh(const QuotationEditorScreen(quotationId: null)),
      ),
    ).animate().fadeIn(duration: 240.ms).slideY(begin: 0.12);
  }

  Widget _buildKpiSection(_DashboardData d) {
    final rate = d.winRate;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionTitle('Your business at a glance'),
        const SizedBox(height: 12),
        LayoutBuilder(
          builder: (context, constraints) {
            // Two columns on a phone, three once there is room — avoids a
            // cramped 3-up grid on a 5" screen where the totals get truncated.
            const spacing = 12.0;
            final columns = constraints.maxWidth >= 560 ? 3 : 2;
            final width =
                (constraints.maxWidth - (spacing * (columns - 1))) / columns;

            final tiles = <Widget>[
              _KpiTile(
                label: 'Total Quotations',
                value: '${d.total}',
                icon: Icons.description_outlined,
                color: Colors.indigo,
                width: width,
              ),
              _KpiTile(
                label: 'Total Value',
                value: formatInr(d.totalValue),
                icon: Icons.currency_rupee,
                color: Colors.orange,
                width: width,
              ),
              _KpiTile(
                label: 'Draft',
                value: '${d.draft}',
                icon: Icons.edit_note,
                color: Colors.blueGrey,
                width: width,
              ),
              _KpiTile(
                label: 'Sent',
                value: '${d.sent}',
                icon: Icons.send_outlined,
                color: Colors.blue,
                width: width,
              ),
              _KpiTile(
                label: 'Won',
                value: '${d.won}',
                icon: Icons.check_circle_outline,
                color: Colors.green,
                width: width,
              ),
              _KpiTile(
                label: 'Lost',
                value: '${d.lost}',
                icon: Icons.cancel_outlined,
                color: Colors.red,
                width: width,
              ),
              if (rate != null)
                _KpiTile(
                  label: 'Win Rate',
                  value: '${rate.toStringAsFixed(0)}%',
                  icon: Icons.trending_up,
                  color: Colors.teal,
                  width: width,
                ),
            ];

            return Wrap(
              spacing: spacing,
              runSpacing: spacing,
              children: tiles,
            );
          },
        ),
      ],
    ).animate().fadeIn(delay: 60.ms, duration: 240.ms);
  }

  Widget _buildQuickActions(_DashboardData d) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionTitle('Quick actions'),
        const SizedBox(height: 12),
        Card(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: Colors.grey.withValues(alpha: 0.25)),
          ),
          child: Column(
            children: [
              _ActionRow(
                icon: Icons.list_alt,
                color: Colors.indigo,
                title: 'Quotations',
                subtitle: '${d.total} saved on this device',
                onTap: () => _openAndRefresh(const QuotationListScreen()),
              ),
              const Divider(height: 1),
              _ActionRow(
                icon: Icons.people_outline,
                color: Colors.purple,
                title: 'Customers',
                subtitle: '${d.customerCount} in your address book',
                onTap: () => _openAndRefresh(const CustomersScreen()),
              ),
              const Divider(height: 1),
              _ActionRow(
                icon: Icons.inventory_2_outlined,
                color: Colors.brown,
                title: 'Products',
                subtitle: '${d.productCount} active rate-card items',
                onTap: () => _openAndRefresh(const ProductsScreen()),
              ),
              const Divider(height: 1),
              _ActionRow(
                icon: Icons.settings_outlined,
                color: Colors.blueGrey,
                title: 'Settings',
                subtitle: 'Company details, logo, bank, terms',
                onTap: () async {
                  await _openAndRefresh(const BrandSettingsScreen());
                  await _loadLogo();
                },
              ),
            ],
          ),
        ),
      ],
    ).animate().fadeIn(delay: 100.ms, duration: 240.ms);
  }

  Widget _buildRecent(_DashboardData d) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const _SectionTitle('Recent quotations'),
            if (d.recent.isNotEmpty)
              TextButton(
                onPressed: () => _openAndRefresh(const QuotationListScreen()),
                child: const Text('View all'),
              ),
          ],
        ),
        const SizedBox(height: 4),
        if (d.recent.isEmpty)
          _EmptyRecent(
            onCreate: () => _openAndRefresh(
              const QuotationEditorScreen(quotationId: null),
            ),
          )
        else
          ...d.recent.map(
            (q) => Card(
              elevation: 0,
              margin: const EdgeInsets.only(bottom: 10),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
                side: BorderSide(color: Colors.grey.withValues(alpha: 0.25)),
              ),
              child: ListTile(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
                leading: CircleAvatar(
                  backgroundColor:
                      _statusColor(q.status).withValues(alpha: 0.12),
                  child: Icon(
                    Icons.description_outlined,
                    color: _statusColor(q.status),
                    size: 20,
                  ),
                ),
                title: Text(
                  q.customerName.trim().isEmpty
                      ? '(No customer name)'
                      : q.customerName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                subtitle: Text(
                  '${q.quoteNo}  •  ${formatQuoteDate(q.date)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      formatInr(q.grandTotal),
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 4),
                    _StatusChip(status: q.status),
                  ],
                ),
                onTap: () => _openAndRefresh(
                  QuotationEditorScreen(quotationId: q.id),
                ),
                onLongPress: () => _snack(
                  '${q.quoteNo} — ${q.itemCount} item(s)',
                ),
              ),
            ),
          ),
      ],
    ).animate().fadeIn(delay: 140.ms, duration: 240.ms);
  }
}

// ---------------------------------------------------------------------------
// Presentational pieces
// ---------------------------------------------------------------------------

/// The headline promise of the Rs.10,000 tier. Deliberately at the very top of
/// the home screen: this is what the client paid for and what stops the
/// "is my data going somewhere?" question at the first demo.
class _OfflineBadge extends StatelessWidget {
  const _OfflineBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.green.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.green.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.cloud_off, color: Colors.green, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Works offline',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: Colors.green.shade800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Your data stays on this device. No internet needed.',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                ),
              ],
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 220.ms);
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
    );
  }
}

class _KpiTile extends StatelessWidget {
  const _KpiTile({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    required this.width,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final double width;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: width,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(height: 8),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              // Total Value can be nine characters wide on a big pipeline;
              // scaling down beats an ellipsis on a money figure.
              child: Text(
                value,
                maxLines: 1,
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 18,
                  color: color,
                ),
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 11, color: Colors.grey.shade700),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActionRow extends StatelessWidget {
  const _ActionRow({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: color.withValues(alpha: 0.12),
        child: Icon(icon, color: color, size: 20),
      ),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text(subtitle, style: const TextStyle(fontSize: 12)),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final OfflineQuotationStatus status;

  @override
  Widget build(BuildContext context) {
    final color = _statusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(
        status.label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.bold,
          color: color,
        ),
      ),
    );
  }
}

class _EmptyRecent extends StatelessWidget {
  const _EmptyRecent({required this.onCreate});

  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          Icon(
            Icons.description_outlined,
            size: 44,
            color: Colors.grey.shade400,
          ),
          const SizedBox(height: 12),
          const Text(
            'No quotations yet',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 4),
          Text(
            'Create your first quotation and it will appear here.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
          ),
          const SizedBox(height: 16),
          ElevatedButton.icon(
            icon: const Icon(Icons.add),
            label: const Text('Create your first quotation'),
            onPressed: onCreate,
          ),
        ],
      ),
    );
  }
}

/// Shared failure surface. A bare white screen after a database error leaves
/// the owner with no way forward but force-quitting the app.
class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 48, color: Colors.red.shade300),
            const SizedBox(height: 14),
            const Text(
              'Something went wrong',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
            const SizedBox(height: 6),
            Text(
              message,
              textAlign: TextAlign.center,
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
            const SizedBox(height: 18),
            ElevatedButton.icon(
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
              onPressed: onRetry,
            ),
          ],
        ),
      ),
    );
  }
}

Color _statusColor(OfflineQuotationStatus s) => switch (s) {
      OfflineQuotationStatus.draft => Colors.blueGrey,
      OfflineQuotationStatus.sent => Colors.blue,
      OfflineQuotationStatus.won => Colors.green,
      OfflineQuotationStatus.lost => Colors.red,
    };
