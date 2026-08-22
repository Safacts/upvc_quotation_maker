import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';
import 'supabase_config.dart';

class CuttingOrder {
  String? id;
  String orderId = '';
  String orderNo = '';
  String customerName = '';
  String profileType = '';
  double stockLength = 0;
  double wastagePercent = 0;
  int cutsCount = 0;
  String status = 'pending';
  String notes = '';
  DateTime createdAt;

  CuttingOrder({
    this.id,
    this.orderId = '',
    this.orderNo = '',
    this.customerName = '',
    this.profileType = '',
    this.stockLength = 0,
    this.wastagePercent = 0,
    this.cutsCount = 0,
    this.status = 'pending',
    this.notes = '',
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  Map<String, dynamic> toMap({String? clientId}) => {
    if (id != null) 'id': id,
    'order_id': orderId,
    'order_no': orderNo,
    'customer_name': customerName,
    'profile_type': profileType,
    'stock_length': stockLength,
    'wastage_percent': wastagePercent,
    'cuts_count': cutsCount,
    'status': status,
    'notes': notes,
    if (clientId != null && clientId.isNotEmpty) 'client_id': clientId,
  };

  static CuttingOrder fromMap(Map<String, dynamic> map) {
    return CuttingOrder(
      id: map['id'] as String?,
      orderId: (map['order_id'] ?? '') as String,
      orderNo: (map['order_no'] ?? '') as String,
      customerName: (map['customer_name'] ?? '') as String,
      profileType: (map['profile_type'] ?? '') as String,
      stockLength: (map['stock_length'] as num?)?.toDouble() ?? 0,
      wastagePercent: (map['wastage_percent'] as num?)?.toDouble() ?? 0,
      cutsCount: (map['cuts_count'] as num?)?.toInt() ?? 0,
      status: (map['status'] ?? 'pending') as String,
      notes: (map['notes'] ?? '') as String,
      createdAt: map['created_at'] != null
          ? DateTime.tryParse(map['created_at'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

class CuttingScreen extends StatefulWidget {
  const CuttingScreen({super.key});

  @override
  State<CuttingScreen> createState() => _CuttingScreenState();
}

class _CuttingScreenState extends State<CuttingScreen> {
  List<CuttingOrder> _orders = [];
  bool _isLoading = true;
  String _searchQuery = '';
  String _selectedStatus = 'all';

  static const List<String> _statuses = [
    'all', 'pending', 'approved', 'cutting', 'completed',
  ];

  static const Map<String, Color> _statusColors = {
    'pending': Colors.orange,
    'approved': Colors.blue,
    'cutting': Colors.purple,
    'completed': Colors.green,
  };

  static const Map<String, IconData> _statusIcons = {
    'pending': Icons.schedule,
    'approved': Icons.check_circle_outline,
    'cutting': Icons.content_cut,
    'completed': Icons.task_alt,
  };

  @override
  void initState() {
    super.initState();
    _loadOrders();
  }

  Future<void> _loadOrders() async {
    setState(() => _isLoading = true);
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final response = await SupabaseConfig.client
          .from('cutting_orders')
          .select()
          .eq('client_id', clientId)
          .order('created_at', ascending: false);

      if (mounted) {
        setState(() {
          _orders = (response as List).map((e) => CuttingOrder.fromMap(e)).toList();
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load cutting orders: $e')),
        );
      }
    }
  }

  List<CuttingOrder> get _filteredOrders {
    return _orders.where((o) {
      final matchesSearch = _searchQuery.isEmpty ||
          o.orderNo.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          o.customerName.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          o.profileType.toLowerCase().contains(_searchQuery.toLowerCase());
      final matchesStatus = _selectedStatus == 'all' || o.status == _selectedStatus;
      return matchesSearch && matchesStatus;
    }).toList();
  }

  int get _totalCount => _orders.length;
  int get _pendingCount => _orders.where((o) => o.status == 'pending').length;
  double get _avgWastage {
    if (_orders.isEmpty) return 0;
    return _orders.fold(0.0, (sum, o) => sum + o.wastagePercent) / _orders.length;
  }

  Color _wastageColor(double percent) {
    if (percent > 10) return Colors.red;
    if (percent > 5) return Colors.orange;
    return Colors.green;
  }

  void _showCreateSheet() {
    final orderNoController = TextEditingController();
    final customerController = TextEditingController();
    final profileController = TextEditingController();
    final stockLengthController = TextEditingController();
    final wastageController = TextEditingController(text: '5');
    final cutsController = TextEditingController(text: '1');
    final notesController = TextEditingController();
    String selectedStatus = 'pending';

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
                  'New Cutting List',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 18,
                    color: Theme.of(context).primaryColor,
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: orderNoController,
                  decoration: const InputDecoration(
                    labelText: 'Order No *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.receipt_long),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: customerController,
                  decoration: const InputDecoration(
                    labelText: 'Customer Name *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.person),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: profileController,
                  decoration: const InputDecoration(
                    labelText: 'Profile Type (e.g. Sliding 60mm)',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.view_column),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: stockLengthController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Stock Length (mm) *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.straighten),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: wastageController,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Wastage %',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.delete_outline),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: cutsController,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Cuts Count',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.content_cut),
                        ),
                      ),
                    ),
                  ],
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
                  onChanged: (val) => setModalState(() => selectedStatus = val ?? 'pending'),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () async {
                      if (orderNoController.text.isEmpty || customerController.text.isEmpty || stockLengthController.text.isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Order no, customer, and stock length are required'), backgroundColor: Colors.red),
                        );
                        return;
                      }
                      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
                      final order = CuttingOrder(
                        orderNo: orderNoController.text.trim(),
                        customerName: customerController.text.trim(),
                        profileType: profileController.text.trim(),
                        stockLength: double.tryParse(stockLengthController.text) ?? 0,
                        wastagePercent: double.tryParse(wastageController.text) ?? 5,
                        cutsCount: int.tryParse(cutsController.text) ?? 1,
                        notes: notesController.text.trim(),
                        status: selectedStatus,
                      );

                      try {
                        await SupabaseConfig.client
                            .from('cutting_orders')
                            .insert(order.toMap(clientId: clientId));
                        Navigator.pop(ctx);
                        _loadOrders();
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Cutting list created'), backgroundColor: Colors.green),
                        );
                      } catch (e) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Failed to create: $e'), backgroundColor: Colors.red),
                        );
                      }
                    },
                    child: const Text('Create Cutting List'),
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
        title: const Text('Cutting'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadOrders,
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
                      _buildSummaryCard('Total', _totalCount.toString(), Icons.content_cut, Colors.blue),
                      const SizedBox(width: 8),
                      _buildSummaryCard('Pending', _pendingCount.toString(), Icons.schedule, Colors.orange),
                      const SizedBox(width: 8),
                      _buildSummaryCard('Avg Wastage', '${_avgWastage.toStringAsFixed(1)}%', Icons.delete_outline, _wastageColor(_avgWastage)),
                    ],
                  ),
                ).animate().fade().slideY(begin: -0.1),

                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: TextField(
                    decoration: const InputDecoration(
                      hintText: 'Search cutting orders...',
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
                  child: _filteredOrders.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.content_cut, size: 60, color: Colors.grey.shade400),
                              const SizedBox(height: 16),
                              Text('No cutting orders found', style: TextStyle(color: Colors.grey.shade500, fontSize: 18)),
                            ],
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: _loadOrders,
                          child: ListView.builder(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            itemCount: _filteredOrders.length,
                            itemBuilder: (context, index) => _buildOrderCard(_filteredOrders[index]),
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

  Widget _buildOrderCard(CuttingOrder order) {
    final color = _statusColor(order.status);
    final icon = _statusIcons[order.status] ?? Icons.circle;
    final wastageColor = _wastageColor(order.wastagePercent);

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
                order.orderNo,
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
                order.status.toUpperCase(),
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: color),
              ),
            ),
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            Text(
              order.customerName,
              style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
            ),
            const SizedBox(height: 2),
            Row(
              children: [
                if (order.profileType.isNotEmpty) ...[
                  Icon(Icons.view_column, size: 12, color: Colors.grey.shade500),
                  const SizedBox(width: 4),
                  Text(
                    order.profileType,
                    style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                  ),
                  const SizedBox(width: 12),
                ],
                Icon(Icons.straighten, size: 12, color: Colors.grey.shade500),
                const SizedBox(width: 4),
                Text(
                  '${order.stockLength.toStringAsFixed(0)} mm',
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                ),
                const SizedBox(width: 12),
                Icon(Icons.content_cut, size: 12, color: Colors.grey.shade500),
                const SizedBox(width: 4),
                Text(
                  '${order.cutsCount} cuts',
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                Icon(Icons.delete_outline, size: 12, color: wastageColor),
                const SizedBox(width: 4),
                Text(
                  'Wastage: ${order.wastagePercent.toStringAsFixed(1)}%',
                  style: TextStyle(fontSize: 11, color: wastageColor, fontWeight: FontWeight.w600),
                ),
                const Spacer(),
                Text(
                  DateFormat('dd MMM').format(order.createdAt),
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                ),
              ],
            ),
          ],
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => _showOrderDetail(order),
      ),
    ).animate().fade(delay: Duration(milliseconds: 30 * _filteredOrders.indexOf(order))).slideX(begin: 0.05);
  }

  Color _statusColor(String status) => _statusColors[status] ?? Colors.grey;

  void _showOrderDetail(CuttingOrder order) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.6,
        minChildSize: 0.3,
        maxChildSize: 0.9,
        expand: false,
        builder: (ctx, scrollController) => Padding(
          padding: const EdgeInsets.all(16),
          child: ListView(
            controller: scrollController,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Text(
                order.orderNo,
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 20,
                  color: Theme.of(context).primaryColor,
                ),
              ),
              const SizedBox(height: 4),
              Text(order.customerName, style: TextStyle(fontSize: 16, color: Colors.grey.shade700)),
              const SizedBox(height: 16),
              _detailRow('Profile Type', order.profileType.isNotEmpty ? order.profileType : 'Not specified'),
              _detailRow('Stock Length', '${order.stockLength.toStringAsFixed(0)} mm'),
              _detailRow('Cuts Count', '${order.cutsCount}'),
              _detailRow('Wastage', '${order.wastagePercent.toStringAsFixed(1)}%'),
              _detailRow('Status', order.status[0].toUpperCase() + order.status.substring(1)),
              if (order.notes.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text('Notes', style: TextStyle(fontWeight: FontWeight.w600, color: Colors.grey.shade600)),
                const SizedBox(height: 4),
                Text(order.notes, style: TextStyle(color: Colors.grey.shade700)),
              ],
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () {
                        Navigator.pop(ctx);
                        _showStatusUpdateSheet(order);
                      },
                      icon: const Icon(Icons.edit),
                      label: const Text('Update Status'),
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

  Widget _detailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: Colors.grey.shade600, fontSize: 14)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        ],
      ),
    );
  }

  void _showStatusUpdateSheet(CuttingOrder order) {
    String newStatus = order.status;
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  'Update ${order.orderNo}',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                ),
              ),
              const SizedBox(height: 16),
              ..._statuses.where((s) => s != 'all').map((status) {
                final color = _statusColors[status]!;
                final icon = _statusIcons[status]!;
                return RadioListTile<String>(
                  value: status,
                  groupValue: newStatus,
                  onChanged: (val) => setModalState(() => newStatus = val ?? status),
                  title: Row(
                    children: [
                      Icon(icon, color: color, size: 20),
                      const SizedBox(width: 8),
                      Text(status[0].toUpperCase() + status.substring(1)),
                    ],
                  ),
                  activeColor: color,
                );
              }),
              const SizedBox(height: 8),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: newStatus == order.status
                        ? null
                        : () async {
                            try {
                              final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
                              await SupabaseConfig.client
                                  .from('cutting_orders')
                                  .update({'status': newStatus})
                                  .eq('id', order.id!)
                                  .eq('client_id', clientId);
                              Navigator.pop(ctx);
                              _loadOrders();
                              if (mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text('Status updated to $newStatus'), backgroundColor: Colors.green),
                                );
                              }
                            } catch (e) {
                              if (mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text('Failed to update: $e'), backgroundColor: Colors.red),
                                );
                              }
                            }
                          },
                    child: const Text('Update'),
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }
}
