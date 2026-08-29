import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';
import 'supabase_config.dart';

class DispatchData {
  String? id;
  String orderId = '';
  String orderNo = '';
  String customerName = '';
  String vehicleNumber = '';
  String driverName = '';
  String driverPhone = '';
  String status = 'ready';
  DateTime? dispatchedAt;
  DateTime? deliveredAt;
  DateTime createdAt;

  DispatchData({
    this.id,
    this.orderId = '',
    this.orderNo = '',
    this.customerName = '',
    this.vehicleNumber = '',
    this.driverName = '',
    this.driverPhone = '',
    this.status = 'ready',
    this.dispatchedAt,
    this.deliveredAt,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  Map<String, dynamic> toMap({String? clientId}) => {
    if (id != null) 'id': id,
    'order_id': orderId,
    'order_no': orderNo,
    'customer_name': customerName,
    'vehicle_number': vehicleNumber,
    'driver_name': driverName,
    'driver_phone': driverPhone,
    'status': status,
    'dispatched_at': dispatchedAt?.toIso8601String(),
    'delivered_at': deliveredAt?.toIso8601String(),
    if (clientId != null && clientId.isNotEmpty) 'client_id': clientId,
  };

  static DispatchData fromMap(Map<String, dynamic> map) {
    return DispatchData(
      id: map['id'] as String?,
      orderId: (map['order_id'] ?? '') as String,
      orderNo: (map['order_no'] ?? '') as String,
      customerName: (map['customer_name'] ?? '') as String,
      vehicleNumber: (map['vehicle_number'] ?? '') as String,
      driverName: (map['driver_name'] ?? '') as String,
      driverPhone: (map['driver_phone'] ?? '') as String,
      status: (map['status'] ?? 'ready') as String,
      dispatchedAt: map['dispatched_at'] != null
          ? DateTime.tryParse(map['dispatched_at'].toString())
          : null,
      deliveredAt: map['delivered_at'] != null
          ? DateTime.tryParse(map['delivered_at'].toString())
          : null,
      createdAt: map['created_at'] != null
          ? DateTime.tryParse(map['created_at'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

class DispatchScreen extends StatefulWidget {
  const DispatchScreen({super.key});

  @override
  State<DispatchScreen> createState() => _DispatchScreenState();
}

class _DispatchScreenState extends State<DispatchScreen> {
  List<DispatchData> _dispatches = [];
  bool _isLoading = true;
  String _selectedStatus = 'all';

  static const Map<String, Color> _statusColors = {
    'ready': Colors.blue,
    'dispatched': Colors.orange,
    'in_transit': Colors.purple,
    'delivered': Colors.green,
  };

  static const Map<String, IconData> _statusIcons = {
    'ready': Icons.inventory,
    'dispatched': Icons.local_shipping,
    'in_transit': Icons.route,
    'delivered': Icons.check_circle,
  };

  @override
  void initState() {
    super.initState();
    _loadDispatches();
  }

  Future<void> _loadDispatches() async {
    setState(() => _isLoading = true);
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final response = await SupabaseConfig.client
          .from('dispatches')
          .select()
          .eq('client_id', clientId)
          .order('created_at', ascending: false);

      if (mounted) {
        setState(() {
          _dispatches = (response as List).map((e) => DispatchData.fromMap(e)).toList();
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load dispatches: $e')),
        );
      }
    }
  }

  List<DispatchData> get _filteredDispatches {
    if (_selectedStatus == 'all') return _dispatches;
    return _dispatches.where((d) => d.status == _selectedStatus).toList();
  }

  int get _readyCount => _dispatches.where((d) => d.status == 'ready').length;
  int get _inTransitCount => _dispatches.where((d) => d.status == 'in_transit').length;

  void _showCreateDispatchSheet() {
    final vehicleController = TextEditingController();
    final driverNameController = TextEditingController();
    final driverPhoneController = TextEditingController();
    String selectedOrderId = '';
    String selectedOrderNo = '';
    String selectedCustomer = '';
    List<Map<String, dynamic>> availableOrders = [];

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) {
          // Load available orders
          if (availableOrders.isEmpty) {
            WidgetsBinding.instance.addPostFrameCallback((_) async {
              try {
                final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
                final response = await SupabaseConfig.client
                    .from('orders')
                    .select('id, order_no, customer_name')
                    .eq('client_id', clientId)
                    .eq('status', 'production');
                if (ctx.mounted) {
                  setModalState(() {
                    availableOrders = (response as List).cast<Map<String, dynamic>>();
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
                    'Create Dispatch',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 18,
                      color: Theme.of(context).primaryColor,
                    ),
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    initialValue: selectedOrderId.isNotEmpty ? selectedOrderId : null,
                    decoration: const InputDecoration(
                      labelText: 'Select Order *',
                      border: OutlineInputBorder(),
                    ),
                    items: availableOrders.map((o) => DropdownMenuItem(
                      value: o['id'] as String,
                      child: Text('${o['order_no']} - ${o['customer_name']}', overflow: TextOverflow.ellipsis),
                    )).toList(),
                    onChanged: (val) {
                      final order = availableOrders.firstWhere((o) => o['id'] == val, orElse: () => {});
                      setModalState(() {
                        selectedOrderId = val ?? '';
                        selectedOrderNo = (order['order_no'] ?? '') as String;
                        selectedCustomer = (order['customer_name'] ?? '') as String;
                      });
                    },
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: vehicleController,
                    decoration: const InputDecoration(
                      labelText: 'Vehicle Number *',
                      border: OutlineInputBorder(),
                    ),
                    textCapitalization: TextCapitalization.characters,
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: driverNameController,
                    decoration: const InputDecoration(
                      labelText: 'Driver Name *',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: driverPhoneController,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: 'Driver Phone *',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () async {
                        if (selectedOrderId.isEmpty ||
                            vehicleController.text.isEmpty ||
                            driverNameController.text.isEmpty ||
                            driverPhoneController.text.isEmpty) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('All fields are required'), backgroundColor: Colors.red),
                          );
                          return;
                        }

                        final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
                        final dispatch = DispatchData(
                          orderId: selectedOrderId,
                          orderNo: selectedOrderNo,
                          customerName: selectedCustomer,
                          vehicleNumber: vehicleController.text.trim().toUpperCase(),
                          driverName: driverNameController.text.trim(),
                          driverPhone: driverPhoneController.text.trim(),
                          status: 'dispatched',
                          dispatchedAt: DateTime.now(),
                        );

                        try {
                          await SupabaseConfig.client
                              .from('dispatches')
                              .insert(dispatch.toMap(clientId: clientId));

                          // Update order status
                          await SupabaseConfig.client
                              .from('orders')
                              .update({'status': 'dispatched'})
                              .eq('id', selectedOrderId)
                              .eq('client_id', clientId);

                          if (ctx.mounted) {
                            Navigator.pop(ctx);
                          }
                          if (mounted) {
                            _loadDispatches();
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Dispatch created'), backgroundColor: Colors.green),
                            );
                          }
                        } catch (e) {
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('Failed to create dispatch: $e'), backgroundColor: Colors.red),
                            );
                          }
                        }
                      },
                      child: const Text('Create Dispatch'),
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

  void _showUpdateStatusSheet(DispatchData dispatch) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
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
                'Update ${dispatch.orderNo}',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
            ),
            const SizedBox(height: 8),
            if (dispatch.status == 'dispatched')
              ListTile(
                leading: const Icon(Icons.route, color: Colors.purple),
                title: const Text('Mark as In Transit'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  Navigator.pop(ctx);
                  _updateDispatchStatus(dispatch, 'in_transit');
                },
              ),
            if (dispatch.status == 'in_transit')
              ListTile(
                leading: const Icon(Icons.check_circle, color: Colors.green),
                title: const Text('Mark as Delivered'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  Navigator.pop(ctx);
                  _updateDispatchStatus(dispatch, 'delivered');
                },
            ),
            if (dispatch.status != 'delivered')
              ListTile(
                leading: const Icon(Icons.camera_alt, color: Colors.blue),
                title: const Text('Upload Delivery Proof'),
                subtitle: const Text('Photo placeholder'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Photo upload coming soon')),
                  );
                },
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Future<void> _updateDispatchStatus(DispatchData dispatch, String newStatus) async {
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final updates = {'status': newStatus};
      if (newStatus == 'delivered') {
        updates['delivered_at'] = DateTime.now().toIso8601String();
      }

      await SupabaseConfig.client
          .from('dispatches')
          .update(updates)
          .eq('id', dispatch.id!)
          .eq('client_id', clientId);

      // If delivered, update order status too
      if (newStatus == 'delivered') {
        await SupabaseConfig.client
            .from('orders')
            .update({'status': 'installed'})
            .eq('id', dispatch.orderId)
            .eq('client_id', clientId);
      }

      _loadDispatches();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Dispatch updated to ${newStatus.replaceAll('_', ' ')}'), backgroundColor: Colors.green),
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Dispatch'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadDispatches,
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
                      _buildSummaryCard('Ready', _readyCount.toString(), Icons.inventory, Colors.blue),
                      const SizedBox(width: 8),
                      _buildSummaryCard('In Transit', _inTransitCount.toString(), Icons.route, Colors.purple),
                      const SizedBox(width: 8),
                      _buildSummaryCard('Delivered',
                          _dispatches.where((d) => d.status == 'delivered').length.toString(),
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
                      _buildStatusChip('dispatched', 'Dispatched', Colors.orange),
                      _buildStatusChip('in_transit', 'In Transit', Colors.purple),
                      _buildStatusChip('delivered', 'Delivered', Colors.green),
                    ],
                  ),
                ),

                Expanded(
                  child: _filteredDispatches.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.local_shipping_outlined, size: 60, color: Colors.grey.shade400),
                              const SizedBox(height: 16),
                              Text('No dispatches found', style: TextStyle(color: Colors.grey.shade500, fontSize: 18)),
                            ],
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: _loadDispatches,
                          child: ListView.builder(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            itemCount: _filteredDispatches.length,
                            itemBuilder: (context, index) => _buildDispatchCard(_filteredDispatches[index]),
                          ),
                        ),
                ),
              ],
            ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showCreateDispatchSheet,
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

  Widget _buildDispatchCard(DispatchData dispatch) {
    final color = _statusColors[dispatch.status] ?? Colors.grey;
    final icon = _statusIcons[dispatch.status] ?? Icons.circle;

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
                dispatch.orderNo,
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                dispatch.status.toUpperCase().replaceAll('_', ' '),
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: color),
              ),
            ),
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            Text(dispatch.customerName, style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
            Row(
              children: [
                Icon(Icons.directions_car, size: 14, color: Colors.grey.shade500),
                const SizedBox(width: 4),
                Text(
                  dispatch.vehicleNumber,
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600, fontWeight: FontWeight.w500),
                ),
                const SizedBox(width: 12),
                Icon(Icons.person, size: 14, color: Colors.grey.shade500),
                const SizedBox(width: 4),
                Text(
                  dispatch.driverName,
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                ),
              ],
            ),
            if (dispatch.dispatchedAt != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  'Dispatched: ${DateFormat('dd MMM, HH:mm').format(dispatch.dispatchedAt!)}',
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                ),
              ),
          ],
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => _showUpdateStatusSheet(dispatch),
      ),
    ).animate().fade(delay: Duration(milliseconds: 30 * _filteredDispatches.indexOf(dispatch))).slideX(begin: 0.05);
  }
}
