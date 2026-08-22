import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';
import 'supabase_config.dart';

class ProductionOrder {
  String? id;
  String orderId = '';
  String orderNo = '';
  String customerName = '';
  String productDetails = '';
  String assignedWorker = '';
  String stage = 'cutting';
  String status = 'pending';
  String priority = 'normal';
  DateTime createdAt;

  ProductionOrder({
    this.id,
    this.orderId = '',
    this.orderNo = '',
    this.customerName = '',
    this.productDetails = '',
    this.assignedWorker = '',
    this.stage = 'cutting',
    this.status = 'pending',
    this.priority = 'normal',
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  Map<String, dynamic> toMap({String? clientId}) => {
    if (id != null) 'id': id,
    'order_id': orderId,
    'order_no': orderNo,
    'customer_name': customerName,
    'product_details': productDetails,
    'assigned_worker': assignedWorker,
    'stage': stage,
    'status': status,
    'priority': priority,
    if (clientId != null && clientId.isNotEmpty) 'client_id': clientId,
  };

  static ProductionOrder fromMap(Map<String, dynamic> map) {
    return ProductionOrder(
      id: map['id'] as String?,
      orderId: (map['order_id'] ?? '') as String,
      orderNo: (map['order_no'] ?? '') as String,
      customerName: (map['customer_name'] ?? '') as String,
      productDetails: (map['product_details'] ?? '') as String,
      assignedWorker: (map['assigned_worker'] ?? '') as String,
      stage: (map['stage'] ?? 'cutting') as String,
      status: (map['status'] ?? 'pending') as String,
      priority: (map['priority'] ?? 'normal') as String,
      createdAt: map['created_at'] != null
          ? DateTime.tryParse(map['created_at'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

class ProductionScreen extends StatefulWidget {
  const ProductionScreen({super.key});

  @override
  State<ProductionScreen> createState() => _ProductionScreenState();
}

class _ProductionScreenState extends State<ProductionScreen> {
  List<ProductionOrder> _orders = [];
  bool _isLoading = true;
  String _selectedStage = 'all';

  static const List<String> _stages = ['cutting', 'assembly', 'qc', 'packing'];

  static const Map<String, String> _stageLabels = {
    'cutting': 'Cutting',
    'assembly': 'Assembly',
    'qc': 'Quality Check',
    'packing': 'Packing',
  };

  static const Map<String, Color> _stageColors = {
    'cutting': Colors.blue,
    'assembly': Colors.orange,
    'qc': Colors.purple,
    'packing': Colors.green,
  };

  static const Map<String, IconData> _stageIcons = {
    'cutting': Icons.content_cut,
    'assembly': Icons.build,
    'qc': Icons.check_circle,
    'packing': Icons.inventory,
  };

  static const Map<String, Color> _priorityColors = {
    'urgent': Colors.red,
    'high': Colors.orange,
    'normal': Colors.blue,
    'low': Colors.grey,
  };

  @override
  void initState() {
    super.initState();
    _loadProductionOrders();
  }

  Future<void> _loadProductionOrders() async {
    setState(() => _isLoading = true);
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final response = await SupabaseConfig.client
          .from('production_orders')
          .select()
          .eq('client_id', clientId)
          .order('created_at', ascending: false);

      if (mounted) {
        setState(() {
          _orders = (response as List).map((e) => ProductionOrder.fromMap(e)).toList();
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load production orders: $e')),
        );
      }
    }
  }

  Map<String, List<ProductionOrder>> get _ordersByStage {
    final map = <String, List<ProductionOrder>>{};
    for (final stage in _stages) {
      map[stage] = _orders.where((o) => o.stage == stage).toList();
    }
    return map;
  }

  List<ProductionOrder> get _filteredOrders {
    if (_selectedStage == 'all') return _orders;
    return _orders.where((o) => o.stage == _selectedStage).toList();
  }

  Future<void> _updateStage(ProductionOrder order, String newStage) async {
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      await SupabaseConfig.client
          .from('production_orders')
          .update({'stage': newStage})
          .eq('id', order.id!)
          .eq('client_id', clientId);
      _loadProductionOrders();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Moved to ${_stageLabels[newStage]}'), backgroundColor: Colors.green),
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

  void _showUpdateDialog(ProductionOrder order) {
    String selectedStage = order.stage;
    String selectedStatus = order.status;
    String selectedPriority = order.priority;
    final workerController = TextEditingController(text: order.assignedWorker);

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text('Update ${order.orderNo}'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: selectedStage,
                decoration: const InputDecoration(labelText: 'Stage', border: OutlineInputBorder()),
                items: _stages.map((s) => DropdownMenuItem(
                  value: s,
                  child: Row(
                    children: [
                      Icon(_stageIcons[s], size: 16, color: _stageColors[s]),
                      const SizedBox(width: 8),
                      Text(_stageLabels[s]!),
                    ],
                  ),
                )).toList(),
                onChanged: (val) => setDialogState(() => selectedStage = val ?? order.stage),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: selectedStatus,
                decoration: const InputDecoration(labelText: 'Status', border: OutlineInputBorder()),
                items: const [
                  DropdownMenuItem(value: 'pending', child: Text('Pending')),
                  DropdownMenuItem(value: 'in_progress', child: Text('In Progress')),
                  DropdownMenuItem(value: 'completed', child: Text('Completed')),
                ],
                onChanged: (val) => setDialogState(() => selectedStatus = val ?? order.status),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: selectedPriority,
                decoration: const InputDecoration(labelText: 'Priority', border: OutlineInputBorder()),
                items: _priorityColors.keys.map((p) => DropdownMenuItem(
                  value: p,
                  child: Row(
                    children: [
                      Container(
                        width: 12,
                        height: 12,
                        decoration: BoxDecoration(
                          color: _priorityColors[p],
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(p[0].toUpperCase() + p.substring(1)),
                    ],
                  ),
                )).toList(),
                onChanged: (val) => setDialogState(() => selectedPriority = val ?? order.priority),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: workerController,
                decoration: const InputDecoration(
                  labelText: 'Assigned Worker',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: () async {
                final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
                try {
                  await SupabaseConfig.client
                      .from('production_orders')
                      .update({
                        'stage': selectedStage,
                        'status': selectedStatus,
                        'priority': selectedPriority,
                        'assigned_worker': workerController.text.trim(),
                      })
                      .eq('id', order.id!)
                      .eq('client_id', clientId);
                  Navigator.pop(ctx);
                  _loadProductionOrders();
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Production order updated'), backgroundColor: Colors.green),
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
          ],
        ),
      ),
    );
  }

  void _showMoveStageSheet(ProductionOrder order) {
    final nextStages = _stages.where((s) => s != order.stage).toList();
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
                'Move ${order.orderNo} to...',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
            ),
            const SizedBox(height: 8),
            ...nextStages.map((stage) => ListTile(
              leading: CircleAvatar(
                backgroundColor: _stageColors[stage]!.withValues(alpha: 0.1),
                child: Icon(_stageIcons[stage], color: _stageColors[stage], size: 20),
              ),
              title: Text(_stageLabels[stage]!),
              subtitle: Text(stage == _stages.last ? 'Final stage' : 'Next stage'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                Navigator.pop(ctx);
                _updateStage(order, stage);
              },
            )),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final byStage = _ordersByStage;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Production'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadProductionOrders,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _selectedStage == 'all'
              ? _buildKanbanView(byStage)
              : _buildListView(),
      bottomNavigationBar: _buildStageTabs(),
    );
  }

  Widget _buildKanbanView(Map<String, List<ProductionOrder>> byStage) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: _stages.map((stage) {
          final orders = byStage[stage] ?? [];
          final color = _stageColors[stage]!;
          return SizedBox(
            width: 280,
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.1),
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
                    border: Border.all(color: color.withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    children: [
                      Icon(_stageIcons[stage], color: color, size: 18),
                      const SizedBox(width: 8),
                      Text(
                        _stageLabels[stage]!,
                        style: TextStyle(fontWeight: FontWeight.bold, color: color, fontSize: 14),
                      ),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: color.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          '${orders.length}',
                          style: TextStyle(fontWeight: FontWeight.bold, color: color, fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.grey.shade50,
                      borderRadius: const BorderRadius.vertical(bottom: Radius.circular(12)),
                      border: Border.all(color: Colors.grey.shade200),
                    ),
                    child: orders.isEmpty
                        ? Center(
                            child: Padding(
                              padding: const EdgeInsets.all(24),
                              child: Text(
                                'No orders',
                                style: TextStyle(color: Colors.grey.shade400),
                              ),
                            ),
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.all(8),
                            itemCount: orders.length,
                            itemBuilder: (context, index) => _buildKanbanCard(orders[index]),
                          ),
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildKanbanCard(ProductionOrder order) {
    final priorityColor = _priorityColors[order.priority] ?? Colors.grey;
    final statusColor = order.status == 'completed'
        ? Colors.green
        : order.status == 'in_progress'
            ? Colors.orange
            : Colors.grey;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: () => _showUpdateDialog(order),
        onLongPress: () => _showMoveStageSheet(order),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(color: priorityColor, shape: BoxShape.circle),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      order.orderNo,
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      order.status == 'in_progress' ? 'IN PROG' : order.status.toUpperCase(),
                      style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: statusColor),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                order.customerName,
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
              ),
              if (order.productDetails.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  order.productDetails,
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              if (order.assignedWorker.isNotEmpty) ...[
                const SizedBox(height: 6),
                Row(
                  children: [
                    Icon(Icons.person, size: 12, color: Colors.grey.shade400),
                    const SizedBox(width: 4),
                    Text(
                      order.assignedWorker,
                      style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    ).animate().fade().slideY(begin: 0.05);
  }

  Widget _buildListView() {
    return RefreshIndicator(
      onRefresh: _loadProductionOrders,
      child: _filteredOrders.isEmpty
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.factory, size: 60, color: Colors.grey.shade400),
                  const SizedBox(height: 16),
                  Text(
                    'No orders in ${_stageLabels[_selectedStage]}',
                    style: TextStyle(color: Colors.grey.shade500, fontSize: 16),
                  ),
                ],
              ),
            )
          : ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              itemCount: _filteredOrders.length,
              itemBuilder: (context, index) {
                final order = _filteredOrders[index];
                final color = _stageColors[order.stage] ?? Colors.grey;
                final priorityColor = _priorityColors[order.priority] ?? Colors.grey;

                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    leading: CircleAvatar(
                      backgroundColor: color.withValues(alpha: 0.1),
                      child: Icon(_stageIcons[order.stage], color: color, size: 20),
                    ),
                    title: Text(order.orderNo, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                    subtitle: Text(order.customerName, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(color: priorityColor, shape: BoxShape.circle),
                        ),
                        const SizedBox(width: 12),
                        const Icon(Icons.chevron_right),
                      ],
                    ),
                    onTap: () => _showUpdateDialog(order),
                    onLongPress: () => _showMoveStageSheet(order),
                  ),
                ).animate().fade(delay: Duration(milliseconds: 30 * index)).slideX(begin: 0.05);
              },
            ),
    );
  }

  Widget _buildStageTabs() {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(top: BorderSide(color: Colors.grey.shade200)),
      ),
      child: SafeArea(
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            children: [
              _buildStageTab('all', 'All', Icons.dashboard, Colors.grey),
              ..._stages.map((stage) => _buildStageTab(
                stage,
                _stageLabels[stage]!,
                _stageIcons[stage]!,
                _stageColors[stage]!,
              )),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStageTab(String stage, String label, IconData icon, Color color) {
    final isSelected = _selectedStage == stage;
    final count = stage == 'all'
        ? _orders.length
        : _orders.where((o) => o.stage == stage).length;

    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        avatar: Icon(icon, size: 16, color: isSelected ? Colors.white : color),
        label: Text('$label ($count)'),
        selected: isSelected,
        selectedColor: color,
        labelStyle: TextStyle(
          color: isSelected ? Colors.white : Colors.grey.shade700,
          fontSize: 12,
        ),
        onSelected: (_) => setState(() => _selectedStage = stage),
      ),
    );
  }
}
