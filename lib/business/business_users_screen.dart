import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

/// Tenant-facing business profile and team management screen.
///
/// The API is deliberately called through the authenticated console routes;
/// this widget never talks directly to Supabase or accepts a tenant id from UI
/// state. That keeps the server session as the source of tenant identity.
class BusinessUsersScreen extends StatefulWidget {
  const BusinessUsersScreen({super.key});

  @override
  State<BusinessUsersScreen> createState() => _BusinessUsersScreenState();
}

class _BusinessUsersScreenState extends State<BusinessUsersScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 2, vsync: this);
  final _businessFormKey = GlobalKey<FormState>();
  final _business = <String, dynamic>{};
  List<Map<String, dynamic>> _users = [];
  bool _loading = true;
  bool _saving = false;
  String? _error;

  final _name = TextEditingController();
  final _legalName = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _gstin = TextEditingController();
  final _address = TextEditingController();

  String get _baseUrl => kIsWeb ? '' : 'https://app.vitharn.com';
  Uri _uri(String path) => Uri.parse('$_baseUrl$path');

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    for (final c in [_name, _legalName, _email, _phone, _gstin, _address]) {
      c.dispose();
    }
    super.dispose();
  }

  dynamic _payload(http.Response response) {
    if (response.body.trim().isEmpty) return null;
    final decoded = jsonDecode(response.body);
    if (decoded is Map<String, dynamic>) {
      return decoded['data'] ??
          decoded['business'] ??
          decoded['users'] ??
          decoded;
    }
    return decoded;
  }

  Future<dynamic> _request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) async {
    final headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    final uri = _uri(path);
    final response =
        method == 'GET'
            ? await http.get(uri, headers: headers)
            : method == 'PATCH'
            ? await http.patch(
              uri,
              headers: headers,
              body: jsonEncode(body ?? {}),
            )
            : method == 'POST'
            ? await http.post(
              uri,
              headers: headers,
              body: jsonEncode(body ?? {}),
            )
            : await http.delete(uri, headers: headers);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      String message = 'Request failed (HTTP ${response.statusCode})';
      try {
        final decoded = jsonDecode(response.body);
        if (decoded is Map && decoded['error'] is String)
          message = decoded['error'] as String;
      } catch (_) {}
      throw Exception(message);
    }
    return _payload(response);
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        _request('/api/console/business'),
        _request('/api/console/users'),
      ]);
      final rawBusiness =
          results[0] is Map
              ? Map<String, dynamic>.from(results[0] as Map)
              : <String, dynamic>{};
      final rawUsers = results[1] is List ? results[1] : <dynamic>[];
      _business
        ..clear()
        ..addAll(rawBusiness);
      _users =
          rawUsers
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
      _name.text = '${_business['name'] ?? _business['company_name'] ?? ''}';
      _legalName.text = '${_business['legal_name'] ?? ''}';
      _email.text = '${_business['email'] ?? ''}';
      _phone.text = '${_business['phone'] ?? ''}';
      _gstin.text = '${_business['gstin'] ?? ''}';
      _address.text = '${_business['address'] ?? ''}';
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _saveBusiness() async {
    if (!(_businessFormKey.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    try {
      await _request(
        '/api/console/business',
        method: 'PATCH',
        body: {
          'name': _name.text.trim(),
          'legal_name': _legalName.text.trim(),
          'email': _email.text.trim(),
          'phone': _phone.text.trim(),
          'gstin': _gstin.text.trim(),
          'address': _address.text.trim(),
        },
      );
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Business profile saved')));
    } catch (e) {
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
        );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _inviteUser() async {
    final email = TextEditingController();
    final name = TextEditingController();
    String role = 'staff';
    final result = await showDialog<bool>(
      context: context,
      builder:
          (context) => StatefulBuilder(
            builder:
                (context, setDialogState) => AlertDialog(
                  title: const Text('Add team member'),
                  content: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      TextField(
                        controller: name,
                        decoration: const InputDecoration(labelText: 'Name'),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: email,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(labelText: 'Email'),
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        value: role,
                        decoration: const InputDecoration(labelText: 'Role'),
                        items: const [
                          DropdownMenuItem(
                            value: 'staff',
                            child: Text('Staff'),
                          ),
                          DropdownMenuItem(
                            value: 'admin',
                            child: Text('Admin'),
                          ),
                        ],
                        onChanged:
                            (value) =>
                                setDialogState(() => role = value ?? 'staff'),
                      ),
                    ],
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Cancel'),
                    ),
                    FilledButton(
                      onPressed: () async {
                        if (email.text.trim().isEmpty) return;
                        try {
                          await _request(
                            '/api/console/users',
                            method: 'POST',
                            body: {
                              'name': name.text.trim(),
                              'email': email.text.trim(),
                              'role': role,
                            },
                          );
                          if (context.mounted) Navigator.pop(context, true);
                        } catch (e) {
                          if (context.mounted)
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  e.toString().replaceFirst('Exception: ', ''),
                                ),
                              ),
                            );
                        }
                      },
                      child: const Text('Add'),
                    ),
                  ],
                ),
          ),
    );
    email.dispose();
    name.dispose();
    if (result == true) _load();
  }

  Future<void> _removeUser(Map<String, dynamic> user) async {
    final id = user['id'];
    if (id == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder:
          (context) => AlertDialog(
            title: const Text('Remove team member?'),
            content: Text(
              'Remove ${user['name'] ?? user['email'] ?? 'this user'} from the business?',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Remove'),
              ),
            ],
          ),
    );
    if (confirmed != true) return;
    try {
      await _request('/api/console/users/$id', method: 'DELETE');
      _load();
    } catch (e) {
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
        );
    }
  }

  InputDecoration _decoration(String label, IconData icon) =>
      InputDecoration(labelText: label, prefixIcon: Icon(icon));

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Business & Users',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(
            onPressed: _load,
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
          ),
        ],
      ),
      body:
          _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
              ? _ErrorState(message: _error!, onRetry: _load)
              : Column(
                children: [
                  Container(
                    color: theme.colorScheme.surface,
                    child: TabBar(
                      controller: _tabs,
                      tabs: const [
                        Tab(
                          icon: Icon(Icons.business_outlined),
                          text: 'Business',
                        ),
                        Tab(icon: Icon(Icons.groups_outlined), text: 'Users'),
                      ],
                    ),
                  ),
                  Expanded(
                    child: TabBarView(
                      controller: _tabs,
                      children: [_businessView(), _usersView()],
                    ),
                  ),
                ],
              ),
    );
  }

  Widget _businessView() => Form(
    key: _businessFormKey,
    child: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        _SectionHeading(
          icon: Icons.storefront_outlined,
          title: 'Business profile',
          subtitle:
              'Keep the details used across your quotations and invoices up to date.',
        ),
        const SizedBox(height: 20),
        TextFormField(
          controller: _name,
          decoration: _decoration('Business name', Icons.business_outlined),
          validator: (v) => v!.trim().isEmpty ? 'Enter a business name' : null,
        ),
        const SizedBox(height: 14),
        TextFormField(
          controller: _legalName,
          decoration: _decoration(
            'Legal name (optional)',
            Icons.description_outlined,
          ),
        ),
        const SizedBox(height: 14),
        TextFormField(
          controller: _email,
          decoration: _decoration('Business email', Icons.email_outlined),
          keyboardType: TextInputType.emailAddress,
        ),
        const SizedBox(height: 14),
        TextFormField(
          controller: _phone,
          decoration: _decoration('Phone', Icons.phone_outlined),
          keyboardType: TextInputType.phone,
        ),
        const SizedBox(height: 14),
        TextFormField(
          controller: _gstin,
          decoration: _decoration('GSTIN', Icons.receipt_long_outlined),
          textCapitalization: TextCapitalization.characters,
        ),
        const SizedBox(height: 14),
        TextFormField(
          controller: _address,
          decoration: _decoration('Address', Icons.location_on_outlined),
          minLines: 2,
          maxLines: 4,
        ),
        const SizedBox(height: 24),
        Align(
          alignment: Alignment.centerRight,
          child: FilledButton.icon(
            onPressed: _saving ? null : _saveBusiness,
            icon:
                _saving
                    ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                    : const Icon(Icons.save_outlined),
            label: Text(_saving ? 'Saving…' : 'Save changes'),
          ),
        ),
      ],
    ),
  );

  Widget _usersView() => RefreshIndicator(
    onRefresh: _load,
    child: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _SectionHeading(
                icon: Icons.groups_outlined,
                title: 'Team members',
                subtitle: 'Manage who can work in this business workspace.',
              ),
            ),
            const SizedBox(width: 12),
            FilledButton.icon(
              onPressed: _inviteUser,
              icon: const Icon(Icons.person_add_alt_1),
              label: const Text('Add'),
            ),
          ],
        ),
        const SizedBox(height: 20),
        if (_users.isEmpty)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Column(
                children: [
                  Icon(
                    Icons.group_off_outlined,
                    size: 48,
                    color: Colors.grey.shade400,
                  ),
                  const SizedBox(height: 12),
                  const Text('No team members yet'),
                  const SizedBox(height: 4),
                  Text(
                    'Add a staff member to share the workload.',
                    style: TextStyle(color: Colors.grey),
                  ),
                ],
              ),
            ),
          )
        else
          ..._users.map(
            (user) => Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: ListTile(
                leading: CircleAvatar(
                  child: Text(
                    '${(user['name'] ?? user['email'] ?? '?').toString().substring(0, 1).toUpperCase()}',
                  ),
                ),
                title: Text('${user['name'] ?? 'Unnamed user'}'),
                subtitle: Text(
                  '${user['email'] ?? 'No email'}  •  ${user['role'] ?? 'staff'}',
                ),
                trailing:
                    user['is_owner'] == true || user['role'] == 'owner'
                        ? const Chip(label: Text('Owner'))
                        : IconButton(
                          onPressed: () => _removeUser(user),
                          icon: const Icon(Icons.delete_outline),
                          tooltip: 'Remove user',
                        ),
              ),
            ),
          ),
      ],
    ),
  );
}

class _SectionHeading extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  const _SectionHeading({
    required this.icon,
    required this.title,
    required this.subtitle,
  });
  @override
  Widget build(BuildContext context) => Row(
    children: [
      Icon(icon, color: Theme.of(context).colorScheme.primary, size: 30),
      const SizedBox(width: 12),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 3),
            Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    ],
  );
}

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorState({required this.message, required this.onRetry});
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off_outlined, size: 52),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh),
            label: const Text('Try again'),
          ),
        ],
      ),
    ),
  );
}
