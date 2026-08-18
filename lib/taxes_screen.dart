import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_state.dart';

/// Tenant tax-rate workspace backed by the console taxes API.
class TaxData {
  final String? id;
  final String name;
  final String code;
  final String type;
  final double rate;
  final String description;
  final bool isActive;
  final bool isSystem;

  const TaxData({
    this.id,
    required this.name,
    required this.code,
    required this.type,
    required this.rate,
    required this.description,
    required this.isActive,
    required this.isSystem,
  });

  factory TaxData.fromMap(Map<String, dynamic> json) {
    final rawRate = json['rate'] ?? json['tax_rate'];
    final parsedRate =
        rawRate is num
            ? rawRate.toDouble()
            : double.tryParse(rawRate?.toString() ?? '') ?? 0;
    return TaxData(
      id: json['id']?.toString(),
      name: (json['name'] ?? json['tax_name'] ?? '').toString(),
      code: (json['code'] ?? json['tax_code'] ?? '').toString(),
      type:
          (json['type'] ?? json['tax_type'] ?? 'gst').toString().toLowerCase(),
      rate: parsedRate,
      description: (json['description'] ?? '').toString(),
      isActive: json['is_active'] != false,
      isSystem: json['is_system'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
    'name': name,
    'code': code,
    'type': type,
    'rate': rate,
    'description': description,
    'is_active': isActive,
  };
}

class TaxesScreen extends StatefulWidget {
  const TaxesScreen({super.key});

  @override
  State<TaxesScreen> createState() => _TaxesScreenState();
}

class _TaxesScreenState extends State<TaxesScreen> {
  static String get _apiBase =>
      kIsWeb ? Uri.base.origin : 'https://app.vitharn.com';
  final _searchController = TextEditingController();
  List<TaxData> _taxes = [];
  bool _loading = true;
  String _filter = 'all';

  @override
  void initState() {
    super.initState();
    _loadTaxes();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<Map<String, String>> _headers() async {
    final clientId =
        Provider.of<AppState>(context, listen: false).clientConfig.clientId;
    final prefs = await SharedPreferences.getInstance();
    return {
      'Authorization': 'Bearer ${prefs.getString('auth_token') ?? ''}',
      'x-client-id': clientId,
      'Content-Type': 'application/json',
    };
  }

  Future<void> _loadTaxes() async {
    if (mounted) setState(() => _loading = true);
    try {
      final uri = Uri.parse('$_apiBase/api/console/taxes').replace(
        queryParameters: {
          if (_searchController.text.trim().isNotEmpty)
            'q': _searchController.text.trim(),
          if (_filter != 'all') 'type': _filter,
          'page_size': '200',
        },
      );
      final response = await http.get(uri, headers: await _headers());
      if (response.statusCode != 200) {
        throw Exception('HTTP ${response.statusCode}');
      }
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      final rows =
          (body['rows'] ?? body['taxes'] ?? body['data'] ?? []) as List?;
      if (mounted) {
        setState(
          () =>
              _taxes =
                  (rows ?? [])
                      .whereType<Map<String, dynamic>>()
                      .map(TaxData.fromMap)
                      .toList(),
        );
      }
    } catch (error) {
      if (mounted) _message('Unable to load taxes: $error', error: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _message(String text, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(text),
        backgroundColor: error ? Colors.red.shade700 : null,
      ),
    );
  }

  Future<void> _saveTax(TaxData? existing, Map<String, dynamic> values) async {
    final uri = Uri.parse(
      '$_apiBase/api/console/taxes${existing?.id == null ? '' : '/${existing!.id}'}',
    );
    final response =
        existing?.id == null
            ? await http.post(
              uri,
              headers: await _headers(),
              body: jsonEncode(values),
            )
            : await http.patch(
              uri,
              headers: await _headers(),
              body: jsonEncode(values),
            );
    if (response.statusCode != 200 && response.statusCode != 201) {
      throw Exception('HTTP ${response.statusCode}');
    }
    await _loadTaxes();
    if (mounted) _message(existing == null ? 'Tax created' : 'Tax updated');
  }

  Future<void> _deleteTax(TaxData tax) async {
    if (tax.id == null || tax.isSystem) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder:
          (context) => AlertDialog(
            title: const Text('Delete tax rate?'),
            content: Text('Remove “${tax.name}” from this tenant?'),
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
    if (confirmed != true) return;
    try {
      final response = await http.delete(
        Uri.parse('$_apiBase/api/console/taxes/${tax.id}'),
        headers: await _headers(),
      );
      if (response.statusCode != 200 && response.statusCode != 204) {
        throw Exception('HTTP ${response.statusCode}');
      }
      await _loadTaxes();
      if (mounted) _message('Tax deleted');
    } catch (error) {
      if (mounted) _message('Unable to delete tax: $error', error: true);
    }
  }

  Future<void> _openEditor([TaxData? tax]) async {
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => _TaxEditor(tax: tax),
    );
    if (result == null) return;
    try {
      await _saveTax(tax, result);
    } catch (error) {
      if (mounted) _message('Unable to save tax: $error', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final active = _taxes.where((tax) => tax.isActive).length;
    final standard = _taxes.where((tax) => tax.type == 'gst').length;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Taxes'),
        actions: [
          IconButton(
            onPressed: _loadTaxes,
            tooltip: 'Refresh taxes',
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openEditor(),
        icon: const Icon(Icons.add),
        label: const Text('Add tax'),
      ),
      body: RefreshIndicator(
        onRefresh: _loadTaxes,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
          children: [
            Text(
              'Manage the rates used in quotations and invoices.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _Metric(
                    label: 'Total rates',
                    value: '${_taxes.length}',
                    icon: Icons.percent,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _Metric(
                    label: 'Active',
                    value: '$active',
                    icon: Icons.check_circle_outline,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _Metric(
                    label: 'GST',
                    value: '$standard',
                    icon: Icons.receipt_long_outlined,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            TextField(
              controller: _searchController,
              onSubmitted: (_) => _loadTaxes(),
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                labelText: 'Search taxes',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: IconButton(
                  onPressed: _loadTaxes,
                  icon: const Icon(Icons.arrow_forward),
                ),
              ),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: _filter,
              decoration: const InputDecoration(labelText: 'Filter by type'),
              items: const [
                DropdownMenuItem(value: 'all', child: Text('All types')),
                DropdownMenuItem(value: 'gst', child: Text('GST')),
                DropdownMenuItem(value: 'exempt', child: Text('Exempt')),
                DropdownMenuItem(value: 'none', child: Text('None')),
              ],
              onChanged: (value) {
                if (value != null) {
                  setState(() => _filter = value);
                  _loadTaxes();
                }
              },
            ),
            const SizedBox(height: 18),
            if (_loading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(40),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (_taxes.isEmpty)
              _EmptyTaxes(onAdd: () => _openEditor())
            else
              ..._taxes.map(
                (tax) => _TaxTile(
                  tax: tax,
                  onEdit: () => _openEditor(tax),
                  onDelete: () => _deleteTax(tax),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  const _Metric({required this.label, required this.value, required this.icon});
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: Theme.of(context).colorScheme.primary),
          const SizedBox(height: 8),
          Text(
            value,
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
          ),
          Text(label, style: Theme.of(context).textTheme.labelSmall),
        ],
      ),
    ),
  );
}

class _TaxTile extends StatelessWidget {
  final TaxData tax;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  const _TaxTile({
    required this.tax,
    required this.onEdit,
    required this.onDelete,
  });
  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: 10),
    child: ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      leading: CircleAvatar(
        child: Text('${tax.rate % 1 == 0 ? tax.rate.toInt() : tax.rate}%'),
      ),
      title: Text(
        tax.name,
        style: const TextStyle(fontWeight: FontWeight.w700),
      ),
      subtitle: Text(
        '${tax.code.isEmpty ? 'No code' : tax.code}  •  ${tax.type.toUpperCase()}${tax.isSystem ? '  •  System rate' : ''}\n${tax.isActive ? 'Active' : 'Inactive'}',
      ),
      isThreeLine: true,
      trailing: PopupMenuButton<String>(
        onSelected: (value) {
          if (value == 'edit') onEdit();
          if (value == 'delete') onDelete();
        },
        itemBuilder:
            (context) => [
              const PopupMenuItem(value: 'edit', child: Text('Edit')),
              PopupMenuItem(
                value: 'delete',
                enabled: !tax.isSystem,
                child: const Text('Delete'),
              ),
            ],
      ),
    ),
  );
}

class _EmptyTaxes extends StatelessWidget {
  final VoidCallback onAdd;
  const _EmptyTaxes({required this.onAdd});
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        children: [
          const Icon(Icons.percent, size: 44),
          const SizedBox(height: 12),
          const Text(
            'No tax rates yet',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
          ),
          const SizedBox(height: 6),
          const Text('Add a rate to keep your billing accurate.'),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: onAdd,
            icon: const Icon(Icons.add),
            label: const Text('Add your first tax'),
          ),
        ],
      ),
    ),
  );
}

class _TaxEditor extends StatefulWidget {
  final TaxData? tax;
  const _TaxEditor({this.tax});
  @override
  State<_TaxEditor> createState() => _TaxEditorState();
}

class _TaxEditorState extends State<_TaxEditor> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _code;
  late final TextEditingController _rate;
  late final TextEditingController _description;
  late String _type;
  late bool _active;
  @override
  void initState() {
    super.initState();
    final tax = widget.tax;
    _name = TextEditingController(text: tax?.name);
    _code = TextEditingController(text: tax?.code);
    _rate = TextEditingController(text: tax == null ? '' : '${tax.rate}');
    _description = TextEditingController(text: tax?.description);
    _type = tax?.type ?? 'gst';
    _active = tax?.isActive ?? true;
  }

  @override
  void dispose() {
    _name.dispose();
    _code.dispose();
    _rate.dispose();
    _description.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.tax == null ? 'Add tax rate' : 'Edit tax rate'),
    content: SizedBox(
      width: 460,
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: _name,
                decoration: const InputDecoration(labelText: 'Name'),
                validator:
                    (v) =>
                        v == null || v.trim().isEmpty
                            ? 'Name is required'
                            : null,
              ),
              TextFormField(
                controller: _code,
                decoration: const InputDecoration(labelText: 'Code'),
              ),
              TextFormField(
                controller: _rate,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(labelText: 'Rate (%)'),
                validator: (v) {
                  final value = double.tryParse(v ?? '');
                  return value == null || value < 0 || value > 100
                      ? 'Enter a rate from 0 to 100'
                      : null;
                },
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _type,
                decoration: const InputDecoration(labelText: 'Type'),
                items: const [
                  DropdownMenuItem(value: 'gst', child: Text('GST')),
                  DropdownMenuItem(value: 'exempt', child: Text('Exempt')),
                  DropdownMenuItem(value: 'none', child: Text('None')),
                ],
                onChanged:
                    widget.tax?.isSystem == true
                        ? null
                        : (v) {
                          if (v != null) setState(() => _type = v);
                        },
              ),
              TextFormField(
                controller: _description,
                maxLines: 2,
                decoration: const InputDecoration(labelText: 'Description'),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Active'),
                value: _active,
                onChanged:
                    widget.tax?.isSystem == true
                        ? null
                        : (v) => setState(() => _active = v),
              ),
            ],
          ),
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      FilledButton(
        onPressed: () {
          if (!_formKey.currentState!.validate()) return;
          final rate = _type == 'gst' ? double.parse(_rate.text) : 0.0;
          Navigator.pop(context, {
            'name': _name.text.trim(),
            'code': _code.text.trim(),
            'type': _type,
            'rate': rate,
            'description': _description.text.trim(),
            'is_active': _active,
          });
        },
        child: const Text('Save'),
      ),
    ],
  );
}
