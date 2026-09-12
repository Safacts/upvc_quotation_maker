import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_state.dart';
import 'config/client_loader.dart';
import 'field_home_screen.dart';
import 'services/fabricator_map_service.dart';
import 'services/field_task_service.dart';
import 'services/notification_center_service.dart';
import 'services/offline_database.dart';
import 'supabase_config.dart';

/// fabricator_switch_screen.dart -- ADDITIVE ONLY (field APK only).
///
/// Lets ONE supplier executive file quotes under DIFFERENT fabricators.
/// Switch = flush old tenant queue -> load new tenant config -> set header ->
/// apply config -> persist session -> rebind notifications -> fresh home.
///
/// Auth is NOT bypassed: after switching, the executive logs into the new
/// tenant with that tenant's own credentials (same as first launch).
class FabricatorSwitchScreen extends StatefulWidget {
  const FabricatorSwitchScreen({super.key});

  @override
  State<FabricatorSwitchScreen> createState() => _FabricatorSwitchScreenState();
}

class _FabricatorSwitchScreenState extends State<FabricatorSwitchScreen> {
  List<String> _mapped = [];
  String _current = '';
  bool _busy = false;
  final _addController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _addController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final mapped = await FabricatorMapService.instance.mapped();
    String current = '';
    try {
      current = SupabaseConfig.client.headers['x-client-id'] ?? '';
      if (current.isEmpty) {
        final prefs = await SharedPreferences.getInstance();
        current = prefs.getString('session_client_id') ?? '';
      }
    } catch (_) {}
    // First run: seed with the baked-in tenant so the list is never empty.
    if (mapped.isEmpty && current.isNotEmpty) {
      await FabricatorMapService.instance.add(current);
      mapped.add(current);
    }
    if (mounted) {
      setState(() {
        _mapped = mapped;
        _current = current;
      });
    }
  }

  /// Fail-closed tenant check: `loadConfig` returns a skeleton for unknown
  /// IDs, so existence must be verified against `client_public` directly.
  Future<String?> _resolveRealTenant(String rawId) async {
    final id = rawId.trim();
    if (id.isEmpty) return null;
    try {
      final exact = await SupabaseConfig.client
          .from('client_public')
          .select('id')
          .eq('id', id)
          .maybeSingle()
          .timeout(const Duration(seconds: 8));
      if (exact != null && (exact['id'] as String?)?.isNotEmpty == true) {
        return exact['id'] as String;
      }
      final all = await SupabaseConfig.client
          .from('client_public')
          .select('id')
          .timeout(const Duration(seconds: 8)) as List;
      for (final r in all) {
        final cid = (r as Map)['id']?.toString() ?? '';
        if (cid.toLowerCase() == id.toLowerCase()) return cid;
      }
    } catch (_) {}
    return null;
  }

  Future<void> _add() async {
    final id = _addController.text.trim();
    if (id.isEmpty) return;
    setState(() => _busy = true);
    try {
      // Validate the fabricator exists before mapping it.
      final real = await _resolveRealTenant(id);
      if (real == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
                content: Text('Fabricator not found. Check the ID.')),
          );
        }
        return;
      }
      await FabricatorMapService.instance.add(real);
      _addController.clear();
      await _load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not reach server. Try online.')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _switchTo(String clientId) async {
    if (clientId == _current) {
      Navigator.pop(context);
      return;
    }
    setState(() => _busy = true);
    try {
      final appState = Provider.of<AppState>(context, listen: false);
      final oldClient = _current;
      // 1. Flush the old tenant's offline queue FIRST (no cross-tenant bleed).
      if (oldClient.isNotEmpty) {
        await FieldTaskService.instance.flushQueue(oldClient);
      }
      // 2. Fail closed: confirm the tenant is real BEFORE rebinding.
      final real = await _resolveRealTenant(clientId);
      if (real == null) throw Exception('unknown fabricator');
      final config = await ClientLoader.loadConfig(clientId: real)
          .timeout(const Duration(seconds: 12));
      // 3. Rebind tenant: header + in-memory config + offline db scope.
      SupabaseConfig.client.headers['x-client-id'] = config.clientId;
      appState.applyClientConfig(config);
      OfflineDatabase.instance.setActiveClient(config.clientId);
      // 4. Persist session for next cold start (mirror login_screen).
      try {
        if (kIsWeb) {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString('session_client_id', config.clientId);
        } else {
          const storage = FlutterSecureStorage();
          await storage.write(
              key: 'session_client_id', value: config.clientId);
        }
      } catch (_) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('session_client_id', config.clientId);
      }
      // 5. Rebind realtime notifications to the new tenant.
      try {
        await NotificationCenterService().resubscribe(config.clientId);
      } catch (_) {}
      if (!mounted) return;
      // 6. Fresh field home under the new tenant (login if session expired).
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(builder: (_) => const FieldHomeScreen()),
        (_) => false,
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Switch failed. Stayed on current fabricator.')),
        );
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Switch fabricator')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Filing under: ${_current.isEmpty ? '—' : _current}',
                style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            const Text(
              'Each fabricator has its own locked rates. Quotes always file '
              'under the selected fabricator only.',
              style: TextStyle(color: Colors.grey),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _addController,
                    decoration: const InputDecoration(
                      labelText: 'Add fabricator ID (e.g. kprupvc)',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: _busy ? null : _add,
                  child: const Text('Add'),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Expanded(
              child: _mapped.isEmpty
                  ? const Center(child: Text('No fabricators mapped yet.'))
                  : ListView.builder(
                      itemCount: _mapped.length,
                      itemBuilder: (_, i) {
                        final id = _mapped[i];
                        final active = id == _current;
                        return Card(
                          child: ListTile(
                            leading: Icon(
                              active
                                  ? Icons.check_circle
                                  : Icons.business_outlined,
                              color: active ? Colors.green : null,
                            ),
                            title: Text(id),
                            subtitle:
                                Text(active ? 'Active' : 'Tap to switch'),
                            trailing: active
                                ? null
                                : IconButton(
                                    icon: const Icon(Icons.delete_outline),
                                    onPressed: _busy
                                        ? null
                                        : () async {
                                            await FabricatorMapService
                                                .instance
                                                .remove(id);
                                            _load();
                                          },
                                  ),
                            onTap:
                                (_busy || active) ? null : () => _switchTo(id),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
