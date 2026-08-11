/// OFFLINE TIER — CUSTOMER LEDGER / STATEMENT OF ACCOUNT.
///
/// ZERO-SERVER CONTRACT: no `supabase_flutter`, no `http`, no
/// `connectivity_plus`, no `lib/services/**`, no `../../supabase_config.dart`.
/// See `lib/offline/core/models.dart` for the full rule; the build fails on a
/// violation via `test/offline_no_network_test.dart`.
///
/// This screen is what the owner reconciles against their bank and shows a
/// customer who disputes a balance. Every figure on it comes straight from
/// `PaymentRepository.customerLedger` — nothing is recomputed here, because two
/// places doing the same subtraction is how they end up disagreeing.
library;

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../core/models.dart';
import '../core/payment_models.dart';
import '../data/payment_repository.dart';
import 'payment_entry_sheet.dart';

/// Rows past this index are NOT staggered — see the payments screen.
const int _maxStaggeredRows = 8;

/// Date-range presets.
///
/// `thisFy` / `lastFy` follow the INDIAN financial year, which starts on
/// 1 April. The owner files on this; see [_fyBoundsFor].
enum _RangePreset { allTime, thisMonth, lastMonth, thisFy, lastFy, custom }

extension _RangePresetX on _RangePreset {
  String get label => switch (this) {
        _RangePreset.allTime => 'All time',
        _RangePreset.thisMonth => 'This month',
        _RangePreset.lastMonth => 'Last month',
        _RangePreset.thisFy => 'This FY',
        _RangePreset.lastFy => 'Last FY',
        _RangePreset.custom => 'Custom',
      };
}

/// Inclusive date bounds for a preset, or `(null, null)` for all time.
///
/// 🔴 INDIAN FINANCIAL YEAR: 1 April to 31 March.
///  * On/after 1 Apr, "this FY" is `1-Apr-thisYear .. 31-Mar-(thisYear+1)`.
///  * Before 1 Apr, the current FY STARTED LAST YEAR:
///    `1-Apr-(thisYear-1) .. 31-Mar-thisYear`.
/// "Last FY" is the same window shifted back one year.
///
/// Getting this wrong by a single day silently misstates the owner's turnover
/// for a whole year at exactly the moment they are filing it. Worked examples:
///  * 10-Aug-2026 -> this FY 01-04-2026..31-03-2027, last FY 01-04-2025..31-03-2026
///  * 31-Mar-2026 -> this FY 01-04-2025..31-03-2026, last FY 01-04-2024..31-03-2025
///  * 01-Apr-2026 -> this FY 01-04-2026..31-03-2027
(DateTime?, DateTime?) _fyBoundsFor(_RangePreset preset, DateTime now) {
  switch (preset) {
    case _RangePreset.allTime:
    case _RangePreset.custom:
      return (null, null);

    case _RangePreset.thisMonth:
      return (
        DateTime(now.year, now.month, 1),
        // Day 0 of next month = last day of this one, leap years included.
        DateTime(now.year, now.month + 1, 0),
      );

    case _RangePreset.lastMonth:
      return (
        DateTime(now.year, now.month - 1, 1),
        DateTime(now.year, now.month, 0),
      );

    case _RangePreset.thisFy:
      final startYear = now.month >= DateTime.april ? now.year : now.year - 1;
      return (DateTime(startYear, 4, 1), DateTime(startYear + 1, 3, 31));

    case _RangePreset.lastFy:
      final currentStart =
          now.month >= DateTime.april ? now.year : now.year - 1;
      final startYear = currentStart - 1;
      return (DateTime(startYear, 4, 1), DateTime(startYear + 1, 3, 31));
  }
}

class CustomerLedgerScreen extends StatefulWidget {
  const CustomerLedgerScreen({
    super.key,
    required this.customerId,
    this.customerName,
  });

  final String customerId;

  /// Shown in the app bar until the ledger resolves the authoritative name.
  final String? customerName;

  @override
  State<CustomerLedgerScreen> createState() => _CustomerLedgerScreenState();
}

class _CustomerLedgerScreenState extends State<CustomerLedgerScreen> {
  final PaymentRepository _repo = PaymentRepository();

  CustomerLedger? _ledger;
  bool _loading = true;
  String? _error;

  _RangePreset _preset = _RangePreset.allTime;
  DateTime? _from;
  DateTime? _to;

  /// Set when a payment is recorded from this screen, so the caller can refresh.
  bool _changed = false;

  /// 🔴 STALE-QUERY GUARD — see `payments_screen.dart`. Flicking between FY
  /// presets fires several overlapping queries; without this the slowest one
  /// wins and the statement shows a period the user is no longer looking at.
  int _queryEpoch = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final epoch = ++_queryEpoch;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final ledger = await _repo.customerLedger(
        widget.customerId,
        from: _from,
        to: _to,
      );
      if (!mounted || epoch != _queryEpoch) return;
      setState(() {
        _ledger = ledger;
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

  Future<void> _applyPreset(_RangePreset preset) async {
    if (preset == _RangePreset.custom) {
      await _pickCustomRange();
      return;
    }
    final bounds = _fyBoundsFor(preset, DateTime.now());
    _preset = preset;
    _from = bounds.$1;
    _to = bounds.$2;
    await _load();
  }

  Future<void> _pickCustomRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 10),
      lastDate: DateTime(now.year + 2, 12, 31),
      initialDateRange: (_from != null && _to != null)
          ? DateTimeRange(start: _from!, end: _to!)
          : null,
      helpText: 'Statement period',
    );
    if (!mounted || picked == null) return;
    _preset = _RangePreset.custom;
    _from = paymentDateOnly(picked.start);
    _to = paymentDateOnly(picked.end);
    await _load();
  }

  Future<void> _addPayment() async {
    final saved = await PaymentEntrySheet.show(
      context,
      customerId: widget.customerId,
      customerName: _ledger?.customerName ?? widget.customerName,
    );
    if (!mounted || saved != true) return;
    _changed = true;
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final title = _ledger?.customerName.trim().isNotEmpty == true
        ? _ledger!.customerName
        : (widget.customerName?.trim().isNotEmpty == true
            ? widget.customerName!
            : 'Customer ledger');

    return PopScope<bool>(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        Navigator.of(context).pop(_changed);
      },
      child: Scaffold(
        appBar: AppBar(
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
              Text(
                'Statement of account',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: _addPayment,
          icon: const Icon(Icons.add),
          label: const Text('Add payment'),
        ),
        body: Column(
          children: <Widget>[
            _buildPresetBar(context),
            if (_from != null || _to != null) _buildRangeLine(context),
            _buildTotals(context),
            const Divider(height: 1),
            Expanded(child: _buildBody(context)),
          ],
        ),
      ),
    );
  }

  Widget _buildPresetBar(BuildContext context) {
    return SizedBox(
      height: 52,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        children: <Widget>[
          for (final preset in _RangePreset.values)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(preset.label),
                selected: _preset == preset,
                onSelected: (_) => _applyPreset(preset),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildRangeLine(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Text(
          '${_from == null ? '...' : formatQuoteDate(_from!)}'
          '  to  '
          '${_to == null ? '...' : formatQuoteDate(_to!)}',
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }

  Widget _buildTotals(BuildContext context) {
    final theme = Theme.of(context);
    final ledger = _ledger;
    final billed = ledger?.totalDebit ?? 0;
    final received = ledger?.totalCredit ?? 0;
    final closing = ledger?.closingBalance ?? 0;

    // 🔴 Never `closing == 0` on a double. Three instalments summing a few
    // nano-rupees off the total would read as "Receivable Rs.0.00", and the
    // owner would chase a customer who has already paid in full.
    final settled = closing.abs() <= kMoneyEpsilon;
    final isAdvance = closing < -kMoneyEpsilon;

    final String closingLabel;
    final Color closingColor;
    if (settled) {
      closingLabel = 'Settled';
      closingColor = Colors.green.shade700;
    } else if (isAdvance) {
      closingLabel = 'Advance held';
      closingColor = Colors.blue.shade700;
    } else {
      closingLabel = 'Receivable';
      closingColor = Colors.orange.shade800;
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 10),
      child: Column(
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: _TotalTile(
                  label: 'Total billed',
                  value: formatInr(billed),
                  helper: 'Debit',
                  color: Colors.deepOrange.shade700,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _TotalTile(
                  label: 'Total received',
                  value: formatInr(received),
                  helper: 'Credit',
                  color: Colors.green.shade700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: closingColor.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: closingColor.withValues(alpha: 0.5)),
            ),
            child: Row(
              children: <Widget>[
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text('Closing balance',
                          style: theme.textTheme.labelMedium),
                      Text(
                        // Labelled in WORDS as well as coloured — colour alone
                        // fails for a colour-blind user and prints uselessly on
                        // a mono printer.
                        closingLabel,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: closingColor,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Flexible(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerRight,
                    child: Text(
                      formatInr(closing.abs()),
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: closingColor,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ).animate().fadeIn(duration: 220.ms).slideY(begin: -0.05, end: 0),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    final error = _error;
    if (error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(Icons.error_outline,
                  size: 48, color: Theme.of(context).colorScheme.error),
              const SizedBox(height: 12),
              Text('Could not load the ledger',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 6),
              Text(
                error,
                textAlign: TextAlign.center,
                maxLines: 4,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: _load,
                icon: const Icon(Icons.refresh),
                label: const Text('Try again'),
              ),
            ],
          ),
        ),
      );
    }

    final entries = _ledger?.entries ?? const <LedgerEntry>[];
    if (entries.isEmpty) {
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
                    Icon(Icons.receipt_long_outlined,
                        size: 56,
                        color: Theme.of(context).colorScheme.onSurfaceVariant),
                    const SizedBox(height: 14),
                    Text(
                      'No transactions in this period',
                      style: Theme.of(context).textTheme.titleMedium,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      _preset == _RangePreset.allTime
                          ? 'Nothing has been billed to or received from this '
                              'customer yet.'
                          : 'Try a wider period — earlier transactions are '
                              'still there.',
                      style: Theme.of(context).textTheme.bodySmall,
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: Column(
        children: <Widget>[
          const _LedgerHeaderRow(),
          const Divider(height: 1),
          Expanded(
            // ListView.builder — a customer with three years of history can
            // easily run to hundreds of rows.
            child: ListView.builder(
              padding: const EdgeInsets.only(bottom: 96),
              itemCount: entries.length,
              itemBuilder: (context, index) {
                final row = _LedgerRow(entry: entries[index], index: index);
                if (index >= _maxStaggeredRows) return row;
                return row
                    .animate()
                    .fadeIn(duration: 200.ms, delay: (index * 25).ms)
                    .slideY(begin: 0.06, end: 0, duration: 200.ms);
              },
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Statement rows
// ---------------------------------------------------------------------------

/// Column widths shared by the header and every row, so they line up.
///
/// A `DataTable` would need a horizontal scroll to fit six columns on a 5"
/// screen; these flex weights plus `FittedBox` on the money keep the whole
/// statement readable without one.
const int _flexDate = 22;
const int _flexDetail = 34;
const int _flexMoney = 15;

class _LedgerHeaderRow extends StatelessWidget {
  const _LedgerHeaderRow();

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.labelSmall?.copyWith(
          fontWeight: FontWeight.w700,
        );
    return Container(
      color: Theme.of(context)
          .colorScheme
          .surfaceContainerHighest
          .withValues(alpha: 0.5),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: <Widget>[
          Expanded(flex: _flexDate, child: Text('Date', style: style)),
          Expanded(
              flex: _flexDetail, child: Text('Ref / details', style: style)),
          Expanded(
            flex: _flexMoney,
            child: Text('Debit', style: style, textAlign: TextAlign.right),
          ),
          Expanded(
            flex: _flexMoney,
            child: Text('Credit', style: style, textAlign: TextAlign.right),
          ),
          Expanded(
            flex: _flexMoney + 4,
            child: Text('Balance', style: style, textAlign: TextAlign.right),
          ),
        ],
      ),
    );
  }
}

class _LedgerRow extends StatelessWidget {
  const _LedgerRow({required this.entry, required this.index});

  final LedgerEntry entry;
  final int index;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    final debitColor = Colors.deepOrange.shade700;
    final creditColor = Colors.green.shade700;

    final balance = entry.runningBalance;
    final balanceIsAdvance = balance < -kMoneyEpsilon;

    return Container(
      color: index.isOdd
          ? scheme.surfaceContainerHighest.withValues(alpha: 0.22)
          : null,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Expanded(
            flex: _flexDate,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  formatQuoteDate(entry.date),
                  style: theme.textTheme.bodySmall
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
                // The type is spelled out in text, not left to colour alone.
                Text(
                  entry.isQuotation ? 'Invoice' : 'Receipt',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: entry.isQuotation ? debitColor : creditColor,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            flex: _flexDetail,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  entry.ref,
                  style: theme.textTheme.bodySmall
                      ?.copyWith(fontWeight: FontWeight.w600),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  entry.description,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          Expanded(
            flex: _flexMoney,
            child: _Money(
              // A dash, not "0.00" — an empty column is how a statement shows
              // "this side does not apply", and a zero reads as a real entry.
              text: entry.debit > kMoneyEpsilon
                  ? formatAmount(entry.debit)
                  : '\u2014',
              color: entry.debit > kMoneyEpsilon ? debitColor : null,
            ),
          ),
          Expanded(
            flex: _flexMoney,
            child: _Money(
              text: entry.credit > kMoneyEpsilon
                  ? formatAmount(entry.credit)
                  : '\u2014',
              color: entry.credit > kMoneyEpsilon ? creditColor : null,
            ),
          ),
          Expanded(
            flex: _flexMoney + 4,
            child: _Money(
              // `Cr` is the accountant's own notation for "the business owes
              // them" — clearer and shorter than a minus sign, which is easy to
              // miss at this size.
              text: balanceIsAdvance
                  ? '${formatAmount(balance.abs())} Cr'
                  : formatAmount(balance.abs() <= kMoneyEpsilon ? 0 : balance),
              color: balanceIsAdvance ? Colors.blue.shade700 : null,
              bold: true,
            ),
          ),
        ],
      ),
    );
  }
}

/// Right-aligned money that SCALES DOWN instead of ellipsising.
///
/// A truncated figure on a statement ("1,20,0...") is worse than a small one:
/// it is unreadable AND looks like the app lost data.
class _Money extends StatelessWidget {
  const _Money({required this.text, this.color, this.bold = false});

  final String text;
  final Color? color;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return FittedBox(
      fit: BoxFit.scaleDown,
      alignment: Alignment.centerRight,
      child: Text(
        text,
        style: theme.textTheme.bodySmall?.copyWith(
          color: color,
          fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
        ),
      ),
    );
  }
}

class _TotalTile extends StatelessWidget {
  const _TotalTile({
    required this.label,
    required this.value,
    required this.helper,
    required this.color,
  });

  final String label;
  final String value;

  /// "Debit" / "Credit" — the same information the colour carries, in words.
  final String helper;
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
            Text(label, style: theme.textTheme.labelMedium),
            const SizedBox(height: 4),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                value,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: color,
                ),
              ),
            ),
            Text(
              helper,
              style: theme.textTheme.labelSmall?.copyWith(color: color),
            ),
          ],
        ),
      ),
    );
  }
}
