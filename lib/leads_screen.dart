import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';
import 'supabase_config.dart';
import 'lead_detail_screen.dart';

class LeadData {
  String? id;
  String name = '';
  String company = '';
  String phone = '';
  String email = '';
  String source = '';
  String status = 'new';
  double value = 0;
  String notes = '';
  DateTime lastActivity;
  DateTime createdAt;

  LeadData({
    this.id,
    this.name = '',
    this.company = '',
    this.phone = '',
    this.email = '',
    this.source = '',
    this.status = 'new',
    this.value = 0,
    this.notes = '',
    DateTime? lastActivity,
    DateTime? createdAt,
  })  : lastActivity = lastActivity ?? DateTime.now(),
        createdAt = createdAt ?? DateTime.now();

  Map<String, dynamic> toMap({String? clientId}) => {
    if (id != null) 'id': id,
    'name': name,
    'company': company,
    'phone': phone,
    'email': email,
    'source': source,
    'status': status,
    'value': value,
    'notes': notes,
    if (clientId != null && clientId.isNotEmpty) 'client_id': clientId,
  };

  static LeadData fromMap(Map<String, dynamic> map) {
    return LeadData(
      id: map['id'] as String?,
      name: (map['name'] ?? '') as String,
      company: (map['company'] ?? '') as String,
      phone: (map['phone'] ?? '') as String,
      email: (map['email'] ?? '') as String,
      source: (map['source'] ?? '') as String,
      status: (map['status'] ?? 'new') as String,
      value: (map['value'] as num?)?.toDouble() ?? 0,
      notes: (map['notes'] ?? '') as String,
      lastActivity: map['last_activity'] != null
          ? DateTime.tryParse(map['last_activity'].toString()) ?? DateTime.now()
          : DateTime.now(),
      createdAt: map['created_at'] != null
          ? DateTime.tryParse(map['created_at'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

class LeadsScreen extends StatefulWidget {
  const LeadsScreen({super.key});

  @override
  State<LeadsScreen> createState() => _LeadsScreenState();
}

class _LeadsScreenState extends State<LeadsScreen> {
  List<LeadData> _leads = [];
  bool _isLoading = true;
  String _searchQuery = '';
  String _selectedStatus = 'all';

  static const List<String> _statuses = [
    'all', 'new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost',
  ];

  static const Map<String, Color> _statusColors = {
    'new': Colors.blue,
    'contacted': Colors.teal,
    'qualified': Colors.purple,
    'proposal': Colors.orange,
    'negotiation': Colors.amber,
    'won': Colors.green,
    'lost': Colors.red,
  };

  static const Map<String, IconData> _statusIcons = {
    'new': Icons.fiber_new,
    'contacted': Icons.phone,
    'qualified': Icons.verified,
    'proposal': Icons.description,
    'negotiation': Icons.handshake,
    'won': Icons.check_circle,
    'lost': Icons.cancel,
  };

  @override
  void initState() {
    super.initState();
    _loadLeads();
  }

  Future<void> _loadLeads() async {
    setState(() => _isLoading = true);
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final response = await SupabaseConfig.client
          .from('leads')
          .select()
          .eq('client_id', clientId)
          .order('created_at', ascending: false);

      if (mounted) {
        setState(() {
          _leads = (response as List).map((e) => LeadData.fromMap(e)).toList();
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load leads: $e')),
        );
      }
    }
  }

  List<LeadData> get _filteredLeads {
    return _leads.where((l) {
      final matchesSearch = _searchQuery.isEmpty ||
          l.name.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          l.company.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          l.phone.contains(_searchQuery);
      final matchesStatus = _selectedStatus == 'all' || l.status == _selectedStatus;
      return matchesSearch && matchesStatus;
    }).toList();
  }

  int get _totalCount => _leads.length;
  double get _totalValue => _leads.fold(0.0, (sum, l) => sum + l.value);
  int get _wonCount => _leads.where((l) => l.status == 'won').length;
  double get _conversionRate {
    if (_totalCount == 0) return 0;
    return (_wonCount / _totalCount) * 100;
  }

  void _showCreateSheet() {
    final nameController = TextEditingController();
    final companyController = TextEditingController();
    final phoneController = TextEditingController();
    final emailController = TextEditingController();
    final valueController = TextEditingController();
    final sourceController = TextEditingController();
    final notesController = TextEditingController();
    String selectedStatus = 'new';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => Padding(
          padding: EdgeInsets.fromLTRB(
            16, 16, 16, MediaQuery.of(ctx).viewInsets.bottom + 16,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'New Lead',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 18,
                    color: Theme.of(context).primaryColor,
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(
                    labelText: 'Name *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.person),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: companyController,
                  decoration: const InputDecoration(
                    labelText: 'Company',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.business),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: phoneController,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: 'Phone',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.phone),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: emailController,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'Email',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.email),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: valueController,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Deal Value (₹)',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.currency_rupee),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: sourceController,
                        decoration: const InputDecoration(
                          labelText: 'Source',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.source),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: selectedStatus,
                  decoration: const InputDecoration(
                    labelText: 'Status',
                    border: OutlineInputBorder(),
                  ),
                  items: _statuses.where((s) => s != 'all').map((s) =>
                    DropdownMenuItem(value: s, child: Text(s[0].toUpperCase() + s.substring(1))),
                  ).toList(),
                  onChanged: (val) => setModalState(() => selectedStatus = val ?? 'new'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: notesController,
                  decoration: const InputDecoration(
                    labelText: 'Notes',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.notes),
                  ),
                  maxLines: 2,
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () async {
                      if (nameController.text.isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Name is required'), backgroundColor: Colors.red),
                        );
                        return;
                      }
                      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
                      final lead = LeadData(
                        name: nameController.text.trim(),
                        company: companyController.text.trim(),
                        phone: phoneController.text.trim(),
                        email: emailController.text.trim(),
                        value: double.tryParse(valueController.text) ?? 0,
                        source: sourceController.text.trim(),
                        status: selectedStatus,
                        notes: notesController.text.trim(),
                      );

                      try {
                        await SupabaseConfig.client
                            .from('leads')
                            .insert(lead.toMap(clientId: clientId));
                        Navigator.pop(ctx);
                        _loadLeads();
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Lead created'), backgroundColor: Colors.green),
                        );
                      } catch (e) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Failed to create: $e'), backgroundColor: Colors.red),
                        );
                      }
                    },
                    child: const Text('Create Lead'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Leads'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadLeads,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // Pipeline summary
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: Row(
                    children: [
                      _buildSummaryCard('Total Leads', _totalCount.toString(), Icons.people, Colors.blue),
                      const SizedBox(width: 8),
                      _buildSummaryCard('Total Value', '₹${_totalValue.toStringAsFixed(0)}', Icons.account_balance_wallet, Colors.green),
                      const SizedBox(width: 8),
                      _buildSummaryCard('Conversion', '${_conversionRate.toStringAsFixed(0)}%', Icons.trending_up, Colors.purple),
                    ],
                  ),
                ).animate().fade().slideY(begin: -0.1),

                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: TextField(
                    decoration: const InputDecoration(
                      hintText: 'Search leads...',
                      prefixIcon: Icon(Icons.search, size: 20),
                    ),
                    onChanged: (val) => setState(() => _searchQuery = val),
                  ),
                ).animate().fade(delay: 100.ms),

                SizedBox(
                  height: 48,
                  child: ListView.builder(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    itemCount: _statuses.length,
                    itemBuilder: (context, index) {
                      final status = _statuses[index];
                      final isSelected = _selectedStatus == status;
                      final label = status == 'all' ? 'All' : status[0].toUpperCase() + status.substring(1);
                      final color = status == 'all' ? Colors.grey : _statusColors[status] ?? Colors.grey;
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(label),
                          selected: isSelected,
                          selectedColor: color,
                          labelStyle: TextStyle(
                            color: isSelected ? Colors.white : Colors.grey.shade700,
                            fontSize: 13,
                          ),
                          onSelected: (_) => setState(() => _selectedStatus = status),
                        ),
                      );
                    },
                  ),
                ),

                Expanded(
                  child: _filteredLeads.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.people_outline, size: 60, color: Colors.grey.shade400),
                              const SizedBox(height: 16),
                              Text('No leads found', style: TextStyle(color: Colors.grey.shade500, fontSize: 18)),
                            ],
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: _loadLeads,
                          child: ListView.builder(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            itemCount: _filteredLeads.length,
                            itemBuilder: (context, index) => _buildLeadCard(_filteredLeads[index]),
                          ),
                        ),
                ),
              ],
            ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showCreateSheet,
        child: const Icon(Icons.add),
      ),
    );
  }

  Widget _buildSummaryCard(String label, String value, IconData icon, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(height: 6),
            Text(value, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: color)),
            Text(label, style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
          ],
        ),
      ),
    );
  }

  Widget _buildLeadCard(LeadData lead) {
    final color = _statusColors[lead.status] ?? Colors.grey;
    final icon = _statusIcons[lead.status] ?? Icons.circle;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        leading: CircleAvatar(
          backgroundColor: color.withValues(alpha: 0.1),
          child: Icon(icon, color: color, size: 20),
        ),
        title: Row(
          children: [
            Expanded(
              child: Text(
                lead.name,
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                lead.status.toUpperCase(),
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: color),
              ),
            ),
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            if (lead.company.isNotEmpty)
              Text(
                lead.company,
                style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
              ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                if (lead.phone.isNotEmpty)
                  Text(
                    lead.phone,
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                  ),
                if (lead.value > 0)
                  Text(
                    '₹${lead.value.toStringAsFixed(0)}',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.grey.shade800),
                  ),
                Text(
                  _timeAgo(lead.lastActivity),
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                ),
              ],
            ),
          ],
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (context) => LeadDetailScreen(lead: lead)),
          ).then((_) => _loadLeads());
        },
      ),
    ).animate().fade(delay: Duration(milliseconds: 30 * _filteredLeads.indexOf(lead))).slideX(begin: 0.05);
  }

  String _timeAgo(DateTime dateTime) {
    final diff = DateTime.now().difference(dateTime);
    if (diff.inDays > 30) return DateFormat('dd MMM').format(dateTime);
    if (diff.inDays > 0) return '${diff.inDays}d ago';
    if (diff.inHours > 0) return '${diff.inHours}h ago';
    if (diff.inMinutes > 0) return '${diff.inMinutes}m ago';
    return 'Just now';
  }
}
