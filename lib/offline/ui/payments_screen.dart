/// OFFLINE TIER — PAYMENTS / COLLECTIONS LIST.
///
/// ZERO-SERVER CONTRACT: no `supabase_flutter`, no `http`, no
/// `connectivity_plus`, no `lib/services/**`, no `../../supabase_config.dart`.
/// See `lib/offline/core/models.dart` for the full rule; the build fails on a
/// violation via `test/offline_no_network_test.dart`.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../branding/brand_service.dart';
import '../core/models.dart';
import '../core/payment_models.dart';
import '../data/payment_repository.dart';
import '../data/quotation_repository.dart';
import 'payment_entry_sheet.dart';

/// Rows fetched per page. Matches `PaymentRepository.list`'s default — three
/// years of receipts must never be loaded to draw ten rows.
const int _pageSize = 50;

/// Keystroke settle time before a query is issued. Typing "venkateshwara" is
/// 13 LIKE scans over the whole table without it, and the field visibly
/// stutters on an old phone. 300 ms is below the threshold where a list starts
/// to feel lazy.
const Duration _debounce = Duration(milliseconds: 300);

/// Rows past this index are NOT staggered. Staggering row 300 makes a long
/// scroll feel laggy for zero benefit.
const int _maxStaggeredRows = 8;

class PaymentsScreen extends StatefulWidget {
  const PaymentsScreen({super.key});

  @override
  State<PaymentsScreen> createState() => _PaymentsScreenState();
}

class _PaymentsScreenState extends State<PaymentsScreen> {
  final PaymentRepository _repo = PaymentRepository();
  final QuotationRepository _quotations = QuotationRepository();

  final TextEditingController _searchController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  Timer? _debounceTimer;

  final List<OfflinePayment> _items = <OfflinePayment>[];

  /// `quotationId -> quote number` for the rows currently on screen.
  ///
  /// `PaymentRepository.list` returns `p.*` only, so the quote number is not on
  /// the payment row. Resolved per page in ONE `QuotationRepository` sweep
  /// rather than per row — a lookup per row is 50 round trips per page, which
  /// is exactly what makes a list that is instant in testing stutter on a real
  /// install.
  final Map<String, String> _quoteNos = <String, String>{};
  final Map<String, String> _customerNames = <String, String>{};

  String _search = '';
  DateTime? _from;
  DateTime? _to;

  double _received = 0;
  double _outstanding = 0;

  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = true;
  String? _error;

  /// True once we know the table is non-empty, regardless of the active filter.
  ///
  /// This is what lets the empty state distinguish "you have taken no payments
  /// yet" from "nothing matches this filter". Telling an owner with 400
  /// receipts that they have none is alarming.
  bool _anyPaymentsAtAll = false;

  /// Set on any successful save or delete and popped to the caller so the
  /// dashboard can refresh its KPIs.
  bool _changed = false;

  /// 🔴 STALE-QUERY GUARD. Bumped at the START of every load; every `await` is
  /// followed by `if (!mounted || epoch != _queryEpoch) return;`.
  ///
  /// Without it a slow first query resolves AFTER a newer one and repaints
  /// results for text the user has already deleted. `flutter analyze` cannot
  /// see this — it is a pure timing defect that only shows on a slow phone with
  /// a big table.
  int _queryEpoch = 0;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _reload();
  }

  @override
  void dispose() {
    // A live timer firing `setState` after dispose throws.
    _debounceTimer?.cancel();
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    _searchController.dispose();
    super.dispose();
  }

  bool get _isFiltered =>
      _search.isNotEmpty || _from != null || _to != null;

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final position = _scrollController.position;
    // 400px of runway so the next page is usually already in place by the time
    // the user reaches the tail.
    if (position.pixels >= position.maxScrollExtent - 400) {
      _loadMore();
    }
  }

  void _onSearchChanged(String value) {
    _debounceTimer?.cancel();
    _debounceTimer = Timer(_debounce, () {
      if (!mounted) return;
      final trimmed = value.trim();
      if (trimmed == _search) return;
      _search = trimmed;
      _reload();
    });
  }

  /// Enter must not wait out the debounce.
  void _onSearchSubmitted(String value) {
    _debounceTimer?.cancel();
    final trimmed = value.trim();
    if (trimmed == _search) return;
    _search = trimmed;
    _reload();
  }

  void _clearSearch() {
    _debounceTimer?.cancel();
    _searchController.clear();
    if (_search.isEmpty) return;
    _search = '';
    _reload();
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  Future<void> _reload() async {
    final epoch = ++_queryEpoch;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      // Parallel: the two header figures and the first page are independent,
      // and one round trip beats three sequential ones on a cold DB handle.
      final results = await Future.wait<Object>(<Future<Object>>[
        _repo.list(
          from: _from,
          to: _to,
          search: _search.isEmpty ? null : _search,
          limit: _pageSize,
          offset: 0,
        ),
        _repo.totalReceived(from: _from, to: _to),
        _repo.totalOutstanding(),
        _repo.count(),
      ]);
      if (!mounted || epoch != _queryEpoch) return;

      final page = results[0] as List<OfflinePayment>;
      final labels = await _resolveLabels(page);
      if (!mounted || epoch != _queryEpoch) return;

      setState(() {
        _items
          ..clear()
          ..addAll(page);
        _quoteNos
          ..clear()
          ..addAll(labels.quoteNos);
        _customerNames
          ..clear()
          ..addAll(labels.customerNames);
        _received = results[1] as double;
        _outstanding = results[2] as double;
        _anyPaymentsAtAll = (results[3] as int) > 0;
        // A SHORT page means exhausted. Without this every scroll-to-bottom
        // fires a guaranteed-empty query, forever.
        _hasMore = page.length == _pageSize;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || epoch != _queryEpoch) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loading || _loadingMore || !_hasMore) return;
    final epoch = _queryEpoch;
    setState(() => _loadingMore = true);

    try {
      final page = await _repo.list(
        from: _from,
        to: _to,
        search: _search.isEmpty ? null : _search,
        limit: _pageSize,
        offset: _items.length,
      );
      if (!mounted || epoch != _queryEpoch) return;

      final labels = await _resolveLabels(page);
      if (!mounted || epoch != _queryEpoch) return;

      setState(() {
        _items.addAll(page);
        _quoteNos.addAll(labels.quoteNos);
        _customerNames.addAll(labels.customerNames);
        _hasMore = page.length == _pageSize;
        _loadingMore = false;
      });
    } catch (e) {
      if (!mounted || epoch != _queryEpoch) return;
      setState(() => _loadingMore = false);
      // A failed EXTRA page is a SnackBar, never a screen-level error: the rows
      // already painted are still valid and swapping them for an error view
      // would throw away good data.
      _snack('Could not load more payments: $e', isError: true);
    }
  }

  /// Resolve quote numbers + customer names for a page of payments.
  ///
  /// `PaymentRepository.list` selects `p.*`, so the quote number and customer
  /// name are not on the row and have to be looked up.
  ///
  /// ⚠️ COST WARNING — the two things that keep this off the critical path:
  ///
  ///  1. **DISTINCT + CACHED.** Several instalments against one job resolve
  ///     ONCE, and scrolling back over rows already seen costs nothing. Without
  ///     the `_quoteNos` cache check this would re-query on every page.
  ///  2. **Issued in PARALLEL, not in a sequential `await` loop.** A loop pays
  ///     the full round-trip latency per row — 50 rows is 50 stacked waits
  ///     before a single row paints.
  ///
  /// It is still heavier than it should be: `QuotationRepository.getById` loads
  /// the FULL quotation including every measured and unmeasured line item (3
  /// queries) purely to read two header strings. A 30-window quotation pulls 30
  /// useless rows. The proper fix is a batch id->header read on
  /// `QuotationRepository`, which is another agent's file — flagged, not
  /// hacked around with raw SQL in a UI file.
  Future<_PageLabels> _resolveLabels(List<OfflinePayment> page) async {
    final quoteNos = <String, String>{};
    final customerNames = <String, String>{};

    final unresolved = <String>[
      ...<String>{
        for (final p in page)
          if (p.quotationId.isNotEmpty && !_quoteNos.containsKey(p.quotationId))
            p.quotationId,
      },
    ];

    if (unresolved.isEmpty) return _PageLabels(quoteNos, customerNames);

    final loaded = await Future.wait<OfflineQuotation?>(
      unresolved.map((id) async {
        try {
          return await _quotations.getById(id);
        } catch (_) {
          // A label is decoration. The AMOUNT is the part that matters, and a
          // failed lookup must never hide a receipt.
          return null;
        }
      }),
    );

    for (var i = 0; i < unresolved.length; i++) {
      final q = loaded[i];
      if (q == null) continue;
      quoteNos[unresolved[i]] = q.quotationNo;
      customerNames[unresolved[i]] = q.customerName;
    }

    return _PageLabels(quoteNos, customerNames);
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  Future<void> _openSheet({OfflinePayment? payment}) async {
    final saved = await PaymentEntrySheet.show(
      context,
      payment: payment,
      quotationId: payment?.quotationId,
      quotationNo:
          payment == null ? null : _quoteNos[payment.quotationId],
      customerId: payment?.customerId,
      customerName:
          payment == null ? null : _customerNames[payment.quotationId],
    );
    if (!mounted || saved != true) return;
    _changed = true;
    await _reload();
  }

  /// Delete behind a confirm dialog that names the real consequence.
  ///
  /// Returns true only when the row was actually removed from the database.
  Future<bool> _confirmAndDelete(OfflinePayment payment) async {
    final id = payment.id;
    if (id == null || id.isEmpty) return false;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete this payment?'),
        content: Text(
          '${formatInr(payment.amount)} received on '
          '${formatQuoteDate(payment.date)} will be removed from the books.\n\n'
          'There is no cloud backup on this plan, so this CANNOT be undone. '
          'The customer\'s balance will go up by this amount.',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Keep it'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(ctx).colorScheme.error,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Delete permanently'),
          ),
        ],
      ),
    );

    if (!mounted || confirmed != true) return false;

    try {
      await _repo.delete(id);
      if (!mounted) return false;
      // Removed from state ONLY on repo success — never tell the user a delete
      // worked when it did not.
      setState(() {
        _items.removeWhere((p) => p.id == id);
        _changed = true;
      });
      _snack('Payment deleted.');
      // Header figures are now wrong; refresh them without a full spinner.
      unawaited(_refreshTotals());
      return true;
    } catch (e) {
      if (!mounted) return false;
      _snack('Could not delete the payment: $e', isError: true);
      return false;
    }
  }

  Future<void> _refreshTotals() async {
    final epoch = _queryEpoch;
    try {
      final received = await _repo.totalReceived(from: _from, to: _to);
      if (!mounted || epoch != _queryEpoch) return;
      final outstanding = await _repo.totalOutstanding();
      if (!mounted || epoch != _queryEpoch) return;
      setState(() {
        _received = received;
        _outstanding = outstanding;
      });
    } catch (_) {
      // Stale-but-visible totals beat a blanked header; the next reload fixes
      // them.
    }
  }

  Future<void> _pickRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 10),
      lastDate: DateTime(now.year + 2, 12, 31),
      initialDateRange: (_from != null && _to != null)
          ? DateTimeRange(start: _from!, end: _to!)
          : null,
      helpText: 'Filter payments by date',
    );
    if (!mounted || picked == null) return;
    _from = paymentDateOnly(picked.start);
    _to = paymentDateOnly(picked.end);
    await _reload();
  }

  Future<void> _clearRange() async {
    if (_from == null && _to == null) return;
    _from = null;
    _to = null;
    await _reload();
  }

  void _snack(String message, {bool isError = false}) {
    final messenger = ScaffoldMessenger.maybeOf(context);
    if (messenger == null) return;
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          behavior: SnackBarBehavior.floating,
          backgroundColor:
              isError ? Theme.of(context).colorScheme.error : null,
        ),
      );
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    // `PopScope<bool>` + `onPopInvokedWithResult` — the old `onPopInvoked` is
    // deprecated on this SDK. `canPop: false` so Android back still carries the
    // `_changed` flag out to the dashboard.
    return PopScope<bool>(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        Navigator.of(context).pop(_changed);
      },
      child: ListenableBuilder(
        listenable: BrandService.instance,
        builder: (context, _) => Scaffold(
          appBar: AppBar(
            title: const Text('Payments'),
            actions: <Widget>[
              IconButton(
                tooltip: 'Filter by date',
                icon: Icon(
                  _from == null ? Icons.date_range_outlined : Icons.date_range,
                ),
                onPressed: _pickRange,
              ),
            ],
          ),
          floatingActionButton: FloatingActionButton.extended(
            onPressed: () => _openSheet(),
            icon: const Icon(Icons.add),
            label: const Text('Record payment'),
          ),
          body: Column(
            children: <Widget>[
              _buildHeader(context),
              _buildSearchBar(context),
              if (_from != null || _to != null) _buildRangeChip(context),
              Expanded(child: _buildBody(context)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    final theme = Theme.of(context);
    final rangeLabel = (_from == null && _to == null)
        ? 'All time'
        : '${_from == null ? '...' : formatQuoteDate(_from!)}'
            ' to '
            '${_to == null ? '...' : formatQuoteDate(_to!)}';

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
      child: Row(
        children: <Widget>[
          Expanded(
            child: _SummaryCard(
              label: 'Total received',
              sublabel: rangeLabel,
              value: formatInr(_received),
              icon: Icons.south_west,
              color: Colors.green.shade700,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _SummaryCard(
              label: 'Total outstanding',
              sublabel: 'All time, excluding lost',
              value: formatInr(_outstanding),
              icon: Icons.hourglass_bottom,
              color: _outstanding > kMoneyEpsilon
                  ? Colors.orange.shade800
                  : theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ).animate().fadeIn(duration: 220.ms).slideY(begin: -0.06, end: 0),
    );
  }

  Widget _buildSearchBar(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: TextField(
        controller: _searchController,
        textInputAction: TextInputAction.search,
        onChanged: _onSearchChanged,
        onSubmitted: _onSearchSubmitted,
        decoration: InputDecoration(
          hintText: 'Search reference, notes, quote no or customer',
          prefixIcon: const Icon(Icons.search),
          isDense: true,
          border: const OutlineInputBorder(),
          suffixIcon: _searchController.text.isEmpty
              ? null
              : IconButton(
                  icon: const Icon(Icons.clear),
                  onPressed: _clearSearch,
                ),
        ),
      ),
    );
  }

  Widget _buildRangeChip(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
        child: InputChip(
          avatar: const Icon(Icons.event, size: 18),
          label: Text(
            '${_from == null ? '...' : formatQuoteDate(_from!)}'
            ' - '
            '${_to == null ? '...' : formatQuoteDate(_to!)}',
          ),
          onDeleted: _clearRange,
        ),
      ),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    final error = _error;
    if (error != null) {
      // Only a failed FIRST page reaches here.
      return _ErrorView(message: error, onRetry: _reload);
    }

    if (_items.isEmpty) {
      return _EmptyView(
        filtered: _isFiltered && _anyPaymentsAtAll,
        onClearFilters: () {
          _debounceTimer?.cancel();
          _searchController.clear();
          _search = '';
          _from = null;
          _to = null;
          _reload();
        },
        onAdd: () => _openSheet(),
      );
    }

    return RefreshIndicator(
      onRefresh: _reload,
      // ListView.builder, never a Column in a SingleChildScrollView — this list
      // is unbounded by design.
      child: ListView.builder(
        controller: _scrollController,
        padding: const EdgeInsets.only(bottom: 96),
        itemCount: _items.length + 1,
        itemBuilder: (context, index) {
          if (index == _items.length) return _buildFooter(context);

          final payment = _items[index];
          final row = _PaymentRow(
            payment: payment,
            quoteNo: _quoteNos[payment.quotationId] ?? '',
            customerName: _customerNames[payment.quotationId] ?? '',
            onTap: () => _openSheet(payment: payment),
            onDelete: () => _confirmAndDelete(payment),
          );

          if (index >= _maxStaggeredRows) return row;
          return row
              .animate()
              .fadeIn(duration: 200.ms, delay: (index * 25).ms)
              .slideY(begin: 0.06, end: 0, duration: 200.ms);
        },
      ),
    );
  }

  Widget _buildFooter(BuildContext context) {
    if (_loadingMore) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 20),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (_hasMore) {
      return const SizedBox(height: 24);
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 20),
      child: Center(
        child: Text(
          '${_items.length} payment${_items.length == 1 ? '' : 's'}',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ),
    );
  }
}

/// Labels resolved for one page, returned as a value so the caller can apply
/// them inside a single guarded `setState`.
class _PageLabels {
  const _PageLabels(this.quoteNos, this.customerNames);

  final Map<String, String> quoteNos;
  final Map<String, String> customerNames;
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

class _PaymentRow extends StatelessWidget {
  const _PaymentRow({
    required this.payment,
    required this.quoteNo,
    required this.customerName,
    required this.onTap,
    required this.onDelete,
  });

  final OfflinePayment payment;
  final String quoteNo;
  final String customerName;
  final VoidCallback onTap;
  final Future<bool> Function() onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    final title = <String>[
      if (quoteNo.isNotEmpty) quoteNo,
      if (customerName.isNotEmpty) customerName,
    ].join('  •  ');

    final subtitleParts = <String>[
      formatQuoteDate(payment.date),
      payment.method.label,
      if (payment.reference.trim().isNotEmpty) payment.reference.trim(),
    ];

    return Dismissible(
      key: ValueKey<String>(payment.id ?? identityHashCode(payment).toString()),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        color: scheme.error,
        child: Icon(Icons.delete_outline, color: scheme.onError),
      ),
      // ⚠️ ALWAYS returns false. `confirmDismiss` performs the delete itself and
      // the row is removed from the parent's list on success; returning true
      // would make Dismissible ALSO remove it, desyncing the list from state.
      confirmDismiss: (_) async {
        await onDelete();
        return false;
      },
      child: Card(
        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        child: ListTile(
          onTap: onTap,
          onLongPress: () => onDelete(),
          leading: CircleAvatar(
            backgroundColor: Colors.green.withValues(alpha: 0.14),
            child: Icon(_iconFor(payment.method),
                size: 20, color: Colors.green.shade800),
          ),
          title: Text(
            title.isEmpty ? '(quotation not found)' : title,
            style: const TextStyle(fontWeight: FontWeight.w600),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          subtitle: Text(
            subtitleParts.join('  •  '),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          trailing: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 120),
            // Money scales down rather than ellipsising — a truncated figure is
            // worse than a small one.
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerRight,
              child: Text(
                formatInr(payment.amount),
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: Colors.green.shade800,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  static IconData _iconFor(PaymentMethod method) => switch (method) {
        PaymentMethod.cash => Icons.payments_outlined,
        PaymentMethod.upi => Icons.qr_code_2,
        PaymentMethod.bankTransfer => Icons.account_balance_outlined,
        PaymentMethod.cheque => Icons.receipt_long_outlined,
        PaymentMethod.card => Icons.credit_card,
        PaymentMethod.other => Icons.attach_money,
      };
}

// ---------------------------------------------------------------------------
// Header card
// ---------------------------------------------------------------------------

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.label,
    required this.sublabel,
    required this.value,
    required this.icon,
    required this.color,
  });

  final String label;
  final String sublabel;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Row(
              children: <Widget>[
                Icon(icon, size: 16, color: color),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    label,
                    style: theme.textTheme.labelMedium,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                value,
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: color,
                ),
              ),
            ),
            const SizedBox(height: 2),
            Text(
              sublabel,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Empty / error
// ---------------------------------------------------------------------------

class _EmptyView extends StatelessWidget {
  const _EmptyView({
    required this.filtered,
    required this.onClearFilters,
    required this.onAdd,
  });

  /// True when payments EXIST but none match the active filter. Drives a
  /// completely different message — see `_anyPaymentsAtAll`.
  final bool filtered;
  final VoidCallback onClearFilters;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // LayoutBuilder + ConstrainedBox so pull-to-refresh still works on an empty
    // screen (a bare Center has no scrollable extent).
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Icon(
                    filtered ? Icons.filter_alt_off_outlined : Icons.savings_outlined,
                    size: 56,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(height: 14),
                  Text(
                    filtered
                        ? 'No payments match this filter'
                        : 'No payments recorded yet',
                    style: theme.textTheme.titleMedium,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    filtered
                        ? 'Your payments are still there — try a wider date '
                            'range or a different search.'
                        : 'Record what customers pay you and the app keeps '
                            'every balance up to date.',
                    style: theme.textTheme.bodySmall,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 18),
                  if (filtered)
                    OutlinedButton.icon(
                      onPressed: onClearFilters,
                      icon: const Icon(Icons.clear_all),
                      label: const Text('Clear filters'),
                    )
                  else
                    FilledButton.icon(
                      onPressed: onAdd,
                      icon: const Icon(Icons.add),
                      label: const Text('Record the first payment'),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(Icons.error_outline,
                size: 48, color: theme.colorScheme.error),
            const SizedBox(height: 12),
            Text('Could not load payments',
                style: theme.textTheme.titleMedium),
            const SizedBox(height: 6),
            Text(
              message,
              style: theme.textTheme.bodySmall,
              textAlign: TextAlign.center,
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () => onRetry(),
              icon: const Icon(Icons.refresh),
              label: const Text('Try again'),
            ),
          ],
        ),
      ),
    );
  }
}
