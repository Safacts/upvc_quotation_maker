/// OFFLINE TIER — PRODUCT RATE CARD.
///
/// ZERO-SERVER CONTRACT: no `supabase_flutter`, no `http`, no `connectivity_plus`,
/// no `lib/services/**`. See `lib/offline/core/models.dart` for the full rule.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../core/models.dart';
import '../data/product_repository.dart';

/// See `quotation_list_screen.dart` for why searching is debounced.
const Duration _debounce = Duration(milliseconds: 300);

/// The only units the app understands. `sft` is special — it is the ONLY value
/// that routes a product into the measured (per-area) table, both here and in
/// `OfflineProduct.isMeasured` / `ProductRepository.unmeasured()`. A free-text
/// unit would let a window land in the per-piece table carrying a per-sqft
/// rate: a large, silent mispricing rather than a visible error.
const List<String> _units = <String>['sft', 'nos', 'set', 'rft'];

const String _unitRuleHelp =
    'Products measured in sft are priced by area (width x height x rate) and '
    'appear in the Measured section of a quotation. Every other unit is priced '
    'per piece (quantity x rate) and appears in the Unmeasured section.';

class ProductsScreen extends StatefulWidget {
  const ProductsScreen({super.key});

  @override
  State<ProductsScreen> createState() => _ProductsScreenState();
}

class _ProductsScreenState extends State<ProductsScreen>
    with SingleTickerProviderStateMixin {
  final ProductRepository _repo = ProductRepository();
  final TextEditingController _searchController = TextEditingController();

  late final TabController _tabController;
  Timer? _debounceTimer;

  List<OfflineProduct> _measured = const <OfflineProduct>[];
  List<OfflineProduct> _unmeasured = const <OfflineProduct>[];

  String _search = '';
  bool _loading = true;
  String? _error;

  /// Guards against a stale query landing after a newer one.
  int _queryEpoch = 0;

  /// Reported to the caller so the dashboard's product tile stays accurate.
  bool _changed = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final epoch = ++_queryEpoch;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final term = _search.isEmpty ? null : _search;
      // activeOnly: false — this IS the screen where a discontinued product
      // must be visible so the owner can bring it back.
      final measured = await _repo.measured(activeOnly: false, search: term);
      final unmeasured =
          await _repo.unmeasured(activeOnly: false, search: term);
      if (!mounted || epoch != _queryEpoch) return;
      setState(() {
        _measured = measured;
        _unmeasured = unmeasured;
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

  void _onSearchChanged(String value) {
    _debounceTimer?.cancel();
    _debounceTimer = Timer(_debounce, () {
      if (!mounted) return;
      final trimmed = value.trim();
      if (trimmed == _search) return;
      _search = trimmed;
      _load();
    });
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(behavior: SnackBarBehavior.floating, content: Text(message)),
    );
  }

  Future<void> _openEditor({OfflineProduct? existing}) async {
    // Default a brand-new product to the unit of the tab the owner is looking
    // at — adding a handle while on the "Unmeasured" tab should not silently
    // default to sft.
    final defaultUnit = _tabController.index == 0 ? 'sft' : 'nos';

    final saved = await showModalBottomSheet<OfflineProduct>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (ctx) =>
          _ProductFormSheet(initial: existing, defaultUnit: defaultUnit),
    );
    if (!mounted || saved == null) return;

    try {
      await _repo.save(saved);
      if (!mounted) return;
      _changed = true;
      _snack(existing == null ? 'Product added' : 'Product updated');
      await _load();
    } catch (e) {
      if (!mounted) return;
      _snack('Could not save product: $e');
    }
  }

  Future<void> _confirmDelete(OfflineProduct p) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(18)),
        ),
        title: const Text('Delete this product?'),
        content: Text(
          '${p.name.isEmpty ? "This product" : p.name} will be removed from '
          'your rate card.\n\n'
          // Quotations copy the description and rate at the time of writing, so
          // a delete cannot corrupt them — but it does destroy the owner's
          // ability to explain where an old line item's price came from.
          'Quotations already created keep their own copy of the description '
          'and rate, so nothing already sent will change. If you may need this '
          'item again, switch it off instead of deleting it.',
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
    if (ok != true || !mounted) return;

    final id = p.id;
    if (id == null || id.isEmpty) {
      _snack('This product has no id and cannot be deleted.');
      return;
    }

    try {
      await _repo.delete(id);
      if (!mounted) return;
      _changed = true;
      _snack('Product deleted');
      await _load();
    } catch (e) {
      if (!mounted) return;
      _snack('Could not delete product: $e');
    }
  }

  /// Flip the active flag straight from the list — the common maintenance
  /// action, and the safe alternative to deleting.
  Future<void> _toggleActive(OfflineProduct p, bool active) async {
    p.isActive = active;
    try {
      await _repo.save(p);
      if (!mounted) return;
      _changed = true;
      await _load();
    } catch (e) {
      if (!mounted) return;
      // Put the model back so the switch does not lie about what was stored.
      p.isActive = !active;
      setState(() {});
      _snack('Could not update product: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope<bool>(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        Navigator.of(context).pop(_changed);
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text(
            'Products',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.help_outline),
              tooltip: 'How units work',
              onPressed: _showUnitHelp,
            ),
          ],
          bottom: TabBar(
            controller: _tabController,
            tabs: const [
              Tab(text: 'Measured (per sq.ft)'),
              Tab(text: 'Unmeasured (per piece)'),
            ],
          ),
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: () => _openEditor(),
          icon: const Icon(Icons.add),
          label: const Text('Add'),
        ),
        body: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: TextField(
                  controller: _searchController,
                  textInputAction: TextInputAction.search,
                  onChanged: _onSearchChanged,
                  onSubmitted: (v) {
                    _debounceTimer?.cancel();
                    _search = v.trim();
                    _load();
                  },
                  decoration: InputDecoration(
                    hintText: 'Search name, code or category',
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
                              _load();
                            },
                          ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
              ),
              const Divider(height: 1),
              Expanded(child: _buildBody()),
            ],
          ),
        ),
      ),
    );
  }

  void _showUnitHelp() {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(18)),
        ),
        title: const Text('How units work'),
        content: const Text(_unitRuleHelp),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Got it'),
          ),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());

    if (_error != null) {
      return _ErrorView(message: _error!, onRetry: _load);
    }

    return TabBarView(
      controller: _tabController,
      children: [
        _buildTab(
          items: _measured,
          measuredTab: true,
        ),
        _buildTab(
          items: _unmeasured,
          measuredTab: false,
        ),
      ],
    );
  }

  Widget _buildTab({
    required List<OfflineProduct> items,
    required bool measuredTab,
  }) {
    if (items.isEmpty) {
      return _EmptyView(
        filtered: _search.isNotEmpty,
        measuredTab: measuredTab,
        onAdd: () => _openEditor(),
        onClear: () {
          _debounceTimer?.cancel();
          _searchController.clear();
          _search = '';
          _load();
        },
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
        // +1 for the unit-rule footer, which explains why an item is in this
        // tab rather than the other one.
        itemCount: items.length + 1,
        itemBuilder: (context, index) {
          if (index == items.length) {
            return Padding(
              padding: const EdgeInsets.fromLTRB(6, 12, 6, 4),
              child: Text(
                measuredTab
                    ? 'These are priced by area: width x height x rate.'
                    : 'These are priced per piece: quantity x rate.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
              ),
            );
          }
          return _buildRow(items[index], index, measuredTab);
        },
      ),
    );
  }

  Widget _buildRow(OfflineProduct p, int index, bool measuredTab) {
    final color = measuredTab ? Colors.indigo : Colors.brown;
    final meta = <String>[
      if (p.code.trim().isNotEmpty) p.code.trim(),
      if (p.category.trim().isNotEmpty) p.category.trim(),
      if (p.glass.trim().isNotEmpty) p.glass.trim(),
    ].join('  •  ');

    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: Colors.grey.withValues(alpha: 0.25)),
      ),
      child: Opacity(
        // Inactive rows stay readable but visibly demoted.
        opacity: p.isActive ? 1 : 0.55,
        child: ListTile(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          leading: CircleAvatar(
            backgroundColor: color.withValues(alpha: 0.12),
            child: Icon(
              measuredTab ? Icons.window_outlined : Icons.handyman_outlined,
              color: color,
              size: 20,
            ),
          ),
          title: Text(
            p.name.trim().isEmpty ? '(No name)' : p.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          subtitle: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (meta.isNotEmpty)
                Text(
                  meta,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12),
                ),
              Text(
                '${formatInr(p.rate)} per ${p.unit}'
                '${p.isActive ? "" : "  •  inactive"}',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
              ),
            ],
          ),
          isThreeLine: meta.isNotEmpty,
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Switch(
                value: p.isActive,
                onChanged: (v) => _toggleActive(p, v),
              ),
              IconButton(
                icon: const Icon(Icons.delete_outline, color: Colors.red),
                tooltip: 'Delete',
                onPressed: () => _confirmDelete(p),
              ),
            ],
          ),
          onTap: () => _openEditor(existing: p),
        ),
      ),
    ).animate().fadeIn(
          duration: 200.ms,
          delay: Duration(milliseconds: index < 8 ? index * 25 : 0),
        );
  }
}

// ---------------------------------------------------------------------------
// Add / edit sheet
// ---------------------------------------------------------------------------

class _ProductFormSheet extends StatefulWidget {
  const _ProductFormSheet({this.initial, required this.defaultUnit});

  final OfflineProduct? initial;
  final String defaultUnit;

  @override
  State<_ProductFormSheet> createState() => _ProductFormSheetState();
}

class _ProductFormSheetState extends State<_ProductFormSheet> {
  final _formKey = GlobalKey<FormState>();

  late final TextEditingController _code;
  late final TextEditingController _name;
  late final TextEditingController _description;
  late final TextEditingController _rate;
  late final TextEditingController _glass;
  late final TextEditingController _category;

  late String _unit;
  late bool _isActive;

  @override
  void initState() {
    super.initState();
    final p = widget.initial;
    _code = TextEditingController(text: p?.code ?? '');
    _name = TextEditingController(text: p?.name ?? '');
    _description = TextEditingController(text: p?.description ?? '');
    // 0 renders as "0" rather than an empty box on a new product; showing a
    // blank rate invites saving a zero-priced item by accident.
    _rate = TextEditingController(
      text: p == null ? '' : _trimZeros(p.rate),
    );
    _glass = TextEditingController(text: p?.glass ?? '');
    _category = TextEditingController(text: p?.category ?? '');

    final storedUnit = (p?.unit ?? widget.defaultUnit).trim().toLowerCase();
    // An unrecognised legacy unit must not blow up the dropdown's assertion.
    _unit = _units.contains(storedUnit) ? storedUnit : _units.first;
    _isActive = p?.isActive ?? true;
  }

  @override
  void dispose() {
    _code.dispose();
    _name.dispose();
    _description.dispose();
    _rate.dispose();
    _glass.dispose();
    _category.dispose();
    super.dispose();
  }

  static String _trimZeros(double v) =>
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final existing = widget.initial;

    Navigator.pop(
      context,
      OfflineProduct(
        id: existing?.id,
        code: _code.text.trim(),
        name: _name.text.trim(),
        description: _description.text.trim(),
        unit: _unit,
        rate: double.tryParse(_rate.text.trim()) ?? 0,
        glass: _glass.text.trim(),
        category: _category.text.trim(),
        isActive: _isActive,
        createdAt: existing?.createdAt,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isEdit = widget.initial != null;
    final measured = _unit == 'sft';

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey.withValues(alpha: 0.4),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                isEdit ? 'Edit product' : 'New product',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 16),
              _field(
                controller: _name,
                label: 'Name',
                icon: Icons.label_outline,
                textCapitalization: TextCapitalization.words,
                autofocus: !isEdit,
                validator: (v) => (v == null || v.trim().isEmpty)
                    ? 'Name is required'
                    : null,
              ),
              const SizedBox(height: 12),
              _field(
                controller: _code,
                label: 'Code',
                icon: Icons.qr_code_2,
                textCapitalization: TextCapitalization.characters,
                helper: 'Short reference printed on the quotation, e.g. SW2T.',
              ),
              const SizedBox(height: 12),
              _field(
                controller: _description,
                label: 'Description',
                icon: Icons.notes_outlined,
                textCapitalization: TextCapitalization.sentences,
                maxLines: 3,
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _unit,
                decoration: InputDecoration(
                  labelText: 'Unit',
                  helperText: _unitRuleHelp,
                  helperMaxLines: 4,
                  prefixIcon: const Icon(Icons.straighten),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                items: _units
                    .map(
                      (u) => DropdownMenuItem<String>(
                        value: u,
                        child: Text(
                          u == 'sft' ? 'sft — per square foot' : u,
                        ),
                      ),
                    )
                    .toList(),
                onChanged: (v) {
                  if (v == null) return;
                  setState(() => _unit = v);
                },
              ),
              const SizedBox(height: 12),
              _field(
                controller: _rate,
                label: measured ? 'Rate per sq.ft' : 'Rate per piece',
                icon: Icons.currency_rupee,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [
                  // Only digits and a single dot — a stray comma or minus makes
                  // `double.tryParse` return null and silently price the item
                  // at zero.
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                ],
                validator: (v) {
                  final text = (v ?? '').trim();
                  if (text.isEmpty) return 'Rate is required';
                  final parsed = double.tryParse(text);
                  if (parsed == null) return 'Enter a number';
                  if (parsed < 0) return 'Rate cannot be negative';
                  return null;
                },
              ),
              const SizedBox(height: 12),
              _field(
                controller: _glass,
                label: 'Glass',
                icon: Icons.grid_view_outlined,
                helper: 'Optional, e.g. 5mm Clear. Printed on measured lines.',
              ),
              const SizedBox(height: 12),
              _field(
                controller: _category,
                label: 'Category',
                icon: Icons.category_outlined,
                textCapitalization: TextCapitalization.words,
                helper: 'Used to group the rate card, e.g. Windows, Hardware.',
              ),
              const SizedBox(height: 8),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _isActive,
                title: const Text('Active'),
                subtitle: const Text(
                  'Inactive products stay in your history but are not offered '
                  'when building a new quotation.',
                  style: TextStyle(fontSize: 12),
                ),
                onChanged: (v) => setState(() => _isActive = v),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton.icon(
                      icon: const Icon(Icons.check),
                      label: Text(isEdit ? 'Save' : 'Add'),
                      onPressed: _submit,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _field({
    required TextEditingController controller,
    required String label,
    required IconData icon,
    String? helper,
    int maxLines = 1,
    bool autofocus = false,
    TextInputType? keyboardType,
    List<TextInputFormatter>? inputFormatters,
    TextCapitalization textCapitalization = TextCapitalization.none,
    String? Function(String?)? validator,
  }) {
    return TextFormField(
      controller: controller,
      maxLines: maxLines,
      autofocus: autofocus,
      keyboardType: keyboardType,
      inputFormatters: inputFormatters,
      textCapitalization: textCapitalization,
      validator: validator,
      decoration: InputDecoration(
        labelText: label,
        helperText: helper,
        helperMaxLines: 2,
        prefixIcon: Icon(icon),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Presentational pieces
// ---------------------------------------------------------------------------

class _EmptyView extends StatelessWidget {
  const _EmptyView({
    required this.filtered,
    required this.measuredTab,
    required this.onAdd,
    required this.onClear,
  });

  final bool filtered;
  final bool measuredTab;
  final VoidCallback onAdd;
  final VoidCallback onClear;

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
                    filtered
                        ? Icons.search_off
                        : (measuredTab
                            ? Icons.window_outlined
                            : Icons.handyman_outlined),
                    size: 64,
                    color: Colors.grey.shade400,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    filtered
                        ? 'No matching products'
                        : (measuredTab
                            ? 'No per-sq.ft products yet'
                            : 'No per-piece products yet'),
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    filtered
                        ? 'Try a different name, code or category.'
                        : (measuredTab
                            ? 'Add windows and doors here — they are priced '
                                'by area (width x height x rate).'
                            : 'Add handles, locks and accessories here — they '
                                'are priced per piece (quantity x rate).'),
                    textAlign: TextAlign.center,
                    style:
                        TextStyle(fontSize: 13, color: Colors.grey.shade600),
                  ),
                  const SizedBox(height: 20),
                  if (filtered)
                    OutlinedButton.icon(
                      icon: const Icon(Icons.clear),
                      label: const Text('Clear search'),
                      onPressed: onClear,
                    )
                  else
                    ElevatedButton.icon(
                      icon: const Icon(Icons.add),
                      label: const Text('Add a product'),
                      onPressed: onAdd,
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
              'Could not load products',
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
