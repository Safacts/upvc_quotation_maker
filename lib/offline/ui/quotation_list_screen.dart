/// OFFLINE TIER — QUOTATION LIST.
///
/// ZERO-SERVER CONTRACT: no `supabase_flutter`, no `http`, no `connectivity_plus`,
/// no `lib/services/**`. See `lib/offline/core/models.dart` for the full rule.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../core/models.dart';
import '../data/quotation_repository.dart';
import 'quotation_editor_screen.dart';

/// Rows fetched per page. Matches [QuotationRepository.list]'s default — a
/// client with years of history must never pay to load it all to scroll a
/// screenful.
const int _pageSize = 50;

/// Keystroke settle time before a query is issued.
///
/// Typing "venkateshwara" is 13 characters; without a debounce that is 13
/// SQLite LIKE scans over the whole table, and on an old phone the field
/// visibly stutters. 300 ms is below the threshold where the list feels lazy.
const Duration _debounce = Duration(milliseconds: 300);

class QuotationListScreen extends StatefulWidget {
  const QuotationListScreen({super.key});

  @override
  State<QuotationListScreen> createState() => _QuotationListScreenState();
}

class _QuotationListScreenState extends State<QuotationListScreen> {
  final QuotationRepository _repo = QuotationRepository();
  final TextEditingController _searchController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  Timer? _debounceTimer;

  final List<QuotationSummary> _items = <QuotationSummary>[];

  String _search = '';
  OfflineQuotationStatus? _status;

  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = true;
  String? _error;

  /// Incremented on every filter/search change. An in-flight page that belongs
  /// to an older query checks this before touching state — otherwise a slow
  /// first query can land AFTER a newer one and repopulate the list with
  /// results for text the user already deleted.
  int _queryEpoch = 0;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _reload();
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final position = _scrollController.position;
    // 400px of runway so the next page is usually already in place by the time
    // the user reaches the tail — no visible spinner on a fast device.
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

  void _onStatusChanged(OfflineQuotationStatus? status) {
    if (_status == status) return;
    setState(() => _status = status);
    _reload();
  }

  /// Fresh first page for the current search + status.
  Future<void> _reload() async {
    final epoch = ++_queryEpoch;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final page = await _repo.list(
        search: _search.isEmpty ? null : _search,
        status: _status,
        limit: _pageSize,
        offset: 0,
      );
      if (!mounted || epoch != _queryEpoch) return;
      setState(() {
        _items
          ..clear()
          ..addAll(page);
        // A short page means the table is exhausted; asking again would be a
        // guaranteed-empty query on every scroll to the bottom.
        _hasMore = page.length == _pageSize;
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

  Future<void> _loadMore() async {
    if (_loadingMore || !_hasMore || _loading || _error != null) return;
    final epoch = _queryEpoch;
    setState(() => _loadingMore = true);

    try {
      final page = await _repo.list(
        search: _search.isEmpty ? null : _search,
        status: _status,
        limit: _pageSize,
        offset: _items.length,
      );
      if (!mounted || epoch != _queryEpoch) return;
      setState(() {
        _items.addAll(page);
        _hasMore = page.length == _pageSize;
        _loadingMore = false;
      });
    } catch (e) {
      if (!mounted || epoch != _queryEpoch) return;
      setState(() => _loadingMore = false);
      // A failed *extra* page is not a screen-level error — the rows already on
      // screen are still valid, so this stays a transient message.
      _snack('Could not load more quotations: $e');
    }
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(behavior: SnackBarBehavior.floating, content: Text(message)),
    );
  }

  Future<void> _openEditor({String? id}) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => QuotationEditorScreen(quotationId: id),
      ),
    );
    if (!mounted) return;
    if (changed == true) await _reload();
  }

  Future<bool> _confirmDelete(QuotationSummary q) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(18)),
        ),
        title: const Text('Delete this quotation?'),
        content: Text(
          '${q.quoteNo.isEmpty ? "This quotation" : q.quoteNo} for '
          '${q.customerName.isEmpty ? "(no customer name)" : q.customerName} '
          'will be removed from this device along with all of its items.\n\n'
          'There is no cloud backup on this plan, so this cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    return ok ?? false;
  }

  Future<void> _delete(QuotationSummary q) async {
    try {
      await _repo.delete(q.id);
      if (!mounted) return;
      setState(() => _items.removeWhere((e) => e.id == q.id));
      _snack('Quotation deleted');
    } catch (e) {
      if (!mounted) return;
      // The row is still on screen because removal only happens on success —
      // the user must never be told a delete worked when it did not.
      _snack('Could not delete: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Quotations',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openEditor(),
        icon: const Icon(Icons.add),
        label: const Text('New'),
      ),
      body: SafeArea(
        child: Column(
          children: [
            _buildSearchField(),
            _buildFilterChips(),
            const Divider(height: 1),
            Expanded(child: _buildList()),
          ],
        ),
      ),
    );
  }

  Widget _buildSearchField() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: TextField(
        controller: _searchController,
        textInputAction: TextInputAction.search,
        onChanged: _onSearchChanged,
        // Enter should not have to wait out the debounce.
        onSubmitted: (v) {
          _debounceTimer?.cancel();
          _search = v.trim();
          _reload();
        },
        decoration: InputDecoration(
          hintText: 'Search quote no, customer or phone',
          prefixIcon: const Icon(Icons.search),
          isDense: true,
          suffixIcon: _searchController.text.isEmpty
              ? null
              : IconButton(
                  icon: const Icon(Icons.clear),
                  tooltip: 'Clear',
                  onPressed: () {
                    _debounceTimer?.cancel();
                    _searchController.clear();
                    _search = '';
                    _reload();
                  },
                ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
      ),
    );
  }

  Widget _buildFilterChips() {
    Widget chip(String label, OfflineQuotationStatus? value) {
      final selected = _status == value;
      final color = value == null ? Colors.indigo : _statusColor(value);
      return Padding(
        padding: const EdgeInsets.only(right: 8),
        child: FilterChip(
          label: Text(label),
          selected: selected,
          showCheckmark: false,
          selectedColor: color.withValues(alpha: 0.16),
          side: BorderSide(
            color: selected
                ? color.withValues(alpha: 0.6)
                : Colors.grey.withValues(alpha: 0.35),
          ),
          labelStyle: TextStyle(
            fontSize: 12,
            fontWeight: selected ? FontWeight.bold : FontWeight.normal,
            color: selected ? color : null,
          ),
          onSelected: (_) => _onStatusChanged(value),
        ),
      );
    }

    return SizedBox(
      height: 46,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          chip('All', null),
          chip('Draft', OfflineQuotationStatus.draft),
          chip('Sent', OfflineQuotationStatus.sent),
          chip('Won', OfflineQuotationStatus.won),
          chip('Lost', OfflineQuotationStatus.lost),
        ],
      ),
    );
  }

  Widget _buildList() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return _ErrorView(message: _error!, onRetry: _reload);
    }

    if (_items.isEmpty) {
      return _EmptyView(
        filtered: _search.isNotEmpty || _status != null,
        onCreate: () => _openEditor(),
        onClearFilters: () {
          _debounceTimer?.cancel();
          _searchController.clear();
          _search = '';
          setState(() => _status = null);
          _reload();
        },
      );
    }

    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView.builder(
        controller: _scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
        // +1 for the tail tile (spinner or end-of-list marker).
        itemCount: _items.length + 1,
        itemBuilder: (context, index) {
          if (index == _items.length) return _buildTail();
          return _buildRow(_items[index], index);
        },
      ),
    );
  }

  Widget _buildTail() {
    if (_hasMore) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 22),
        child: Center(
          child: SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 2.4),
          ),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 20),
      child: Center(
        child: Text(
          '${_items.length} quotation${_items.length == 1 ? "" : "s"}',
          style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
        ),
      ),
    );
  }

  Widget _buildRow(QuotationSummary q, int index) {
    final card = Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: Colors.grey.withValues(alpha: 0.25)),
      ),
      child: ListTile(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        leading: CircleAvatar(
          backgroundColor: _statusColor(q.status).withValues(alpha: 0.12),
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
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            '${q.quoteNo}  •  ${formatQuoteDate(q.date)}  •  '
            '${q.itemCount} item${q.itemCount == 1 ? "" : "s"}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12),
          ),
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              formatInr(q.grandTotal),
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
            ),
            const SizedBox(height: 5),
            _StatusChip(status: q.status),
          ],
        ),
        onTap: () => _openEditor(id: q.id),
        onLongPress: () => _showRowMenu(q),
      ),
    );

    return Dismissible(
      key: ValueKey<String>(q.id),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 22),
        decoration: BoxDecoration(
          color: Colors.red.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(14),
        ),
        child: const Icon(Icons.delete_outline, color: Colors.red),
      ),
      // Confirm BEFORE the row animates away: a swipe is easy to trigger by
      // accident while scrolling, and there is no cloud copy to restore from.
      confirmDismiss: (_) async {
        final ok = await _confirmDelete(q);
        if (!ok) return false;
        await _delete(q);
        // Deletion already removed the row from `_items`; returning false stops
        // Dismissible from also removing it and desyncing the list.
        return false;
      },
      child: card,
    )
        .animate()
        // Only the first screenful animates — staggering row 300 would make a
        // long scroll feel laggy for no benefit.
        .fadeIn(
          duration: 200.ms,
          delay: Duration(milliseconds: index < 8 ? index * 25 : 0),
        );
  }

  Future<void> _showRowMenu(QuotationSummary q) async {
    await showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            ListTile(
              title: Text(
                q.quoteNo.isEmpty ? 'Quotation' : q.quoteNo,
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              subtitle: Text(q.customerName),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: const Text('Open'),
              onTap: () {
                Navigator.pop(ctx);
                _openEditor(id: q.id);
              },
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline, color: Colors.red),
              title: const Text(
                'Delete',
                style: TextStyle(color: Colors.red),
              ),
              onTap: () async {
                Navigator.pop(ctx);
                if (await _confirmDelete(q)) await _delete(q);
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Presentational pieces
// ---------------------------------------------------------------------------

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

class _EmptyView extends StatelessWidget {
  const _EmptyView({
    required this.filtered,
    required this.onCreate,
    required this.onClearFilters,
  });

  /// True when the list is empty only because of the search box or a chip —
  /// telling a user with 400 quotations that they have none is alarming.
  final bool filtered;
  final VoidCallback onCreate;
  final VoidCallback onClearFilters;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    filtered ? Icons.search_off : Icons.description_outlined,
                    size: 64,
                    color: Colors.grey.shade400,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    filtered
                        ? 'No matching quotations'
                        : 'No quotations yet',
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    filtered
                        ? 'Try a different name, quote number or status.'
                        : 'Quotations you create are saved on this device '
                            'and work without internet.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.grey.shade600,
                    ),
                  ),
                  const SizedBox(height: 20),
                  if (filtered)
                    OutlinedButton.icon(
                      icon: const Icon(Icons.filter_alt_off_outlined),
                      label: const Text('Clear filters'),
                      onPressed: onClearFilters,
                    )
                  else
                    ElevatedButton.icon(
                      icon: const Icon(Icons.add),
                      label: const Text('Create your first quotation'),
                      onPressed: onCreate,
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
              'Could not load quotations',
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
