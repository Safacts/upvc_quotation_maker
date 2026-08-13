import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';
import 'supabase_config.dart';
import 'order_detail_screen.dart';

class OrderData {
  String? id;
  String orderNo = '';
  String quotationId = '';
  String customerName = '';
  String contactNo = '';
  String address = '';
  double totalAmount = 0;
  double amountPaid = 0;
  double balance = 0;
  String status = 'confirmed';
  DateTime? expectedDelivery;
  DateTime createdAt;

  OrderData({
    this.id,
    this.orderNo = '',
    this.quotationId = '',
    this.customerName = '',
    this.contactNo = '',
    this.address = '',
    this.totalAmount = 0,
    this.amountPaid = 0,
    this.balance = 0,
    this.status = 'confirmed',
    this.expectedDelivery,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  double get balanceDue => totalAmount - amountPaid;

  Map<String, dynamic> toMap({String? clientId}) => {
    if (id != null) 'id': id,
    'order_no': orderNo,
    'quotation_id': quotationId,
    'customer_name': customerName,
    'contact_no': contactNo,
    'address': address,
    'total_amount': totalAmount,
    'amount_paid': amountPaid,
    'status': status,
    'expected_delivery': expectedDelivery?.toIso8601String(),
    if (clientId != null && clientId.isNotEmpty) 'client_id': clientId,
  };

  static OrderData fromMap(Map<String, dynamic> map) {
    return OrderData(
      id: map['id'] as String?,
      orderNo: (map['order_no'] ?? '') as String,
      quotationId: (map['quotation_id'] ?? '') as String,
      customerName: (map['customer_name'] ?? '') as String,
      contactNo: (map['contact_no'] ?? '') as String,
      address: (map['address'] ?? '') as String,
      totalAmount: (map['total_amount'] as num?)?.toDouble() ?? 0,
      amountPaid: (map['amount_paid'] as num?)?.toDouble() ?? 0,
      status: (map['status'] ?? 'confirmed') as String,
      expectedDelivery: map['expected_delivery'] != null
          ? DateTime.tryParse(map['expected_delivery'].toString())
          : null,
      createdAt: map['created_at'] != null
          ? DateTime.tryParse(map['created_at'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

class OrderScreen extends StatefulWidget {
  const OrderScreen({super.key});

  @override
  State<OrderScreen> createState() => _OrderScreenState();
}

class _OrderScreenState extends State<OrderScreen> {
  List<OrderData> _orders = [];
  bool _isLoading = true;
  String _searchQuery = '';
  String _selectedStatus = 'all';

  static const List<String> _statuses = [
    'all', 'confirmed', 'production', 'dispatched', 'installed', 'completed',
  ];

  static const Map<String, Color> _statusColors = {
    'confirmed': Colors.blue,
    'production': Colors.orange,
    'dispatched': Colors.purple,
    'installed': Colors.teal,
    'completed': Colors.green,
  };

  static const Map<String, IconData> _statusIcons = {
    'confirmed': Icons.check_circle_outline,
    'production': Icons.factory,
    'dispatched': Icons.local_shipping,
    'installed': Icons.home_repair_service,
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
          .from('orders')
          .select()
          .eq('client_id', clientId)
          .order('created_at', ascending: false);

      if (mounted) {
        setState(() {
          _orders = (response as List).map((e) => OrderData.fromMap(e)).toList();
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load orders: $e')),
        );
      }
    }
  }

  List<OrderData> get _filteredOrders {
    return _orders.where((o) {
      final matchesSearch = _searchQuery.isEmpty ||
          o.orderNo.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          o.customerName.toLowerCase().contains(_searchQuery.toLowerCase());
      final matchesStatus = _selectedStatus == 'all' || o.status == _selectedStatus;
      return matchesSearch && matchesStatus;
    }).toList();
  }

  int get _totalCount => _orders.length;
  int get _productionCount => _orders.where((o) => o.status == 'production').length;
  double get _totalValue => _orders.fold(0.0, (sum, o) => sum + o.totalAmount);
  double get _totalBalance => _orders.fold(0.0, (sum, o) => sum + o.balanceDue);

  Color _statusColor(String status) => _statusColors[status] ?? Colors.grey;

  void _showCreateOrderSheet() {
    final customerController = TextEditingController();
    final contactController = TextEditingController();
    final addressController = TextEditingController();
    final amountController = TextEditingController();
    final deliveryController = TextEditingController();
    DateTime? selectedDelivery;
    String selectedStatus = 'confirmed';

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
                  'New Order',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 18,
                    color: Theme.of(context).primaryColor,
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: customerController,
                  decoration: const InputDecoration(
                    labelText: 'Customer Name *',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: contactController,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: 'Contact No',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: addressController,
                  decoration: const InputDecoration(
                    labelText: 'Delivery Address',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: amountController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Order Amount (₹) *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.currency_rupee),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: deliveryController,
                  readOnly: true,
                  decoration: const InputDecoration(
                    labelText: 'Expected Delivery',
                    border: OutlineInputBorder(),
                    suffixIcon: Icon(Icons.calendar_today),
                  ),
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: ctx,
                      initialDate: DateTime.now().add(const Duration(days: 7)),
                      firstDate: DateTime.now(),
                      lastDate: DateTime.now().add(const Duration(days: 365)),
                    );
                    if (picked != null) {
                      selectedDelivery = picked;
                      deliveryController.text = DateFormat('dd-MMM-yyyy').format(picked);
                    }
                  },
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: selectedStatus,
                  decoration: const InputDecoration(
                    labelText: 'Status',
                    border: OutlineInputBorder(),
                  ),
                  items: _statuses.where((s) => s != 'all').map((s) =>
                    DropdownMenuItem(value: s, child: Text(s[0].toUpperCase() + s.substring(1))),
                  ).toList(),
                  onChanged: (val) => setModalState(() => selectedStatus = val ?? 'confirmed'),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () async {
                      if (customerController.text.isEmpty || amountController.text.isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Customer name and amount are required'), backgroundColor: Colors.red),
                        );
                        return;
                      }
                      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
                      final amount = double.tryParse(amountController.text) ?? 0;
                      final order = OrderData(
                        orderNo: 'ORD-${DateFormat('yyyyMMdd').format(DateTime.now())}-${DateTime.now().millisecondsSinceEpoch % 10000}',
                        customerName: customerController.text.trim(),
                        contactNo: contactController.text.trim(),
                        address: addressController.text.trim(),
                        totalAmount: amount,
                        balance: amount,
                        status: selectedStatus,
                        expectedDelivery: selectedDelivery,
                      );

                      try {
                        await SupabaseConfig.client
                            .from('orders')
                            .insert(order.toMap(clientId: clientId));
                        Navigator.pop(ctx);
                        _loadOrders();
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Order created'), backgroundColor: Colors.green),
                        );
                      } catch (e) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Failed to create order: $e'), backgroundColor: Colors.red),
                        );
                      }
                    },
                    child: const Text('Create Order'),
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
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Orders'),
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
                      _buildSummaryCard('Total Orders', _totalCount.toString(), Icons.shopping_cart, Colors.blue),
                      const SizedBox(width: 8),
                      _buildSummaryCard('In Production', _productionCount.toString(), Icons.factory, Colors.orange),
                      const SizedBox(width: 8),
                      _buildSummaryCard('Balance Due', '₹${_totalBalance.toStringAsFixed(0)}', Icons.account_balance_wallet, Colors.red),
                    ],
                  ),
                ).animate().fade().slideY(begin: -0.1),

                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: TextField(
                    decoration: const InputDecoration(
                      hintText: 'Search orders...',
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
                              Icon(Icons.shopping_cart_outlined, size: 60, color: Colors.grey.shade400),
                              const SizedBox(height: 16),
                              Text('No orders found', style: TextStyle(color: Colors.grey.shade500, fontSize: 18)),
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
        onPressed: _showCreateOrderSheet,
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

  Widget _buildOrderCard(OrderData order) {
    final color = _statusColor(order.status);
    final icon = _statusIcons[order.status] ?? Icons.circle;

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
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '₹${order.totalAmount.toStringAsFixed(0)}',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.grey.shade800),
                ),
                Text(
                  'Bal: ₹${order.balanceDue.toStringAsFixed(0)}',
                  style: TextStyle(
                    fontSize: 12,
                    color: order.balanceDue > 0 ? Colors.red : Colors.green,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                if (order.expectedDelivery != null)
                  Text(
                    DateFormat('dd MMM').format(order.expectedDelivery!),
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                  ),
              ],
            ),
          ],
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (context) => OrderDetailScreen(order: order)),
          ).then((_) => _loadOrders());
        },
      ),
    ).animate().fade(delay: Duration(milliseconds: 30 * _filteredOrders.indexOf(order))).slideX(begin: 0.05);
  }
}
