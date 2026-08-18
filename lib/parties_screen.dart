import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_state.dart';

class Party {
  final String? id;
  final String name;
  final String type;
  final String company;
  final String phone;
  final String email;
  final String address;
  final String gstNumber;
  const Party({
    this.id,
    required this.name,
    this.type = 'customer',
    this.company = '',
    this.phone = '',
    this.email = '',
    this.address = '',
    this.gstNumber = '',
  });
  factory Party.fromJson(Map<String, dynamic> j) => Party(
    id: j['id']?.toString(),
    name: (j['name'] ?? '').toString(),
    type: (j['type'] ?? j['party_type'] ?? 'customer').toString(),
    company: (j['company'] ?? '').toString(),
    phone: (j['phone'] ?? '').toString(),
    email: (j['email'] ?? '').toString(),
    address: (j['address'] ?? '').toString(),
    gstNumber: (j['gst_number'] ?? '').toString(),
  );
  Map<String, dynamic> toJson() => {
    'name': name,
    'type': type,
    'company': company,
    'phone': phone,
    'email': email,
    'address': address,
    'gst_number': gstNumber,
  };
}

/// Customers and suppliers ledger for the tenant-scoped parties API.
class PartiesScreen extends StatefulWidget {
  const PartiesScreen({super.key});
  @override
  State<PartiesScreen> createState() => _PartiesScreenState();
}

class _PartiesScreenState extends State<PartiesScreen> {
  static String get _base =>
      kIsWeb ? Uri.base.origin : 'https://app.vitharn.com';
  final _search = TextEditingController();
  List<Party> _rows = [];
  bool _loading = true;
  String _type = 'all';
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<Map<String, String>> _headers() async {
    final clientId = context.read<AppState>().clientConfig.clientId;
    final prefs = await SharedPreferences.getInstance();
    return {
      'Authorization': 'Bearer ${prefs.getString('auth_token') ?? ''}',
      'x-client-id': clientId,
      'Content-Type': 'application/json',
    };
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final q = <String, String>{'page_size': '200'};
      if (_search.text.trim().isNotEmpty) q['q'] = _search.text.trim();
      if (_type != 'all') q['type'] = _type;
      final r = await http.get(
        Uri.parse('$_base/api/console/parties').replace(queryParameters: q),
        headers: await _headers(),
      );
      if (r.statusCode < 200 || r.statusCode >= 300)
        throw Exception(r.statusCode);
      final body = jsonDecode(r.body) as Map<String, dynamic>;
      final rows = (body['rows'] as List? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(Party.fromJson)
          .toList();
      if (mounted)
        setState(() {
          _rows = rows;
          _loading = false;
        });
    } catch (_) {
      if (mounted)
        setState(() {
          _loading = false;
          _error = 'Could not load parties. Check your connection.';
        });
    }
  }

  Future<void> _remove(Party p) async {
    if (p.id == null) return;
    final ok =
        await showDialog<bool>(
          context: context,
          builder: (c) => AlertDialog(
            title: const Text('Remove party?'),
            content: Text(
              '${p.name} will be hidden. Historical records are preserved.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(c, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(c, true),
                child: const Text('Remove'),
              ),
            ],
          ),
        ) ??
        false;
    if (!ok) return;
    final r = await http.delete(
      Uri.parse('$_base/api/console/parties/${p.id}'),
      headers: await _headers(),
    );
    if (!mounted) return;
    if (r.statusCode >= 200 && r.statusCode < 300) {
      _load();
    } else {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Could not remove party')));
    }
  }

  void _form([Party? p]) {
    final name = TextEditingController(text: p?.name);
    final company = TextEditingController(text: p?.company);
    final phone = TextEditingController(text: p?.phone);
    final email = TextEditingController(text: p?.email);
    final gst = TextEditingController(text: p?.gstNumber);
    final address = TextEditingController(text: p?.address);
    var type = p?.type == 'supplier' ? 'supplier' : 'customer';
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (c) => StatefulBuilder(
        builder: (c, setModal) => Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            20,
            20,
            MediaQuery.of(c).viewInsets.bottom + 20,
          ),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  p == null ? 'Add party' : 'Edit party',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 16),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(
                      value: 'customer',
                      label: Text('Customer'),
                      icon: Icon(Icons.person_outline),
                    ),
                    ButtonSegment(
                      value: 'supplier',
                      label: Text('Supplier'),
                      icon: Icon(Icons.local_shipping_outlined),
                    ),
                  ],
                  selected: {type},
                  onSelectionChanged: (s) => setModal(() => type = s.first),
                ),
                const SizedBox(height: 14),
                _field(name, 'Name *', Icons.person),
                _field(company, 'Company', Icons.business),
                Row(
                  children: [
                    Expanded(child: _field(phone, 'Phone', Icons.phone)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _field(email, 'Email', Icons.email_outlined),
                    ),
                  ],
                ),
                _field(gst, 'GST number', Icons.receipt_long),
                _field(
                  address,
                  'Address',
                  Icons.location_on_outlined,
                  lines: 2,
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: () => _save(
                      Party(
                        id: p?.id,
                        name: name.text.trim(),
                        type: type,
                        company: company.text.trim(),
                        phone: phone.text.trim(),
                        email: email.text.trim(),
                        gstNumber: gst.text.trim(),
                        address: address.text.trim(),
                      ),
                    ),
                    icon: const Icon(Icons.check),
                    label: const Text('Save party'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _field(
    TextEditingController c,
    String label,
    IconData icon, {
    int lines = 1,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: TextField(
      controller: c,
      maxLines: lines,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon),
        border: const OutlineInputBorder(),
      ),
    ),
  );
  Future<void> _save(Party p) async {
    try {
      final u = p.id == null
          ? Uri.parse('$_base/api/console/parties')
          : Uri.parse('$_base/api/console/parties/${p.id}');
      final r = p.id == null
          ? await http.post(
              u,
              headers: await _headers(),
              body: jsonEncode(p.toJson()),
            )
          : await http.patch(
              u,
              headers: await _headers(),
              body: jsonEncode(p.toJson()),
            );
      if (r.statusCode < 200 || r.statusCode >= 300) throw Exception();
      if (mounted) {
        Navigator.pop(context);
        _load();
      }
    } catch (_) {
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Could not save party')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final customers = _rows.where((p) => p.type != 'supplier').length;
    final suppliers = _rows.where((p) => p.type == 'supplier').length;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Parties ledger'),
        actions: [
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Row(
              children: [
                _stat(
                  'All',
                  _rows.length,
                  Icons.people_alt_outlined,
                  Colors.indigo,
                ),
                const SizedBox(width: 8),
                _stat(
                  'Customers',
                  customers,
                  Icons.person_outline,
                  Colors.green,
                ),
                const SizedBox(width: 8),
                _stat(
                  'Suppliers',
                  suppliers,
                  Icons.local_shipping_outlined,
                  Colors.orange,
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: TextField(
              controller: _search,
              onChanged: (_) => _load(),
              decoration: const InputDecoration(
                hintText: 'Search name, phone or company',
                prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(),
              ),
            ),
          ),
          SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              children: ['all', 'customer', 'supplier']
                  .map(
                    (v) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(
                          v == 'all'
                              ? 'All parties'
                              : v == 'customer'
                              ? 'Customers'
                              : 'Suppliers',
                        ),
                        selected: _type == v,
                        onSelected: (_) {
                          setState(() => _type = v);
                          _load();
                        },
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                ? _errorWidget()
                : _rows.isEmpty
                ? _emptyWidget()
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: _rows.length,
                      itemBuilder: (_, i) => _card(_rows[i], i),
                    ),
                  ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _form,
        icon: const Icon(Icons.person_add_alt_1),
        label: const Text('Add party'),
      ),
    );
  }

  Widget _stat(String label, int value, IconData icon, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: color.withValues(alpha: .08),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withValues(alpha: .2)),
        ),
        child: Row(
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 7),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$value',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: color,
                    fontSize: 16,
                  ),
                ),
                Text(label, style: const TextStyle(fontSize: 11)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _card(Party p, int i) {
    final supplier = p.type == 'supplier',
        color = supplier ? Colors.orange : Colors.green;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: color.withValues(alpha: .12),
          child: Icon(
            supplier ? Icons.local_shipping_outlined : Icons.person_outline,
            color: color,
          ),
        ),
        title: Text(
          p.name,
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        subtitle: Text(
          [
            if (p.company.isNotEmpty) p.company,
            if (p.phone.isNotEmpty) p.phone,
            if (p.email.isNotEmpty) p.email,
          ].join(' • '),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: PopupMenuButton<String>(
          onSelected: (v) {
            if (v == 'edit') _form(p);
            if (v == 'delete') _remove(p);
          },
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'edit', child: Text('Edit')),
            PopupMenuItem(value: 'delete', child: Text('Remove')),
          ],
        ),
      ),
    ).animate().fade(delay: Duration(milliseconds: 30 * i));
  }

  Widget _emptyWidget() => const Center(
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.people_outline, size: 58, color: Colors.grey),
        SizedBox(height: 12),
        Text('No parties found'),
        SizedBox(height: 6),
        Text('Add customers and suppliers to your ledger'),
      ],
    ),
  );
  Widget _errorWidget() => Center(
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(Icons.cloud_off, size: 54, color: Colors.grey),
        const SizedBox(height: 12),
        Text(_error!),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: _load,
          icon: const Icon(Icons.refresh),
          label: const Text('Try again'),
        ),
      ],
    ),
  );
}
