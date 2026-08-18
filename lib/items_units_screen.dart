// ignore_for_file: curly_braces_in_flow_control_structures, unnecessary_set_literal, use_build_context_synchronously, library_private_types_in_public_api
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import 'app_state.dart';
import 'supabase_config.dart';

double _num(Object? v) => double.tryParse('$v') ?? 0;

class _Unit {
  String id, name, code;
  bool system;
  _Unit({
    required this.id,
    required this.name,
    required this.code,
    this.system = false,
  });
  factory _Unit.from(Map<String, dynamic> j) => _Unit(
    id: '${j['id'] ?? ''}',
    name: '${j['name'] ?? ''}',
    code: '${j['code'] ?? j['symbol'] ?? ''}',
    system: j['is_system'] == true || j['isSystem'] == true,
  );
}

class _Item {
  String id, name, sku, hsn, unitId;
  double price, tax;
  _Item({
    required this.id,
    required this.name,
    this.sku = '',
    this.hsn = '',
    this.unitId = '',
    this.price = 0,
    this.tax = 0,
  });
  factory _Item.from(Map<String, dynamic> j) => _Item(
    id: '${j['id'] ?? ''}',
    name: '${j['name'] ?? ''}',
    sku: '${j['sku'] ?? j['code'] ?? ''}',
    hsn: '${j['hsn_code'] ?? j['hsnCode'] ?? ''}',
    unitId: '${j['unit_id'] ?? j['unitId'] ?? ''}',
    price: _num(j['sale_price'] ?? j['salePrice'] ?? j['price']),
    tax: _num(j['tax_rate'] ?? j['taxRate']),
  );
}

class _Api {
  static String get base =>
      Uri.base.host == 'localhost' || Uri.base.host.isEmpty
          ? ''
          : 'https://app.vitharn.com';
  static Future<dynamic> call(
    String path,
    AppState state, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) async {
    final h = {
      'Content-Type': 'application/json',
      'x-client-id': state.clientConfig.clientId,
    };
    final s = SupabaseConfig.client.auth.currentSession;
    if (s != null) h['Authorization'] = 'Bearer ${s.accessToken}';
    final u = Uri.parse('$base$path');
    final r =
        method == 'GET'
            ? await http.get(u, headers: h)
            : method == 'POST'
            ? await http.post(u, headers: h, body: jsonEncode(body))
            : method == 'PATCH'
            ? await http.patch(u, headers: h, body: jsonEncode(body))
            : await http.delete(u, headers: h);
    final d = r.body.isEmpty ? <String, dynamic>{} : jsonDecode(r.body);
    if (r.statusCode < 200 || r.statusCode >= 300)
      throw Exception(
        d is Map
            ? (d['error'] ?? d['message'] ?? 'Request failed')
            : 'Request failed (${r.statusCode})',
      );
    return d;
  }

  static List<dynamic> list(dynamic d, String key) =>
      d is List
          ? d
          : d is Map && d[key] is List
          ? d[key] as List
          : d is Map && d['data'] is List
          ? d['data'] as List
          : const [];
  static Future<List<_Item>> items(AppState s) async =>
      (list(await call('/api/console/items', s), 'items'))
          .whereType<Map>()
          .map((e) => _Item.from(Map<String, dynamic>.from(e)))
          .toList();
  static Future<List<_Unit>> units(AppState s) async =>
      (list(await call('/api/console/units', s), 'units'))
          .whereType<Map>()
          .map((e) => _Unit.from(Map<String, dynamic>.from(e)))
          .toList();
}

class ItemsUnitsScreen extends StatefulWidget {
  const ItemsUnitsScreen({super.key});
  @override
  State<ItemsUnitsScreen> createState() => _ItemsUnitsState();
}

class _ItemsUnitsState extends State<ItemsUnitsScreen>
    with SingleTickerProviderStateMixin {
  late final tabs = TabController(length: 2, vsync: this);
  List<_Item> items = [];
  List<_Unit> units = [];
  bool loading = true;
  String? error;
  String query = '';
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() => loading = true);
    try {
      final s = context.read<AppState>();
      final r = await Future.wait([_Api.items(s), _Api.units(s)]);
      if (!mounted) return;
      setState(
        () => {
          items = r[0] as List<_Item>,
          units = r[1] as List<_Unit>,
          loading = false,
          error = null,
        },
      );
    } catch (e) {
      if (mounted)
        setState(
          () => {
            loading = false,
            error = e.toString().replaceFirst('Exception: ', ''),
          },
        );
    }
  }

  @override
  Widget build(BuildContext c) {
    final t = Theme.of(c);
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Items & Units',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        actions: [IconButton(onPressed: load, icon: const Icon(Icons.refresh))],
        bottom: TabBar(
          controller: tabs,
          tabs: [
            Tab(
              text: 'Items (${items.length})',
              icon: const Icon(Icons.inventory_2_outlined),
            ),
            Tab(
              text: 'Units (${units.length})',
              icon: const Icon(Icons.straighten_outlined),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => tabs.index == 0 ? editItem() : editUnit(),
        icon: const Icon(Icons.add),
        label: Text(tabs.index == 0 ? 'Add item' : 'Add unit'),
      ),
      body:
          loading
              ? const Center(child: CircularProgressIndicator())
              : error != null
              ? ErrorState(error!, load)
              : TabBarView(
                controller: tabs,
                children: [itemsView(t), unitsView(t)],
              ),
    );
  }

  Widget search(String hint, IconData icon) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
    child: TextField(
      onChanged: (v) => setState(() => query = v.toLowerCase()),
      decoration: InputDecoration(
        prefixIcon: Icon(icon),
        hintText: hint,
        suffixIcon:
            query.isEmpty
                ? null
                : IconButton(
                  onPressed: () => setState(() => query = ''),
                  icon: const Icon(Icons.clear),
                ),
      ),
    ),
  );
  Widget itemsView(ThemeData t) {
    final a =
        items
            .where(
              (x) =>
                  '${x.name} ${x.sku} ${x.hsn}'.toLowerCase().contains(query),
            )
            .toList();
    return Column(
      children: [
        search('Search items by name or SKU', Icons.search),
        Expanded(
          child:
              a.isEmpty
                  ? EmptyState(
                    items.isEmpty ? 'No items yet' : 'No matching items',
                    'Add item',
                    editItem,
                  )
                  : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                    itemCount: a.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (_, i) => itemCard(a[i], t),
                  ),
        ),
      ],
    );
  }

  Widget unitsView(ThemeData t) {
    final a =
        units
            .where((x) => '${x.name} ${x.code}'.toLowerCase().contains(query))
            .toList();
    return Column(
      children: [
        search('Search units', Icons.search),
        Expanded(
          child:
              a.isEmpty
                  ? EmptyState(
                    units.isEmpty ? 'No units yet' : 'No matching units',
                    'Add unit',
                    editUnit,
                  )
                  : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                    itemCount: a.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (_, i) => unitCard(a[i], t),
                  ),
        ),
      ],
    );
  }

  Widget itemCard(_Item x, ThemeData t) {
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
        leading: CircleAvatar(
          backgroundColor: t.colorScheme.primary.withValues(alpha: .12),
          child: Icon(Icons.inventory_2_outlined, color: t.colorScheme.primary),
        ),
        title: Text(
          x.name,
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        subtitle: Text(
          [
            if (x.sku.isNotEmpty) 'SKU ${x.sku}',
            if (x.hsn.isNotEmpty) 'HSN ${x.hsn}',
            if (x.price > 0) 'Price ${x.price.toStringAsFixed(2)}',
          ].join('  |  '),
        ),
        trailing: PopupMenuButton<String>(
          onSelected:
              (v) =>
                  v == 'edit'
                      ? editItem(x)
                      : delete('/api/console/items/${x.id}', x.name),
          itemBuilder:
              (_) => const [
                PopupMenuItem(value: 'edit', child: Text('Edit')),
                PopupMenuItem(value: 'delete', child: Text('Delete')),
              ],
        ),
      ),
    );
  }

  Widget unitCard(_Unit x, ThemeData t) {
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
        leading: CircleAvatar(
          backgroundColor: Colors.orange.withValues(alpha: .14),
          child: const Icon(Icons.straighten_outlined, color: Colors.orange),
        ),
        title: Text(
          x.name,
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        subtitle: Text(x.code.isEmpty ? 'Unit of measure' : x.code),
        trailing:
            x.system
                ? const Chip(label: Text('System'))
                : PopupMenuButton<String>(
                  onSelected:
                      (v) =>
                          v == 'edit'
                              ? editUnit(x)
                              : delete('/api/console/units/${x.id}', x.name),
                  itemBuilder:
                      (_) => const [
                        PopupMenuItem(value: 'edit', child: Text('Edit')),
                        PopupMenuItem(value: 'delete', child: Text('Delete')),
                      ],
                ),
      ),
    );
  }

  Future<void> editItem([_Item? x]) async {
    final r = await showDialog<_Item>(
      context: context,
      builder: (_) => ItemDialog(existing: x, units: units),
    );
    if (r == null) return;
    try {
      final s = context.read<AppState>();
      final b = {
        'name': r.name,
        'sku': r.sku,
        'hsn_code': r.hsn,
        'unit_id': r.unitId.isEmpty ? null : r.unitId,
        'sale_price': r.price,
        'tax_rate': r.tax,
      };
      await _Api.call(
        r.id.isEmpty ? '/api/console/items' : '/api/console/items/${r.id}',
        s,
        method: r.id.isEmpty ? 'POST' : 'PATCH',
        body: b,
      );
      await load();
    } catch (e) {
      snack(e);
    }
  }

  Future<void> editUnit([_Unit? x]) async {
    final r = await showDialog<_Unit>(
      context: context,
      builder: (_) => UnitDialog(existing: x),
    );
    if (r == null) return;
    try {
      final s = context.read<AppState>();
      await _Api.call(
        r.id.isEmpty ? '/api/console/units' : '/api/console/units/${r.id}',
        s,
        method: r.id.isEmpty ? 'POST' : 'PATCH',
        body: {'name': r.name, 'code': r.code},
      );
      await load();
    } catch (e) {
      snack(e);
    }
  }

  Future<void> delete(String path, String label) async {
    final ok = await showDialog<bool>(
      context: context,
      builder:
          (_) => AlertDialog(
            title: const Text('Delete record?'),
            content: Text('Remove "$label" from your catalogue?'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Delete'),
              ),
            ],
          ),
    );
    if (ok != true) return;
    try {
      await _Api.call(path, context.read<AppState>(), method: 'DELETE');
      await load();
    } catch (e) {
      snack(e);
    }
  }

  void snack(Object e) => ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(e.toString().replaceFirst('Exception: ', '')),
      backgroundColor: Colors.redAccent,
    ),
  );
}

class ItemDialog extends StatefulWidget {
  final _Item? existing;
  final List<_Unit> units;
  const ItemDialog({super.key, this.existing, required this.units});
  @override
  State<ItemDialog> createState() => _ItemDialogState();
}

class _ItemDialogState extends State<ItemDialog> {
  late final name = TextEditingController(text: widget.existing?.name),
      sku = TextEditingController(text: widget.existing?.sku),
      hsn = TextEditingController(text: widget.existing?.hsn),
      price = TextEditingController(
        text:
            widget.existing?.price == 0
                ? ''
                : widget.existing!.price.toString(),
      ),
      tax = TextEditingController(
        text: widget.existing?.tax == 0 ? '' : widget.existing!.tax.toString(),
      );
  String unit = '';
  @override
  void initState() {
    super.initState();
    unit = widget.existing?.unitId ?? '';
  }

  @override
  Widget build(BuildContext c) => AlertDialog(
    title: Text(widget.existing == null ? 'Add item' : 'Edit item'),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          f(name, 'Item name *'),
          f(sku, 'SKU / code'),
          f(hsn, 'HSN / SAC code'),
          f(price, 'Sale price', numeric: true),
          f(tax, 'GST rate %', numeric: true),
          DropdownButtonFormField<String>(
            initialValue: unit.isEmpty ? null : unit,
            decoration: const InputDecoration(labelText: 'Unit'),
            items:
                widget.units
                    .map(
                      (u) => DropdownMenuItem(
                        value: u.id,
                        child: Text('${u.name} (${u.code})'),
                      ),
                    )
                    .toList(),
            onChanged: (v) => setState(() => unit = v ?? ''),
          ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(c),
        child: const Text('Cancel'),
      ),
      FilledButton(onPressed: () => save(c), child: const Text('Save')),
    ],
  );
  Widget f(TextEditingController x, String label, {bool numeric = false}) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextField(
          controller: x,
          keyboardType:
              numeric
                  ? const TextInputType.numberWithOptions(decimal: true)
                  : null,
          decoration: InputDecoration(labelText: label),
        ),
      );
  void save(BuildContext c) {
    if (name.text.trim().isEmpty) {
      return;
    }
    Navigator.pop(
      c,
      _Item(
        id: widget.existing?.id ?? '',
        name: name.text.trim(),
        sku: sku.text.trim(),
        hsn: hsn.text.trim(),
        unitId: unit,
        price: _num(price.text),
        tax: _num(tax.text),
      ),
    );
  }
}

class UnitDialog extends StatefulWidget {
  final _Unit? existing;
  const UnitDialog({super.key, this.existing});
  @override
  State<UnitDialog> createState() => _UnitDialogState();
}

class _UnitDialogState extends State<UnitDialog> {
  late final name = TextEditingController(text: widget.existing?.name),
      code = TextEditingController(text: widget.existing?.code);
  @override
  Widget build(BuildContext c) => AlertDialog(
    title: Text(widget.existing == null ? 'Add unit' : 'Edit unit'),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      children: [f(name, 'Unit name *'), f(code, 'Code / symbol *')],
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(c),
        child: const Text('Cancel'),
      ),
      FilledButton(onPressed: () => save(c), child: const Text('Save')),
    ],
  );
  Widget f(TextEditingController x, String label) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: TextField(
      controller: x,
      decoration: InputDecoration(labelText: label),
    ),
  );
  void save(BuildContext c) {
    if (name.text.trim().isEmpty || code.text.trim().isEmpty) return;
    Navigator.pop(
      c,
      _Unit(
        id: widget.existing?.id ?? '',
        name: name.text.trim(),
        code: code.text.trim(),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  final String label, action;
  final VoidCallback onPressed;
  const EmptyState(this.label, this.action, this.onPressed, {super.key});
  @override
  Widget build(BuildContext c) => Center(
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(
          Icons.inventory_2_outlined,
          size: 52,
          color: Theme.of(c).colorScheme.primary.withValues(alpha: .45),
        ),
        const SizedBox(height: 12),
        Text(label),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: onPressed,
          icon: const Icon(Icons.add),
          label: Text(action),
        ),
      ],
    ),
  );
}

class ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback retry;
  const ErrorState(this.message, this.retry, {super.key});
  @override
  Widget build(BuildContext c) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.cloud_off, size: 48),
          const SizedBox(height: 12),
          Text(
            'Could not load catalogue',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: retry,
            icon: const Icon(Icons.refresh),
            label: const Text('Try again'),
          ),
        ],
      ),
    ),
  );
}
