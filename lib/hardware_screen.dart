import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';
import 'supabase_config.dart';

class HardwareItem {
  String? id;
  String name = '';
  String type = '';
  String brand = '';
  int quantity = 0;
  int reorderLevel = 0;
  String unit = 'NOS';
  double price = 0;
  String notes = '';
  DateTime createdAt;

  HardwareItem({
    this.id,
    this.name = '',
    this.type = '',
    this.brand = '',
    this.quantity = 0,
    this.reorderLevel = 0,
    this.unit = 'NOS',
    this.price = 0,
    this.notes = '',
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  bool get isLowStock => quantity < reorderLevel;

  Map<String, dynamic> toMap({String? clientId}) => {
    if (id != null) 'id': id,
    'name': name,
    'type': type,
    'brand': brand,
    'quantity': quantity,
    'reorder_level': reorderLevel,
    'unit': unit,
    'price': price,
    'notes': notes,
    if (clientId != null && clientId.isNotEmpty) 'client_id': clientId,
  };

  static HardwareItem fromMap(Map<String, dynamic> map) {
    return HardwareItem(
      id: map['id'] as String?,
      name: (map['name'] ?? '') as String,
      type: (map['type'] ?? '') as String,
      brand: (map['brand'] ?? '') as String,
      quantity: (map['quantity'] as num?)?.toInt() ?? 0,
      reorderLevel: (map['reorder_level'] as num?)?.toInt() ?? 0,
      unit: (map['unit'] ?? 'NOS') as String,
      price: (map['price'] as num?)?.toDouble() ?? 0,
      notes: (map['notes'] ?? '') as String,
      createdAt: map['created_at'] != null
          ? DateTime.tryParse(map['created_at'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

class HardwareScreen extends StatefulWidget {
  const HardwareScreen({super.key});

  @override
  State<HardwareScreen> createState() => _HardwareScreenState();
}

class _HardwareScreenState extends State<HardwareScreen> {
  List<HardwareItem> _items = [];
  bool _isLoading = true;
  String _searchQuery = '';
  String _filterType = 'All';
  List<String> _types = ['All'];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final response = await SupabaseConfig.client
          .from('hardware_inventory')
          .select()
          .eq('client_id', clientId)
          .order('name');

      if (mounted) {
        final items = (response as List).map((e) => HardwareItem.fromMap(e)).toList();
        final types = <String>{'All'};
        for (final item in items) {
          if (item.type.isNotEmpty) types.add(item.type);
        }
        setState(() {
          _items = items;
          _types = types.toList()..sort();
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load hardware: $e')),
        );
      }
    }
  }

  List<HardwareItem> get _filteredItems {
    return _items.where((item) {
      final matchesSearch = _searchQuery.isEmpty ||
          item.name.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          item.brand.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          item.type.toLowerCase().contains(_searchQuery.toLowerCase());
      final matchesType = _filterType == 'All' || item.type == _filterType;
      return matchesSearch && matchesType;
    }).toList();
  }

  int get _totalCount => _items.length;
  int get _lowStockCount => _items.where((i) => i.isLowStock).length;
  double get _totalValue => _items.fold(0.0, (sum, i) => sum + (i.price * i.quantity));

  void _showAddSheet() {
    final nameController = TextEditingController();
    final typeController = TextEditingController();
    final brandController = TextEditingController();
    final qtyController = TextEditingController(text: '0');
    final reorderController = TextEditingController(text: '10');
    final priceController = TextEditingController();
    final unitController = TextEditingController(text: 'NOS');
    final notesController = TextEditingController();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
          16, 16, 16, MediaQuery.of(ctx).viewInsets.bottom + 16,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Add Hardware',
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
                  prefixIcon: Icon(Icons.hardware),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: typeController,
                decoration: const InputDecoration(
                  labelText: 'Type (e.g. Hinge, Lock, Roller)',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.category),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: brandController,
                decoration: const InputDecoration(
                  labelText: 'Brand',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.business),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: qtyController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Quantity *',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.inventory),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: reorderController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Reorder Level',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.warning_amber),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: priceController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Unit Price (₹)',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.currency_rupee),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: unitController,
                      decoration: const InputDecoration(
                        labelText: 'Unit',
                        border: OutlineInputBorder(),
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
                    final item = HardwareItem(
                      name: nameController.text.trim(),
                      type: typeController.text.trim(),
                      brand: brandController.text.trim(),
                      quantity: int.tryParse(qtyController.text) ?? 0,
                      reorderLevel: int.tryParse(reorderController.text) ?? 10,
                      price: double.tryParse(priceController.text) ?? 0,
                      unit: unitController.text.trim().isEmpty ? 'NOS' : unitController.text.trim(),
                      notes: notesController.text.trim(),
                    );

                    try {
                      await SupabaseConfig.client
                          .from('hardware_inventory')
                          .insert(item.toMap(clientId: clientId));
                      Navigator.pop(ctx);
                      _loadData();
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Hardware added'), backgroundColor: Colors.green),
                      );
                    } catch (e) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Failed to add: $e'), backgroundColor: Colors.red),
                      );
                    }
                  },
                  child: const Text('Add Hardware'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showEditQuantitySheet(HardwareItem item) {
    final controller = TextEditingController(text: item.quantity.toString());
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
          16, 16, 16, MediaQuery.of(ctx).viewInsets.bottom + 16,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Update Quantity — ${item.name}',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Theme.of(context).primaryColor),
            ),
            const SizedBox(height: 4),
            Text('Current: ${item.quantity} ${item.unit}', style: TextStyle(color: Colors.grey.shade600)),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'New Quantity',
                border: OutlineInputBorder(),
              ),
              autofocus: true,
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () async {
                      final newQty = int.tryParse(controller.text);
                      if (newQty == null || newQty < 0) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Enter a valid quantity'), backgroundColor: Colors.red),
                        );
                        return;
                      }
                      try {
                        final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
                        await SupabaseConfig.client
                            .from('hardware_inventory')
                            .update({'quantity': newQty})
                            .eq('id', item.id!)
                            .eq('client_id', clientId);
                        Navigator.pop(ctx);
                        _loadData();
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Quantity updated to $newQty'), backgroundColor: Colors.green),
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
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Hardware'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadData,
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
                      _buildSummaryCard('Total Items', _totalCount.toString(), Icons.hardware, Colors.blue),
                      const SizedBox(width: 8),
                      _buildSummaryCard('Low Stock', _lowStockCount.toString(), Icons.warning_amber, Colors.orange),
                      const SizedBox(width: 8),
                      _buildSummaryCard('Value', '₹${_totalValue.toStringAsFixed(0)}', Icons.account_balance_wallet, Colors.green),
                    ],
                  ),
                ).animate().fade().slideY(begin: -0.1),

                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          decoration: const InputDecoration(
                            hintText: 'Search hardware...',
                            prefixIcon: Icon(Icons.search, size: 20),
                          ),
                          onChanged: (val) => setState(() => _searchQuery = val),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.surface,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: Colors.grey.shade300),
                        ),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<String>(
                            value: _filterType,
                            isDense: true,
                            items: _types.map((t) => DropdownMenuItem(value: t, child: Text(t, style: const TextStyle(fontSize: 13)))).toList(),
                            onChanged: (val) => setState(() => _filterType = val ?? 'All'),
                          ),
                        ),
                      ),
                    ],
                  ),
                ).animate().fade(delay: 100.ms),

                Expanded(
                  child: _filteredItems.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.hardware_outlined, size: 60, color: Colors.grey.shade400),
                              const SizedBox(height: 16),
                              Text('No hardware found', style: TextStyle(color: Colors.grey.shade500, fontSize: 18)),
                            ],
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: _loadData,
                          child: ListView.builder(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            itemCount: _filteredItems.length,
                            itemBuilder: (context, index) => _buildItemCard(_filteredItems[index]),
                          ),
                        ),
                ),
              ],
            ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showAddSheet,
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

  Widget _buildItemCard(HardwareItem item) {
    final isLow = item.isLowStock;
    final color = isLow ? Colors.red : Colors.green;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        leading: CircleAvatar(
          backgroundColor: color.withValues(alpha: 0.1),
          child: Icon(
            isLow ? Icons.warning_amber : Icons.check_circle,
            color: color,
            size: 20,
          ),
        ),
        title: Row(
          children: [
            Expanded(
              child: Text(
                item.name,
                style: const TextStyle(fontWeight: FontWeight.w600),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (isLow)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.red.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Text('LOW', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.red)),
              ),
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 2),
            Row(
              children: [
                if (item.type.isNotEmpty) ...[
                  Text(item.type, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  const SizedBox(width: 8),
                ],
                if (item.brand.isNotEmpty)
                  Text(item.brand, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
              ],
            ),
            const SizedBox(height: 2),
            Row(
              children: [
                Text(
                  '₹${item.price.toStringAsFixed(0)}/${item.unit}',
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                ),
                const Spacer(),
                Text(
                  'Reorder: ${item.reorderLevel}',
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                ),
              ],
            ),
          ],
        ),
        trailing: GestureDetector(
          onTap: () => _showEditQuantitySheet(item),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${item.quantity}',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 18,
                  color: color,
                ),
              ),
              Text(
                item.unit,
                style: TextStyle(fontSize: 10, color: Colors.grey.shade500),
              ),
            ],
          ),
        ),
        onTap: () => _showEditQuantitySheet(item),
      ),
    ).animate().fade(delay: Duration(milliseconds: 30 * _filteredItems.indexOf(item))).slideX(begin: 0.05);
  }
}
