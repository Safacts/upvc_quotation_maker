import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../app_state.dart';
import '../supabase_config.dart';
import 'client_edit_screen.dart';

class AdminScreen extends StatefulWidget {
  const AdminScreen({super.key});

  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> {
  List<Map<String, dynamic>> _clients = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchClients();
  }

  Future<void> _fetchClients() async {
    setState(() => _isLoading = true);
    try {
      final response = await SupabaseConfig.client
          .from('clients')
          .select()
          .order('created_at', ascending: false);
      setState(() {
        _clients = (response as List).cast<Map<String, dynamic>>();
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load clients: $e')),
        );
      }
    }
  }

  Future<void> _toggleActive(String clientId, bool current) async {
    try {
      await SupabaseConfig.client
          .from('clients')
          .update({'is_active': !current})
          .eq('id', clientId);
      _fetchClients();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final appState = Provider.of<AppState>(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin Panel'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'Add Client',
            onPressed: () async {
              await Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => ClientEditScreen()),
              );
              _fetchClients();
            },
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _clients.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.group_off, size: 60, color: Colors.grey.shade400),
                      const SizedBox(height: 16),
                      Text('No clients configured', style: TextStyle(color: Colors.grey.shade500, fontSize: 18)),
                      const SizedBox(height: 24),
                      ElevatedButton.icon(
                        onPressed: () async {
                          await Navigator.push(
                            context,
                            MaterialPageRoute(builder: (context) => ClientEditScreen()),
                          );
                          _fetchClients();
                        },
                        icon: const Icon(Icons.add),
                        label: const Text('Add First Client'),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _fetchClients,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _clients.length,
                    itemBuilder: (context, index) {
                      final client = _clients[index];
                      final id = client['id'] as String? ?? '';
                      final config = client['config'] as Map<String, dynamic>? ?? {};
                      final isActive = client['is_active'] as bool? ?? true;
                      final trialExpiresAt = client['trial_expires_at'] as String?;
                      final companyName = config['companyName'] as String? ?? id;
                      final appName = config['appName'] as String? ?? '';
                      final logoUrl = config['logoUrl'] as String?;

                      final trialExpired = trialExpiresAt != null
                          ? DateTime.now().isAfter(DateTime.tryParse(trialExpiresAt) ?? DateTime.now().add(const Duration(days: 1)))
                          : false;

                      return Card(
                        margin: const EdgeInsets.only(bottom: 12),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(20),
                          onTap: () async {
                            await Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (context) => ClientEditScreen(clientData: client),
                              ),
                            );
                            _fetchClients();
                          },
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Row(
                              children: [
                                CircleAvatar(
                                  backgroundColor: isActive
                                      ? Colors.green.withValues(alpha: 0.1)
                                      : Colors.grey.withValues(alpha: 0.1),
                                  child: logoUrl != null && logoUrl.isNotEmpty
                                      ? ClipOval(child: Image.network(logoUrl, width: 36, height: 36, fit: BoxFit.cover, errorBuilder: (_, __, ___) => Icon(Icons.business, color: isActive ? Colors.green : Colors.grey)))
                                      : Icon(Icons.business, color: isActive ? Colors.green : Colors.grey),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(companyName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                                      const SizedBox(height: 4),
                                      Text(id, style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
                                      if (appName.isNotEmpty)
                                        Text(appName, style: TextStyle(color: Colors.grey.shade500, fontSize: 11)),
                                      Row(
                                        children: [
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                            decoration: BoxDecoration(
                                              color: isActive ? Colors.green.withValues(alpha: 0.1) : Colors.red.withValues(alpha: 0.1),
                                              borderRadius: BorderRadius.circular(8),
                                            ),
                                            child: Text(
                                              isActive ? 'Active' : 'Inactive',
                                              style: TextStyle(
                                                fontSize: 10,
                                                fontWeight: FontWeight.bold,
                                                color: isActive ? Colors.green : Colors.red,
                                              ),
                                            ),
                                          ),
                                          if (trialExpired)
                                            Container(
                                              margin: const EdgeInsets.only(left: 6),
                                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                              decoration: BoxDecoration(
                                                color: Colors.orange.withValues(alpha: 0.1),
                                                borderRadius: BorderRadius.circular(8),
                                              ),
                                              child: const Text(
                                                'Trial Expired',
                                                style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.orange),
                                              ),
                                            ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                                Switch(
                                  value: isActive,
                                  onChanged: (_) => _toggleActive(id, isActive),
                                  activeThumbColor: Colors.green,
                                ),
                              ],
                            ),
                          ),
                        ),
                      ).animate().fade(delay: Duration(milliseconds: 50 * index)).slideX(begin: 0.05);
                    },
                  ),
                ),
    );
  }
}
