/// OFFLINE TIER — RECORD / EDIT A PAYMENT (modal bottom sheet).
///
/// ZERO-SERVER CONTRACT: no `supabase_flutter`, no `http`, no
/// `connectivity_plus`, no `lib/services/**`, no `../../supabase_config.dart`.
/// See `lib/offline/core/models.dart` for the full rule; the build fails on a
/// violation via `test/offline_no_network_test.dart`.
///
/// This sheet is the ONLY place money enters the offline tier. Everything here
/// is defensive on purpose: a mistyped receipt is not a cosmetic bug, it is the
/// owner chasing a customer who already paid, or writing off money they never
/// received.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../core/models.dart';
import '../core/payment_models.dart';
import '../data/payment_repository.dart';
import '../data/quotation_repository.dart';

/// Minimum characters before the quotation picker hits SQLite.
///
/// One character matches most of the table and returns a list that is useless
/// to read, while costing a full LIKE scan on every keystroke.
const int _minPickerChars = 2;

/// Options shown in the quotation picker. More than this and the overlay
/// covers the amount field it is meant to help fill in.
const int _maxPickerOptions = 8;

/// Record a new payment, or edit an existing one.
///
/// Two ways in:
///  * From a quotation (pass [quotationId] + friends) — the picker is hidden
///    and the balance context is available immediately.
///  * From the payments screen with nothing (`PaymentEntrySheet.show(context)`)
///    — a searchable quotation picker appears, because a receipt with no
///    parent document cannot be reconciled and the repository rejects it
///    anyway (`UnknownQuotationException`).
class PaymentEntrySheet extends StatefulWidget {
  const PaymentEntrySheet({
    super.key,
    this.payment,
    this.quotationId,
    this.quotationNo,
    this.customerId,
    this.customerName,
    this.suggestedAmount,
  });

  /// Non-null = edit. The instance is COPIED before mutation so a cancelled
  /// edit cannot leave a half-changed model in the caller's list.
  final OfflinePayment? payment;

  final String? quotationId;
  final String? quotationNo;

  /// Used only to prefill the picker's search box when no [quotationId] was
  /// supplied. The stored `customer_id` always comes from the QUOTATION —
  /// `PaymentRepository.save` overwrites whatever we set (see its guard 3).
  final String? customerId;
  final String? customerName;

  /// Prefill for the amount field, typically the outstanding balance.
  final double? suggestedAmount;

  /// Show the sheet. Resolves to `true` when a payment was saved.
  ///
  /// `isScrollControlled: true` is NOT optional — without it the sheet is
  /// capped at half the screen and the on-screen keyboard covers the amount
  /// field on a 5" phone, which is the only field that must be visible.
  static Future<bool?> show(
    BuildContext context, {
    OfflinePayment? payment,
    String? quotationId,
    String? quotationNo,
    String? customerId,
    String? customerName,
    double? suggestedAmount,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => PaymentEntrySheet(
        payment: payment,
        quotationId: quotationId,
        quotationNo: quotationNo,
        customerId: customerId,
        customerName: customerName,
        suggestedAmount: suggestedAmount,
      ),
    );
  }

  @override
  State<PaymentEntrySheet> createState() => _PaymentEntrySheetState();
}

class _PaymentEntrySheetState extends State<PaymentEntrySheet> {
  final PaymentRepository _payments = PaymentRepository();
  final QuotationRepository _quotations = QuotationRepository();

  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();

  // Every controller and focus node created here is disposed in `dispose()`.
  // A leaked controller on a sheet that opens dozens of times a day is a real
  // memory growth path, and a live FocusNode can outlive its render object.
  final TextEditingController _amountController = TextEditingController();
  final TextEditingController _referenceController = TextEditingController();
  final TextEditingController _notesController = TextEditingController();
  final TextEditingController _pickerController = TextEditingController();
  final FocusNode _amountFocus = FocusNode();
  final FocusNode _referenceFocus = FocusNode();
  final FocusNode _notesFocus = FocusNode();
  final FocusNode _pickerFocus = FocusNode();

  /// The working copy. Never `widget.payment` itself — see [PaymentEntrySheet].
  late OfflinePayment _draft;

  /// True when the caller did not name a quotation, so the picker is shown.
  late final bool _needsPicker;

  String _quotationLabel = '';
  String _customerLabel = '';

  /// Balance context for the selected quotation. Null until loaded / when no
  /// quotation is selected yet.
  PaymentSummary? _summary;
  bool _loadingSummary = false;

  /// Amount already received against this quotation EXCLUDING the receipt being
  /// edited.
  ///
  /// ⚠️ `summaryFor` counts the row under edit, so a Rs.10,000 payment being
  /// corrected to Rs.12,000 would otherwise read as "already paid 10,000, this
  /// adds 12,000" and show a 22,000 total against a 12,000 job. Subtracting the
  /// original amount is what makes the edit path tell the truth.
  double _paidExcludingThis = 0;

  bool _saving = false;

  /// Bumped on every summary load; a slow load for quotation A must not paint
  /// its balance under quotation B after the user changed the selection.
  int _queryEpoch = 0;

  @override
  void initState() {
    super.initState();

    final existing = widget.payment;
    _draft = existing?.copy() ??
        OfflinePayment(
          quotationId: widget.quotationId ?? '',
          customerId: widget.customerId ?? '',
          date: DateTime.now(),
        );

    // An explicitly passed quotation always wins over the edited payment's own
    // (they are the same in practice; if they ever differ the caller is more
    // specific about the context the user is looking at).
    if ((widget.quotationId ?? '').isNotEmpty) {
      _draft.quotationId = widget.quotationId!;
    }

    _needsPicker = _draft.quotationId.isEmpty;

    _quotationLabel = widget.quotationNo ?? '';
    _customerLabel = widget.customerName ?? '';

    if (existing != null && existing.amount > 0) {
      _amountController.text = _plainAmount(existing.amount);
    } else if (widget.suggestedAmount != null &&
        widget.suggestedAmount! > kMoneyEpsilon) {
      _amountController.text = _plainAmount(widget.suggestedAmount!);
    }

    _referenceController.text = _draft.reference;
    _notesController.text = _draft.notes;

    if (_draft.quotationId.isNotEmpty) {
      _loadSummary(_draft.quotationId);
    }
  }

  @override
  void dispose() {
    _amountController.dispose();
    _referenceController.dispose();
    _notesController.dispose();
    _pickerController.dispose();
    _amountFocus.dispose();
    _referenceFocus.dispose();
    _notesFocus.dispose();
    _pickerFocus.dispose();
    super.dispose();
  }

  /// Editable text for a money value: no grouping, no symbol.
  ///
  /// `formatInr`/`formatAmount` insert commas for DISPLAY; feeding one back
  /// into a field whose formatter strips commas would mangle 1,20,000 into
  /// 120000 on the first keystroke, or worse, 1.20000 if a decimal survived.
  static String _plainAmount(double v) {
    final fixed = v.toStringAsFixed(2);
    return fixed.endsWith('.00') ? fixed.substring(0, fixed.length - 3) : fixed;
  }

  // ---------------------------------------------------------------------------
  // Balance context
  // ---------------------------------------------------------------------------

  Future<void> _loadSummary(String quotationId) async {
    final epoch = ++_queryEpoch;
    setState(() => _loadingSummary = true);

    try {
      final summary = await _payments.summaryFor(quotationId);
      if (!mounted || epoch != _queryEpoch) return;

      // Only discount the edited receipt when it belongs to the quotation we
      // just summarised — re-pointing a payment at a DIFFERENT quotation must
      // not subtract its amount from a total it was never part of.
      final original = widget.payment;
      final discount = (original != null &&
              original.quotationId == quotationId &&
              original.amount.isFinite)
          ? original.amount
          : 0.0;

      setState(() {
        _summary = summary;
        _paidExcludingThis = summary.paid - discount;
        _loadingSummary = false;
      });
    } catch (e) {
      if (!mounted || epoch != _queryEpoch) return;
      // A failed context load must NOT block recording the money. The owner can
      // still save; they simply lose the running-balance hint.
      setState(() {
        _summary = null;
        _paidExcludingThis = 0;
        _loadingSummary = false;
      });
    }
  }

  double get _enteredAmount {
    final parsed = double.tryParse(_amountController.text.trim());
    if (parsed == null || !parsed.isFinite) return 0;
    return parsed;
  }

  /// Outstanding BEFORE this payment is applied.
  double? get _outstandingBefore {
    final s = _summary;
    if (s == null) return null;
    return s.grandTotal - _paidExcludingThis;
  }

  /// True when the typed amount is more than what is actually owed.
  ///
  /// A warning, never a block: genuine advances happen. But a mistyped extra
  /// zero looks exactly like this and must be visible before it is saved.
  bool get _exceedsBalance {
    final outstanding = _outstandingBefore;
    if (outstanding == null) return false;
    return _enteredAmount > outstanding + kMoneyEpsilon;
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _draft.date,
      // Back-dating a receipt to a previous financial year is normal during
      // catch-up entry; forward-dating a little covers a post-dated cheque.
      firstDate: DateTime(now.year - 10),
      lastDate: DateTime(now.year + 2, 12, 31),
      helpText: 'Payment date',
    );
    if (!mounted || picked == null) return;
    setState(() => _draft.date = paymentDateOnly(picked));
  }

  Future<Iterable<QuotationSummary>> _searchQuotations(String term) async {
    final trimmed = term.trim();
    if (trimmed.length < _minPickerChars) {
      return const Iterable<QuotationSummary>.empty();
    }
    try {
      final rows = await _quotations.list(search: trimmed, limit: 20);
      return rows.take(_maxPickerOptions);
    } catch (_) {
      // A broken lookup must never block typing — same rule as the editor's
      // customer autocomplete.
      return const Iterable<QuotationSummary>.empty();
    }
  }

  void _onQuotationPicked(QuotationSummary q) {
    setState(() {
      _draft.quotationId = q.id;
      _quotationLabel = q.quoteNo;
      _customerLabel = q.customerName;
      _summary = null;
      _paidExcludingThis = 0;
    });
    _pickerController.text = q.quoteNo.isEmpty ? q.customerName : q.quoteNo;
    _loadSummary(q.id);
    // Move straight to the amount — the picker is a means to an end.
    _amountFocus.requestFocus();
  }

  Future<void> _save() async {
    if (_saving) return;

    final form = _formKey.currentState;
    if (form == null || !form.validate()) return;

    if (_draft.quotationId.isEmpty) {
      _snack('Choose the quotation this payment is against.', isError: true);
      return;
    }

    setState(() => _saving = true);

    _draft
      ..amount = _enteredAmount
      ..reference = _referenceController.text.trim()
      ..notes = _notesController.text.trim()
      ..date = paymentDateOnly(_draft.date);

    try {
      await _payments.save(_draft);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on UnknownQuotationException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      _snack(
        e.quotationId.isEmpty
            ? 'A payment must belong to a quotation. Choose one and try again.'
            : 'That quotation no longer exists, so the payment cannot be '
                'recorded against it.',
        isError: true,
      );
    } on ArgumentError catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      _snack('Amount rejected: ${e.message ?? e.toString()}', isError: true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      _snack('Could not save the payment: $e', isError: true);
    }
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
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final isEdit = widget.payment != null;

    // The keyboard inset. Without this padding the amount field sits UNDER the
    // keyboard on a short phone and the sheet looks broken.
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Form(
            key: _formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: scheme.onSurfaceVariant.withValues(alpha: 0.4),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                Row(
                  children: <Widget>[
                    Icon(
                      isEdit ? Icons.edit_note : Icons.payments_outlined,
                      color: scheme.primary,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        isEdit ? 'Edit payment' : 'Record payment',
                        style: theme.textTheme.titleLarge
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                if (_needsPicker) ...<Widget>[
                  _buildQuotationPicker(theme),
                  const SizedBox(height: 14),
                ] else
                  _buildQuotationHeader(theme),
                _buildBalanceContext(theme),
                const SizedBox(height: 14),
                _buildAmountField(theme),
                const SizedBox(height: 14),
                _buildDateField(theme),
                const SizedBox(height: 14),
                _buildMethodField(theme),
                if (_draft.method.wantsReference) ...<Widget>[
                  const SizedBox(height: 14),
                  _buildReferenceField(theme),
                ],
                const SizedBox(height: 14),
                _buildNotesField(theme),
                const SizedBox(height: 22),
                Row(
                  children: <Widget>[
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _saving
                            ? null
                            : () => Navigator.of(context).pop(false),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                        child: const Text('Cancel'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: FilledButton.icon(
                        onPressed: _saving ? null : _save,
                        style: FilledButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                        icon: _saving
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.check),
                        label: Text(_saving
                            ? 'Saving...'
                            : (isEdit ? 'Update payment' : 'Save payment')),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ).animate().fadeIn(duration: 200.ms).slideY(begin: 0.04, end: 0),
    );
  }

  Widget _buildQuotationHeader(ThemeData theme) {
    final scheme = theme.colorScheme;
    final quote = _quotationLabel.trim();
    final customer = _customerLabel.trim();
    if (quote.isEmpty && customer.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        children: <Widget>[
          Icon(Icons.description_outlined,
              size: 18, color: scheme.onSurfaceVariant),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              <String>[
                if (quote.isNotEmpty) quote,
                if (customer.isNotEmpty) customer,
              ].join('  •  '),
              style: theme.textTheme.bodyMedium
                  ?.copyWith(fontWeight: FontWeight.w600),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  /// `RawAutocomplete`, not `Autocomplete`.
  ///
  /// `Autocomplete` builds its OWN TextEditingController, which this State can
  /// neither read at save time nor dispose. `RawAutocomplete` accepts ours.
  Widget _buildQuotationPicker(ThemeData theme) {
    final scheme = theme.colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        RawAutocomplete<QuotationSummary>(
          textEditingController: _pickerController,
          focusNode: _pickerFocus,
          displayStringForOption: (q) =>
              q.quoteNo.isEmpty ? q.customerName : q.quoteNo,
          optionsBuilder: (TextEditingValue value) =>
              _searchQuotations(value.text),
          onSelected: _onQuotationPicked,
          fieldViewBuilder: (context, controller, focusNode, onSubmit) {
            return TextFormField(
              controller: controller,
              focusNode: focusNode,
              textInputAction: TextInputAction.search,
              onFieldSubmitted: (_) => onSubmit(),
              decoration: InputDecoration(
                labelText: 'Quotation *',
                hintText: 'Search quote number or customer',
                prefixIcon: const Icon(Icons.search),
                border: const OutlineInputBorder(),
                helperText: _draft.quotationId.isEmpty
                    ? 'Type at least $_minPickerChars characters'
                    : 'Selected: ${_quotationLabel.isEmpty ? _customerLabel : _quotationLabel}',
                helperStyle: TextStyle(
                  color: _draft.quotationId.isEmpty
                      ? scheme.onSurfaceVariant
                      : scheme.primary,
                ),
              ),
              validator: (_) => _draft.quotationId.isEmpty
                  ? 'Choose the quotation this payment is against'
                  : null,
            );
          },
          optionsViewBuilder: (context, onSelected, options) {
            final list = options.toList(growable: false);
            return Align(
              alignment: Alignment.topLeft,
              child: Material(
                elevation: 4,
                borderRadius: BorderRadius.circular(8),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxHeight: 260),
                  child: ListView.builder(
                    shrinkWrap: true,
                    padding: EdgeInsets.zero,
                    itemCount: list.length,
                    itemBuilder: (context, i) {
                      final q = list[i];
                      return ListTile(
                        dense: true,
                        title: Text(
                          q.quoteNo.isEmpty ? '(no number)' : q.quoteNo,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        subtitle: Text(
                          '${q.customerName}  •  ${formatQuoteDate(q.date)}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        trailing: Text(formatInr(q.grandTotal)),
                        onTap: () => onSelected(q),
                      );
                    },
                  ),
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _buildBalanceContext(ThemeData theme) {
    final scheme = theme.colorScheme;

    if (_loadingSummary) {
      return Row(
        children: <Widget>[
          const SizedBox(
            width: 14,
            height: 14,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          const SizedBox(width: 10),
          Text('Loading balance...', style: theme.textTheme.bodySmall),
        ],
      );
    }

    final summary = _summary;
    if (summary == null) return const SizedBox.shrink();

    final outstandingBefore = summary.grandTotal - _paidExcludingThis;
    final balanceAfter = outstandingBefore - _enteredAmount;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        children: <Widget>[
          _contextRow(theme, 'Quotation total', formatInr(summary.grandTotal)),
          const SizedBox(height: 6),
          _contextRow(theme, 'Already received', formatInr(_paidExcludingThis)),
          const Divider(height: 16),
          _contextRow(
            theme,
            'Balance after this payment',
            // `.abs()` only for the OVERPAID display, which is labelled as
            // "excess" in words — the raw sign is never silently clamped.
            balanceAfter < -kMoneyEpsilon
                ? '${formatInr(balanceAfter.abs())} excess'
                : formatInr(balanceAfter < kMoneyEpsilon ? 0 : balanceAfter),
            emphasise: true,
            color: balanceAfter < -kMoneyEpsilon
                ? Colors.orange.shade800
                : (balanceAfter <= kMoneyEpsilon
                    ? Colors.green.shade700
                    : scheme.onSurface),
          ),
          if (_exceedsBalance) ...<Widget>[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.amber.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.amber.shade700),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Icon(Icons.warning_amber_rounded,
                      size: 18, color: Colors.amber.shade900),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'This is more than the outstanding '
                      '${formatInr(outstandingBefore < 0 ? 0 : outstandingBefore)}. '
                      'Save it only if the customer really paid an advance — '
                      'otherwise check for an extra zero.',
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: Colors.amber.shade900),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _contextRow(
    ThemeData theme,
    String label,
    String value, {
    bool emphasise = false,
    Color? color,
  }) {
    return Row(
      children: <Widget>[
        Expanded(
          child: Text(
            label,
            style: theme.textTheme.bodySmall?.copyWith(
              fontWeight: emphasise ? FontWeight.w700 : FontWeight.w400,
            ),
          ),
        ),
        const SizedBox(width: 8),
        // Money scales rather than ellipsising — a truncated figure on a money
        // screen is worse than a small one.
        Flexible(
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerRight,
            child: Text(
              value,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: emphasise ? FontWeight.w700 : FontWeight.w600,
                color: color,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildAmountField(ThemeData theme) {
    return TextFormField(
      controller: _amountController,
      focusNode: _amountFocus,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      // ⚠️ A stray comma or minus makes `double.tryParse` return NULL, and a
      // null parsed to 0 would silently record a ZERO-rupee receipt against a
      // job the customer actually paid for. Restrict the keys at the source.
      inputFormatters: <TextInputFormatter>[
        FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
      ],
      autofocus: !_needsPicker,
      textInputAction: TextInputAction.next,
      decoration: const InputDecoration(
        labelText: 'Amount received *',
        prefixText: '\u20B9 ',
        border: OutlineInputBorder(),
      ),
      style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
      // Rebuild so the balance context and the overpayment warning track the
      // typed value. This sheet has one screenful of widgets, so a per-keystroke
      // setState here is cheap — unlike the 30-row quotation editor.
      onChanged: (_) => setState(() {}),
      validator: (raw) {
        final text = (raw ?? '').trim();
        if (text.isEmpty) return 'Enter the amount received';
        final value = double.tryParse(text);
        if (value == null || value.isNaN || value.isInfinite) {
          return 'Enter a valid number, for example 25000 or 25000.50';
        }
        if (value <= kMoneyEpsilon) {
          return 'Amount must be more than zero';
        }
        return null;
      },
    );
  }

  Widget _buildDateField(ThemeData theme) {
    return InkWell(
      onTap: _pickDate,
      borderRadius: BorderRadius.circular(4),
      child: InputDecorator(
        decoration: const InputDecoration(
          labelText: 'Payment date',
          border: OutlineInputBorder(),
          prefixIcon: Icon(Icons.event_outlined),
        ),
        child: Row(
          children: <Widget>[
            Expanded(child: Text(formatQuoteDate(_draft.date))),
            const Icon(Icons.arrow_drop_down),
          ],
        ),
      ),
    );
  }

  /// `InputDecorator` + `DropdownButton`, deliberately NOT
  /// `DropdownButtonFormField`.
  ///
  /// The form-field flavour treats its value as an INITIAL value, which makes
  /// programmatic changes unreliable — already documented as a trap in this
  /// codebase.
  Widget _buildMethodField(ThemeData theme) {
    return InputDecorator(
      decoration: const InputDecoration(
        labelText: 'Payment method',
        border: OutlineInputBorder(),
        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<PaymentMethod>(
          value: _draft.method,
          isExpanded: true,
          items: PaymentMethod.values
              .map((m) => DropdownMenuItem<PaymentMethod>(
                    value: m,
                    child: Text(m.label),
                  ))
              .toList(growable: false),
          onChanged: (m) {
            if (m == null) return;
            setState(() => _draft.method = m);
          },
        ),
      ),
    );
  }

  Widget _buildReferenceField(ThemeData theme) {
    final method = _draft.method;
    return TextFormField(
      controller: _referenceController,
      focusNode: _referenceFocus,
      textInputAction: TextInputAction.next,
      decoration: InputDecoration(
        labelText: '${method.label} reference',
        hintText: switch (method) {
          PaymentMethod.cheque => 'Cheque number',
          PaymentMethod.upi => 'UPI transaction id',
          PaymentMethod.bankTransfer => 'UTR / NEFT reference',
          PaymentMethod.card => 'Last 4 digits or approval code',
          _ => 'Reference',
        },
        border: const OutlineInputBorder(),
        // Prompted, never enforced. Blocking a save because the owner cannot
        // read the UTR off a fading slip loses the receipt entirely, which is
        // strictly worse than an unreferenced one.
        helperText: 'Recommended — this is what proves the payment later',
      ),
    );
  }

  Widget _buildNotesField(ThemeData theme) {
    return TextFormField(
      controller: _notesController,
      focusNode: _notesFocus,
      maxLines: 2,
      textInputAction: TextInputAction.done,
      decoration: const InputDecoration(
        labelText: 'Notes',
        hintText: 'Optional — e.g. advance for materials',
        border: OutlineInputBorder(),
      ),
    );
  }
}
