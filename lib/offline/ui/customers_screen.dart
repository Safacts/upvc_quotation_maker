/// OFFLINE TIER — CUSTOMER ADDRESS BOOK.
///
/// ZERO-SERVER CONTRACT: no `supabase_flutter`, no `http`, no `connectivity_plus`,
/// no `lib/services/**`. See `lib/offline/core/models.dart` for the full rule.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../core/models.dart';
import '../data/customer_repository.dart';

/// See `quotation_list_screen.dart` for why searching is debounced rather than
/// run on every keystroke.
const Duration _debounce = Duration(milliseconds: 300);

class CustomersScreen extends StatefulWidget {
  const CustomersScreen({super.key});

  @override
  State<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends State<CustomersScreen> {
  final CustomerRepository _repo = CustomerRepository();
  final TextEditingController _searchController = TextEditingController();

  Timer? _debounceTimer;

  List<OfflineCustomer> _items = const <OfflineCustomer>[];
  String _search = '';
  bool _loading = true;
  String? _error;

  /// Guards against an older query landing after a newer one. See the same
  /// pattern (and the same reason) in the quotation list.
  int _queryEpoch = 0;

  /// True once anything was saved or deleted, so the caller can refresh its
  /// KPI tiles. Returned as the route result.
  bool _changed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
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
      final rows = await _repo.list(search: _search.isEmpty ? null : _search);
      if (!mounted || epoch != _queryEpoch) return;
      setState(() {
        _items = rows;
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

  Future<void> _openEditor({OfflineCustomer? existing}) async {
    final saved = await showModalBottomSheet<OfflineCustomer>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (ctx) => _CustomerFormSheet(initial: existing),
    );
    if (!mounted || saved == null) return;

    try {
      await _repo.save(saved);
      if (!mounted) return;
      _changed = true;
      _snack(existing == null ? 'Customer added' : 'Customer updated');
      await _load();
    } catch (e) {
      if (!mounted) return;
      _snack('Could not save customer: $e');
    }
  }

  Future<void> _confirmDelete(OfflineCustomer c) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(18)),
        ),
        title: const Text('Remove this customer?'),
        content: Text(
          '${c.name} will be removed from your address book.\n\n'
          // The repository deliberately does not cascade (each quotation keeps
          // its own copy of the customer text). Say so plainly, or the owner
          // will avoid tidying the list for fear of losing past documents.
          'Existing quotations are NOT affected — they keep their own copy of '
          'the name, address and phone number, and their PDFs stay exactly the '
          'same.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    final id = c.id;
    if (id == null || id.isEmpty) {
      _snack('This customer has no id and cannot be removed.');
      return;
    }

    try {
      await _repo.delete(id);
      if (!mounted) return;
      _changed = true;
      setState(() =>
          _items = _items.where((e) => e.id != id).toList(growable: false));
      _snack('Customer removed');
    } catch (e) {
      if (!mounted) return;
      _snack('Could not remove customer: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    // PopScope reports whether anything changed so the dashboard can refresh
    // its "customers" tile without re-querying on every plain back press.
    return PopScope<bool>(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        Navigator.of(context).pop(_changed);
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text(
            'Customers',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: () => _openEditor(),
          icon: const Icon(Icons.person_add_alt),
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
                    hintText: 'Search name, phone or email',
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

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());

    if (_error != null) {
      return _ErrorView(message: _error!, onRetry: _load);
    }

    if (_items.isEmpty) {
      return _EmptyView(
        filtered: _search.isNotEmpty,
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
        itemCount: _items.length,
        itemBuilder: (context, index) {
          final c = _items[index];
          final subtitle = <String>[
            if (c.phone.trim().isNotEmpty) c.phone.trim(),
            if (c.email.trim().isNotEmpty) c.email.trim(),
            if (c.address.trim().isNotEmpty) c.address.trim(),
          ].join('  •  ');

          return Card(
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
                backgroundColor: Colors.purple.withValues(alpha: 0.12),
                child: Text(
                  _initial(c.name),
                  style: const TextStyle(
                    color: Colors.purple,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              title: Text(
                c.name.trim().isEmpty ? '(No name)' : c.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              subtitle: subtitle.isEmpty
                  ? null
                  : Text(
                      subtitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12),
                    ),
              trailing: IconButton(
                icon: const Icon(Icons.delete_outline, color: Colors.red),
                tooltip: 'Remove',
                onPressed: () => _confirmDelete(c),
              ),
              onTap: () => _openEditor(existing: c),
            ),
          ).animate().fadeIn(
                duration: 200.ms,
                delay: Duration(milliseconds: index < 8 ? index * 25 : 0),
              );
        },
      ),
    );
  }

  static String _initial(String name) {
    final t = name.trim();
    return t.isEmpty ? '?' : t.characters.first.toUpperCase();
  }
}

// ---------------------------------------------------------------------------
// Add / edit sheet
// ---------------------------------------------------------------------------

class _CustomerFormSheet extends StatefulWidget {
  const _CustomerFormSheet({this.initial});

  final OfflineCustomer? initial;

  @override
  State<_CustomerFormSheet> createState() => _CustomerFormSheetState();
}

class _CustomerFormSheetState extends State<_CustomerFormSheet> {
  final _formKey = GlobalKey<FormState>();

  late final TextEditingController _name;
  late final TextEditingController _phone;
  late final TextEditingController _email;
  late final TextEditingController _address;
  late final TextEditingController _gstin;
  late final TextEditingController _notes;

  @override
  void initState() {
    super.initState();
    final c = widget.initial;
    _name = TextEditingController(text: c?.name ?? '');
    _phone = TextEditingController(text: c?.phone ?? '');
    _email = TextEditingController(text: c?.email ?? '');
    _address = TextEditingController(text: c?.address ?? '');
    _gstin = TextEditingController(text: c?.gstin ?? '');
    _notes = TextEditingController(text: c?.notes ?? '');
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _email.dispose();
    _address.dispose();
    _gstin.dispose();
    _notes.dispose();
    super.dispose();
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final existing = widget.initial;

    Navigator.pop(
      context,
      OfflineCustomer(
        id: existing?.id,
        name: _name.text.trim(),
        phone: _phone.text.trim(),
        email: _email.text.trim(),
        address: _address.text.trim(),
        gstin: _gstin.text.trim(),
        notes: _notes.text.trim(),
        createdAt: existing?.createdAt,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isEdit = widget.initial != null;
    return Padding(
      // viewInsets keeps the Save button above the keyboard on a small phone.
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
                isEdit ? 'Edit customer' : 'New customer',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 16),
              _field(
                controller: _name,
                label: 'Name',
                icon: Icons.person_outline,
                textCapitalization: TextCapitalization.words,
                autofocus: !isEdit,
                validator: (v) => (v == null || v.trim().isEmpty)
                    ? 'Name is required'
                    : null,
              ),
              const SizedBox(height: 12),
              _field(
                controller: _phone,
                label: 'Phone',
                icon: Icons.phone_outlined,
                keyboardType: TextInputType.phone,
              ),
              const SizedBox(height: 12),
              _field(
                controller: _email,
                label: 'Email',
                icon: Icons.email_outlined,
                keyboardType: TextInputType.emailAddress,
                // Warn-free by design: an owner who only has a partial email
                // must still be able to save the rest of the record.
              ),
              const SizedBox(height: 12),
              _field(
                controller: _address,
                label: 'Address',
                icon: Icons.location_on_outlined,
                textCapitalization: TextCapitalization.sentences,
                maxLines: 3,
              ),
              const SizedBox(height: 12),
              _field(
                controller: _gstin,
                label: 'GSTIN',
                icon: Icons.receipt_long_outlined,
                textCapitalization: TextCapitalization.characters,
                helper: 'Optional. Printed on the quotation when present.',
              ),
              const SizedBox(height: 12),
              _field(
                controller: _notes,
                label: 'Notes',
                icon: Icons.sticky_note_2_outlined,
                textCapitalization: TextCapitalization.sentences,
                maxLines: 3,
                helper: 'Private — never printed on the customer PDF.',
              ),
              const SizedBox(height: 20),
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
    TextCapitalization textCapitalization = TextCapitalization.none,
    String? Function(String?)? validator,
  }) {
    return TextFormField(
      controller: controller,
      maxLines: maxLines,
      autofocus: autofocus,
      keyboardType: keyboardType,
      textCapitalization: textCapitalization,
      validator: validator,
      decoration: InputDecoration(
        labelText: label,
        helperText: helper,
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
    required this.onAdd,
    required this.onClear,
  });

  final bool filtered;
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
                    filtered ? Icons.search_off : Icons.people_outline,
                    size: 64,
                    color: Colors.grey.shade400,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    filtered ? 'No matching customers' : 'No customers yet',
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    filtered
                        ? 'Try a different name, phone number or email.'
                        : 'Save your regular customers once and stop '
                            're-typing their details on every quotation.',
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
                      icon: const Icon(Icons.person_add_alt),
                      label: const Text('Add your first customer'),
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
              'Could not load customers',
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
