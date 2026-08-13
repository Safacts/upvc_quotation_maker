import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';
import 'supabase_config.dart';

class InstallationData {
  String? id;
  String orderId = '';
  String orderNo = '';
  String customerName = '';
  String contactNo = '';
  String address = '';
  DateTime scheduledDate;
  int teamSize = 2;
  String status = 'scheduled';
  List<String> qcChecklist = [];
  List<String> qcChecked = [];
  DateTime createdAt;

  InstallationData({
    this.id,
    this.orderId = '',
    this.orderNo = '',
    this.customerName = '',
    this.contactNo = '',
    this.address = '',
    DateTime? scheduledDate,
    this.teamSize = 2,
    this.status = 'scheduled',
    this.qcChecklist = const [],
    this.qcChecked = const [],
    DateTime? createdAt,
  }) : scheduledDate = scheduledDate ?? DateTime.now(),
       createdAt = createdAt ?? DateTime.now();

  int get qcCompleted => qcChecked.length;
  int get qcTotal => qcChecklist.length;

  Map<String, dynamic> toMap({String? clientId}) => {
    if (id != null) 'id': id,
    'order_id': orderId,
    'order_no': orderNo,
    'customer_name': customerName,
    'contact_no': contactNo,
    'address': address,
    'scheduled_date': scheduledDate.toIso8601String(),
    'team_size': teamSize,
    'status': status,
    'qc_checklist': qcChecklist,
    'qc_checked': qcChecked,
    if (clientId != null && clientId.isNotEmpty) 'client_id': clientId,
  };

  static InstallationData fromMap(Map<String, dynamic> map) {
    return InstallationData(
      id: map['id'] as String?,
      orderId: (map['order_id'] ?? '') as String,
      orderNo: (map['order_no'] ?? '') as String,
      customerName: (map['customer_name'] ?? '') as String,
      contactNo: (map['contact_no'] ?? '') as String,
      address: (map['address'] ?? '') as String,
      scheduledDate: map['scheduled_date'] != null
          ? DateTime.tryParse(map['scheduled_date'].toString()) ?? DateTime.now()
          : DateTime.now(),
      teamSize: (map['team_size'] as num?)?.toInt() ?? 2,
      status: (map['status'] ?? 'scheduled') as String,
      qcChecklist: (map['qc_checklist'] as List?)?.cast<String>() ?? [],
      qcChecked: (map['qc_checked'] as List?)?.cast<String>() ?? [],
      createdAt: map['created_at'] != null
          ? DateTime.tryParse(map['created_at'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

class InstallationScreen extends StatefulWidget {
  const InstallationScreen({super.key});

  @override
  State<InstallationScreen> createState() => _InstallationScreenState();
}

class _InstallationScreenState extends State<InstallationScreen> {
  List<InstallationData> _installations = [];
  bool _isLoading = true;
  String _selectedStatus = 'all';

  static const Map<String, Color> _statusColors = {
    'scheduled': Colors.blue,
    'in_progress': Colors.orange,
    'completed': Colors.green,
  };

  static const Map<String, IconData> _statusIcons = {
    'scheduled': Icons.calendar_today,
    'in_progress': Icons.engineering,
    'completed': Icons.check_circle,
  };

  static const List<String> _defaultQcChecklist = [
    'Frame level and plumb',
    'Sashes operate smoothly',
    'Locks engage properly',
    'Seals intact, no gaps',
    'Drainage holes clear',
    'Glass properly seated',
    'Hardware aligned',
    'Clean and debris-free',
  ];

  @override
  void initState() {
    super.initState();
    _loadInstallations();
  }

  Future<void> _loadInstallations() async {
    setState(() => _isLoading = true);
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final response = await SupabaseConfig.client
          .from('installations')
          .select()
          .eq('client_id', clientId)
          .order('scheduled_date', ascending: true);

      if (mounted) {
        setState(() {
          _installations = (response as List).map((e) => InstallationData.fromMap(e)).toList();
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load installations: $e')),
        );
      }
    }
  }

  List<InstallationData> get _filteredInstallations {
    if (_selectedStatus == 'all') return _installations;
    return _installations.where((i) => i.status == _selectedStatus).toList();
  }

  int get _scheduledCount => _installations.where((i) => i.status == 'scheduled').length;
  int get _inProgressCount => _installations.where((i) => i.status == 'in_progress').length;

  void _showCreateInstallationSheet() {
    final addressController = TextEditingController();
    final teamSizeController = TextEditingController(text: '2');
    DateTime selectedDate = DateTime.now().add(const Duration(days: 1));
    String selectedOrderId = '';
    String selectedOrderNo = '';
    String selectedCustomer = '';
    String selectedContact = '';
    List<Map<String, dynamic>> _availableOrders = [];

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) {
          if (_availableOrders.isEmpty) {
            WidgetsBinding.instance.addPostFrameCallback((_) async {
              try {
                final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
                final response = await SupabaseConfig.client
                    .from('orders')
                    .select('id, order_no, customer_name, contact_no, address')
                    .eq('client_id', clientId)
                    .eq('status', 'dispatched');
                if (ctx.mounted) {
                  setModalState(() {
                    _availableOrders = (response as List).cast<Map<String, dynamic>>();
                  });
                }
              } catch (_) {}
            });
          }

          return Padding(
            padding: EdgeInsets.fromLTRB(
              16, 16, 16, MediaQuery.of(ctx).viewInsets.bottom + 16,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Schedule Installation',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 18,
                      color: Theme.of(context).primaryColor,
                    ),
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    value: selectedOrderId.isNotEmpty ? selectedOrderId : null,
                    decoration: const InputDecoration(
                      labelText: 'Select Order *',
                      border: OutlineInputBorder(),
                    ),
                    items: _availableOrders.map((o) => DropdownMenuItem(
                      value: o['id'] as String,
                      child: Text('${o['order_no']} - ${o['customer_name']}', overflow: TextOverflow.ellipsis),
                    )).toList(),
                    onChanged: (val) {
                      final order = _availableOrders.firstWhere((o) => o['id'] == val, orElse: () => {});
                      setModalState(() {
                        selectedOrderId = val ?? '';
                        selectedOrderNo = (order['order_no'] ?? '') as String;
                        selectedCustomer = (order['customer_name'] ?? '') as String;
                        selectedContact = (order['contact_no'] ?? '') as String;
                        addressController.text = (order['address'] ?? '') as String;
                      });
                    },
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: addressController,
                    decoration: const InputDecoration(
                      labelText: 'Installation Address',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: TextEditingController(
                      text: DateFormat('dd-MMM-yyyy').format(selectedDate),
                    ),
                    readOnly: true,
                    decoration: const InputDecoration(
                      labelText: 'Scheduled Date *',
                      border: OutlineInputBorder(),
                      suffixIcon: Icon(Icons.calendar_today),
                    ),
                    onTap: () async {
                      final picked = await showDatePicker(
                        context: ctx,
                        initialDate: selectedDate,
                        firstDate: DateTime.now(),
                        lastDate: DateTime.now().add(const Duration(days: 90)),
                      );
                      if (picked != null) {
                        selectedDate = picked;
                        setModalState(() {});
                      }
                    },
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: teamSizeController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Team Size',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () async {
                        if (selectedOrderId.isEmpty) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Select an order'), backgroundColor: Colors.red),
                          );
                          return;
                        }

                        final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
                        final installation = InstallationData(
                          orderId: selectedOrderId,
                          orderNo: selectedOrderNo,
                          customerName: selectedCustomer,
                          contactNo: selectedContact,
                          address: addressController.text.trim(),
                          scheduledDate: selectedDate,
                          teamSize: int.tryParse(teamSizeController.text) ?? 2,
                          status: 'scheduled',
                          qcChecklist: List.from(_defaultQcChecklist),
                          qcChecked: [],
                        );

                        try {
                          await SupabaseConfig.client
                              .from('installations')
                              .insert(installation.toMap(clientId: clientId));

                          // Update order status
                          await SupabaseConfig.client
                              .from('orders')
                              .update({'status': 'installed'})
                              .eq('id', selectedOrderId)
                              .eq('client_id', clientId);

                          Navigator.pop(ctx);
                          _loadInstallations();
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Installation scheduled'), backgroundColor: Colors.green),
                            );
                          }
                        } catch (e) {
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('Failed to schedule: $e'), backgroundColor: Colors.red),
                            );
                          }
                        }
                      },
                      child: const Text('Schedule Installation'),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  void _showInstallationDetail(InstallationData installation) {
    bool isExpanded = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => DraggableScrollableSheet(
          initialChildSize: 0.7,
          minChildSize: 0.4,
          maxChildSize: 0.95,
          expand: false,
          builder: (ctx, scrollController) => Padding(
            padding: const EdgeInsets.all(16),
            child: ListView(
              controller: scrollController,
              children: [
                Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      installation.orderNo,
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: (_statusColors[installation.status] ?? Colors.grey).withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        installation.status.toUpperCase().replaceAll('_', ' '),
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: _statusColors[installation.status] ?? Colors.grey,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(installation.customerName, style: TextStyle(fontSize: 16, color: Colors.grey.shade700)),
                const Divider(height: 24),

                // Details
                _buildDetailRow(Icons.calendar_today, 'Date',
                    DateFormat('dd-MMM-yyyy').format(installation.scheduledDate)),
                const SizedBox(height: 8),
                _buildDetailRow(Icons.people, 'Team Size', '${installation.teamSize} members'),
                const SizedBox(height: 8),
                _buildDetailRow(Icons.phone, 'Contact', installation.contactNo.isNotEmpty ? installation.contactNo : 'N/A'),
                const SizedBox(height: 8),
                _buildDetailRow(Icons.location_on, 'Address',
                    installation.address.isNotEmpty ? installation.address : 'N/A'),

                const SizedBox(height: 16),

                // Status Update
                if (installation.status != 'completed')
                  Row(
                    children: [
                      if (installation.status == 'scheduled')
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: () async {
                              await _updateInstallationStatus(installation, 'in_progress');
                              Navigator.pop(ctx);
                            },
                            icon: const Icon(Icons.play_arrow),
                            label: const Text('Start Installation'),
                            style: ElevatedButton.styleFrom(backgroundColor: Colors.orange),
                          ),
                        ),
                      if (installation.status == 'in_progress') ...[
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: () async {
                              await _updateInstallationStatus(installation, 'completed');
                              Navigator.pop(ctx);
                            },
                            icon: const Icon(Icons.check_circle),
                            label: const Text('Mark Completed'),
                            style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
                          ),
                        ),
                      ],
                    ],
                  ),

                // QC Checklist
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'QC Checklist',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: Theme.of(context).primaryColor),
                    ),
                    Text(
                      '${installation.qcCompleted}/${installation.qcTotal}',
                      style: TextStyle(color: Colors.grey.shade500),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                ...installation.qcChecklist.map((item) {
                  final isChecked = installation.qcChecked.contains(item);
                  return CheckboxListTile(
                    value: isChecked,
                    title: Text(
                      item,
                      style: TextStyle(
                        fontSize: 14,
                        decoration: isChecked ? TextDecoration.lineThrough : null,
                        color: isChecked ? Colors.grey.shade500 : null,
                      ),
                    ),
                    onChanged: (val) async {
                      final updatedChecked = List<String>.from(installation.qcChecked);
                      if (val == true) {
                        updatedChecked.add(item);
                      } else {
                        updatedChecked.remove(item);
                      }
                      setState(() => installation.qcChecked = updatedChecked);
                      setModalState(() {});

                      try {
                        final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
                        await SupabaseConfig.client
                            .from('installations')
                            .update({'qc_checked': updatedChecked})
                            .eq('id', installation.id!)
                            .eq('client_id', clientId);
                      } catch (_) {}
                    },
                    controlAffinity: ListTileControlAffinity.leading,
                    contentPadding: EdgeInsets.zero,
                  );
                }),

                const SizedBox(height: 16),

                // Customer Sign-off placeholder
                Card(
                  color: Colors.grey.shade50,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        Icon(Icons.draw, size: 40, color: Colors.grey.shade400),
                        const SizedBox(height: 8),
                        Text(
                          'Customer Sign-off',
                          style: TextStyle(fontWeight: FontWeight.bold, color: Colors.grey.shade600),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Signature capture coming soon',
                          style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _updateInstallationStatus(InstallationData installation, String newStatus) async {
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      await SupabaseConfig.client
          .from('installations')
          .update({'status': newStatus})
          .eq('id', installation.id!)
          .eq('client_id', clientId);

      // If completed, update order status
      if (newStatus == 'completed') {
        await SupabaseConfig.client
            .from('orders')
            .update({'status': 'completed'})
            .eq('id', installation.orderId)
            .eq('client_id', clientId);
      }

      _loadInstallations();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Installation ${newStatus.replaceAll('_', ' ')}'), backgroundColor: Colors.green),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  Widget _buildDetailRow(IconData icon, String label, String value) {
    return Row(
      children: [
        Icon(icon, size: 16, color: Colors.grey.shade500),
        const SizedBox(width: 8),
        Text('$label: ', style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Installations'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadInstallations,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: Row(
                    children: [
                      _buildSummaryCard('Scheduled', _scheduledCount.toString(), Icons.calendar_today, Colors.blue),
                      const SizedBox(width: 8),
                      _buildSummaryCard('In Progress', _inProgressCount.toString(), Icons.engineering, Colors.orange),
                      const SizedBox(width: 8),
                      _buildSummaryCard('Completed',
                          _installations.where((i) => i.status == 'completed').length.toString(),
                          Icons.check_circle, Colors.green),
                    ],
                  ),
                ).animate().fade().slideY(begin: -0.1),

                SizedBox(
                  height: 48,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    children: [
                      _buildStatusChip('all', 'All', Colors.grey),
                      _buildStatusChip('scheduled', 'Scheduled', Colors.blue),
                      _buildStatusChip('in_progress', 'In Progress', Colors.orange),
                      _buildStatusChip('completed', 'Completed', Colors.green),
                    ],
                  ),
                ),

                Expanded(
                  child: _filteredInstallations.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.home_repair_service_outlined, size: 60, color: Colors.grey.shade400),
                              const SizedBox(height: 16),
                              Text('No installations found', style: TextStyle(color: Colors.grey.shade500, fontSize: 18)),
                            ],
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: _loadInstallations,
                          child: ListView.builder(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            itemCount: _filteredInstallations.length,
                            itemBuilder: (context, index) => _buildInstallationCard(_filteredInstallations[index]),
                          ),
                        ),
                ),
              ],
            ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showCreateInstallationSheet,
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

  Widget _buildStatusChip(String status, String label, Color color) {
    final isSelected = _selectedStatus == status;
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
  }

  Widget _buildInstallationCard(InstallationData installation) {
    final color = _statusColors[installation.status] ?? Colors.grey;
    final icon = _statusIcons[installation.status] ?? Icons.circle;
    final isToday = DateUtils.isSameDay(installation.scheduledDate, DateTime.now());
    final isPast = installation.scheduledDate.isBefore(DateTime.now()) && !isToday;
    final checkedCount = installation.qcChecklist.length;
    final totalQc = installation.qcChecklist.length;

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
                installation.orderNo,
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
              ),
            ),
            if (isToday)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.red.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text('TODAY', style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Colors.red)),
              ),
            Container(
              margin: const EdgeInsets.only(left: 4),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                installation.status.toUpperCase().replaceAll('_', ' '),
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: color),
              ),
            ),
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            Text(installation.customerName, style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
            Row(
              children: [
                Icon(Icons.calendar_today, size: 14, color: isPast ? Colors.red : Colors.grey.shade500),
                const SizedBox(width: 4),
                Text(
                  DateFormat('dd MMM yyyy').format(installation.scheduledDate),
                  style: TextStyle(
                    fontSize: 12,
                    color: isPast ? Colors.red : Colors.grey.shade600,
                    fontWeight: isPast ? FontWeight.bold : FontWeight.normal,
                  ),
                ),
                const SizedBox(width: 12),
                Icon(Icons.people, size: 14, color: Colors.grey.shade500),
                const SizedBox(width: 4),
                Text(
                  '${installation.teamSize} members',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                ),
              ],
            ),
          ],
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => _showInstallationDetail(installation),
      ),
    ).animate().fade(delay: Duration(milliseconds: 30 * _filteredInstallations.indexOf(installation))).slideX(begin: 0.05);
  }
}
