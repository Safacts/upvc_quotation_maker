import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';
import 'supabase_config.dart';
import 'order_screen.dart';

class OrderDetailScreen extends StatefulWidget {
  final OrderData order;

  const OrderDetailScreen({super.key, required this.order});

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  late OrderData _order;
  List<Map<String, dynamic>> _items = [];
  List<Map<String, dynamic>> _timeline = [];
  bool _isLoading = true;

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
    _order = widget.order;
    _loadOrderDetails();
  }

  Future<void> _loadOrderDetails() async {
    setState(() => _isLoading = true);
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;

      // Load items
      final itemsRes = await SupabaseConfig.client
          .from('order_items')
          .select()
          .eq('order_id', _order.id ?? '')
          .eq('client_id', clientId);

      // Load timeline
      final timelineRes = await SupabaseConfig.client
          .from('order_timeline')
          .select()
          .eq('order_id', _order.id ?? '')
          .eq('client_id', clientId)
          .order('created_at', ascending: false);

      if (mounted) {
        setState(() {
          _items = (itemsRes as List).cast<Map<String, dynamic>>();
          _timeline = (timelineRes as List).cast<Map<String, dynamic>>();
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        debugPrint('Failed to load order details: $e');
      }
    }
  }

  Future<void> _updateOrderStatus(String newStatus) async {
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      await SupabaseConfig.client
          .from('orders')
          .update({'status': newStatus})
          .eq('id', _order.id!)
          .eq('client_id', clientId);

      // Add timeline entry
      await SupabaseConfig.client.from('order_timeline').insert({
        'order_id': _order.id,
        'status': newStatus,
        'note': 'Status changed to $newStatus',
        'client_id': clientId,
      });

      setState(() => _order.status = newStatus);
      _loadOrderDetails();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Order marked as ${newStatus.toUpperCase()}'), backgroundColor: Colors.green),
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

  void _showStatusUpdateDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Update Order Status'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_order.status == 'confirmed')
              _buildStatusOption(ctx, 'production', 'Mark as In Production'),
            if (_order.status == 'production')
              _buildStatusOption(ctx, 'dispatched', 'Mark as Dispatched'),
            if (_order.status == 'dispatched')
              _buildStatusOption(ctx, 'installed', 'Mark as Installed'),
            if (_order.status == 'installed')
              _buildStatusOption(ctx, 'completed', 'Mark as Completed'),
            if (_order.status != 'confirmed' && _order.status != 'production' &&
                _order.status != 'dispatched' && _order.status != 'installed')
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text('Order is already completed', style: TextStyle(color: Colors.grey)),
              ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        ],
      ),
    );
  }

  Widget _buildStatusOption(BuildContext ctx, String status, String label) {
    final color = _statusColors[status] ?? Colors.grey;
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: color.withValues(alpha: 0.1),
        child: Icon(_statusIcons[status], color: color, size: 20),
      ),
      title: Text(label),
      trailing: const Icon(Icons.chevron_right),
      onTap: () {
        Navigator.pop(ctx);
        _updateOrderStatus(status);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final statusColor = _statusColors[_order.status] ?? Colors.grey;

    return Scaffold(
      appBar: AppBar(
        title: Text(_order.orderNo),
        actions: [
          if (_order.status != 'completed')
            TextButton.icon(
              onPressed: _showStatusUpdateDialog,
              icon: const Icon(Icons.update, size: 18),
              label: const Text('Update Status'),
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Order Status Card
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _order.customerName,
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    _order.orderNo,
                                    style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                                  ),
                                ],
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                decoration: BoxDecoration(
                                  color: statusColor.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(20),
                                  border: Border.all(color: statusColor.withValues(alpha: 0.5)),
                                ),
                                child: Text(
                                  _order.status.toUpperCase(),
                                  style: TextStyle(fontWeight: FontWeight.bold, color: statusColor, fontSize: 12),
                                ),
                              ),
                            ],
                          ),
                          const Divider(height: 24),
                          _buildInfoRow(Icons.phone, 'Contact', _order.contactNo.isNotEmpty ? _order.contactNo : 'N/A'),
                          const SizedBox(height: 8),
                          _buildInfoRow(Icons.location_on, 'Address', _order.address.isNotEmpty ? _order.address : 'N/A'),
                          if (_order.expectedDelivery != null) ...[
                            const SizedBox(height: 8),
                            _buildInfoRow(Icons.calendar_today, 'Expected Delivery',
                                DateFormat('dd-MMM-yyyy').format(_order.expectedDelivery!)),
                          ],
                        ],
                      ),
                    ),
                  ).animate().fade().slideY(begin: -0.1),

                  // Amount Summary
                  const SizedBox(height: 12),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Payment Summary',
                            style: TextStyle(fontWeight: FontWeight.bold, color: theme.primaryColor, fontSize: 15),
                          ),
                          const SizedBox(height: 12),
                          _buildAmountRow('Order Amount', _order.totalAmount, isBold: true),
                          _buildAmountRow('Amount Paid', _order.amountPaid, color: Colors.green),
                          _buildAmountRow('Balance Due', _order.balanceDue, color: Colors.red, isBold: true),
                          const SizedBox(height: 12),
                          SizedBox(
                            width: double.infinity,
                            child: OutlinedButton.icon(
                              onPressed: _order.balanceDue > 0
                                  ? () {
                                      // Navigate to payment screen if linked quotation exists
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        const SnackBar(content: Text('Link a quotation to record payments')),
                                      );
                                    }
                                  : null,
                              icon: const Icon(Icons.payment, size: 18),
                              label: Text(_order.balanceDue > 0 ? 'Record Payment' : 'Fully Paid'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ).animate().fade(delay: 100.ms),

                  // Items
                  if (_items.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(
                      'Order Items',
                      style: TextStyle(fontWeight: FontWeight.bold, color: theme.primaryColor, fontSize: 15),
                    ),
                    const SizedBox(height: 8),
                    ...(_items).map((item) => Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        title: Text(
                          item['description'] ?? '',
                          style: const TextStyle(fontWeight: FontWeight.w500),
                        ),
                        subtitle: Text(
                          'Qty: ${item['quantity'] ?? 0} × ₹${(item['rate'] ?? 0).toDouble().toStringAsFixed(0)}',
                          style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                        ),
                        trailing: Text(
                          '₹${((item['quantity'] ?? 0) * (item['rate'] ?? 0)).toDouble().toStringAsFixed(0)}',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ),
                    )),
                  ],

                  // Production Timeline
                  const SizedBox(height: 12),
                  Text(
                    'Timeline',
                    style: TextStyle(fontWeight: FontWeight.bold, color: theme.primaryColor, fontSize: 15),
                  ),
                  const SizedBox(height: 8),
                  _buildTimelineCard(),
                ],
              ),
            ),
    );
  }

  Widget _buildInfoRow(IconData icon, String label, String value) {
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

  Widget _buildAmountRow(String label, double amount, {bool isBold = false, Color? color}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: isBold ? 15 : 14,
              fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
            ),
          ),
          Text(
            '₹${amount.toStringAsFixed(2)}',
            style: TextStyle(
              fontSize: isBold ? 15 : 14,
              fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTimelineCard() {
    final allStages = ['confirmed', 'production', 'dispatched', 'installed', 'completed'];
    final currentIndex = allStages.indexOf(_order.status);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: List.generate(allStages.length, (index) {
            final stage = allStages[index];
            final color = _statusColors[stage] ?? Colors.grey;
            final icon = _statusIcons[stage] ?? Icons.circle;
            final isCompleted = index <= currentIndex;
            final isCurrent = index == currentIndex;
            final isLast = index == allStages.length - 1;

            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Column(
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        color: isCompleted ? color : Colors.grey.shade200,
                        shape: BoxShape.circle,
                        border: isCurrent ? Border.all(color: color, width: 2) : null,
                      ),
                      child: Icon(
                        icon,
                        color: isCompleted ? Colors.white : Colors.grey.shade400,
                        size: 16,
                      ),
                    ),
                    if (!isLast)
                      Container(
                        width: 2,
                        height: 30,
                        color: isCompleted ? color.withValues(alpha: 0.5) : Colors.grey.shade200,
                      ),
                  ],
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          stage[0].toUpperCase() + stage.substring(1),
                          style: TextStyle(
                            fontWeight: isCurrent ? FontWeight.bold : FontWeight.w500,
                            color: isCompleted ? color : Colors.grey.shade400,
                            fontSize: 14,
                          ),
                        ),
                        if (isCurrent)
                          Text(
                            'Current stage',
                            style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            );
          }),
        ),
      ),
    ).animate().fade(delay: 200.ms);
  }
}
