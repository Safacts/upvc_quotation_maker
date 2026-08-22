import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../app_state.dart';
import '../models_extra.dart';
import '../services/inventory_service.dart';

class InventoryScreen extends StatefulWidget {
  const InventoryScreen({super.key});

  @override
  State<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends State<InventoryScreen> {
  List<Product> _products = [];
  bool _isLoading = true;
  String _searchQuery = '';
  String _filterCategory = 'All';
  List<String> _categories = ['All'];
  bool _showAddForm = false;

  // Add product form controllers
  final _nameController = TextEditingController();
  final _descController = TextEditingController();
  final _priceController = TextEditingController();
  final _categoryController = TextEditingController();
  final _stockController = TextEditingController(text: '0');
  final _thresholdController = TextEditingController(text: '10');
  final _hsnController = TextEditingController(text: '3925');
  String _selectedUnit = 'SFT';

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descController.dispose();
    _priceController.dispose();
    _categoryController.dispose();
    _stockController.dispose();
    _thresholdController.dispose();
    _hsnController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final products = await InventoryService.instance.fetchProducts(clientId);

      final cats = <String>{'All'};
      for (final p in products) {
        if (p.category.isNotEmpty) cats.add(p.category);
      }

      if (mounted) {
        setState(() {
          _products = products;
          _categories = cats.toList()..sort();
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load inventory: $e')),
        );
      }
    }
  }

  List<Product> get _filteredProducts {
    return _products.where((p) {
      final matchesSearch = _searchQuery.isEmpty ||
          p.name.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          p.description.toLowerCase().contains(_searchQuery.toLowerCase());
      final matchesCategory = _filterCategory == 'All' || p.category == _filterCategory;
      return matchesSearch && matchesCategory;
    }).toList();
  }

  int get _lowStockCount => _products.where((p) => p.isLowStock).length;
  int get _totalStock => _products.fold(0, (sum, p) => sum + p.stockQuantity);

  void _showStockDialog(Product product, bool isIn) {
    final controller = TextEditingController(text: isIn ? '1' : '0');
    final noteController = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(isIn ? 'Stock In — ${product.name}' : 'Stock Out — ${product.name}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Current stock: ${product.stockQuantity}', style: TextStyle(color: Colors.grey.shade600)),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: 'Quantity',
                border: const OutlineInputBorder(),
                suffixText: product.unit,
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: noteController,
              decoration: const InputDecoration(
                labelText: 'Note (optional)',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () async {
              final qty = int.tryParse(controller.text) ?? 0;
              if (qty <= 0) return;
              final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
              final movement = StockMovement(
                productId: product.id ?? '',
                productName: product.name,
                quantity: qty,
                type: isIn ? 'in' : 'out',
                note: noteController.text.isNotEmpty ? noteController.text : null,
              );
              final success = await InventoryService.instance.recordMovement(movement, clientId);
              if (mounted) {
                Navigator.pop(ctx);
                if (success) {
                  _loadData();
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('${isIn ? "Stock in" : "Stock out"}: $qty ${product.unit} of ${product.name}'),
                      backgroundColor: Colors.green,
                    ),
                  );
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Failed to record movement'), backgroundColor: Colors.red),
                  );
                }
              }
            },
            child: Text(isIn ? 'Add Stock' : 'Remove Stock'),
          ),
        ],
      ),
    );
  }

  void _showAddProductForm() {
    setState(() => _showAddForm = !_showAddForm);
  }

  Future<void> _addProduct() async {
    if (_nameController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Product name is required'), backgroundColor: Colors.red),
      );
      return;
    }

    final product = Product(
      name: _nameController.text.trim(),
      description: _descController.text.trim(),
      price: double.tryParse(_priceController.text) ?? 0,
      category: _categoryController.text.trim(),
      unit: _selectedUnit,
      stockQuantity: int.tryParse(_stockController.text) ?? 0,
      lowStockThreshold: int.tryParse(_thresholdController.text) ?? 10,
      hsnCode: _hsnController.text.trim().isEmpty ? '3925' : _hsnController.text.trim(),
    );

    final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
    final result = await InventoryService.instance.addProduct(product, clientId);

    if (mounted) {
      if (result != null) {
        _nameController.clear();
        _descController.clear();
        _priceController.clear();
        _categoryController.clear();
        _stockController.text = '0';
        _thresholdController.text = '10';
        _hsnController.text = '3925';
        setState(() => _showAddForm = false);
        _loadData();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Product added'), backgroundColor: Colors.green),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to add product'), backgroundColor: Colors.red),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Inventory'),
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
                // Summary cards
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: Row(
                    children: [
                      _buildSummaryCard('Total Products', _products.length.toString(), Icons.inventory_2, Colors.blue),
                      const SizedBox(width: 8),
                      _buildSummaryCard('Low Stock', _lowStockCount.toString(), Icons.warning_amber, Colors.orange),
                      const SizedBox(width: 8),
                      _buildSummaryCard('Total Units', _totalStock.toString(), Icons.storage, Colors.green),
                    ],
                  ),
                ).animate().fade().slideY(begin: -0.1),

                // Search and filter
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          decoration: const InputDecoration(
                            hintText: 'Search products...',
                            prefixIcon: Icon(Icons.search, size: 20),
                          ),
                          onChanged: (val) => setState(() => _searchQuery = val),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surface,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: Colors.grey.shade300),
                        ),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<String>(
                            value: _filterCategory,
                            isDense: true,
                            items: _categories.map((c) => DropdownMenuItem(value: c, child: Text(c, style: const TextStyle(fontSize: 13)))).toList(),
                            onChanged: (val) => setState(() => _filterCategory = val ?? 'All'),
                          ),
                        ),
                      ),
                    ],
                  ),
                ).animate().fade(delay: 100.ms),

                // Add product form
                if (_showAddForm) _buildAddProductForm(),

                // Add product button
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      icon: Icon(_showAddForm ? Icons.close : Icons.add),
                      label: Text(_showAddForm ? 'Cancel' : 'Add New Product'),
                      onPressed: _showAddProductForm,
                    ),
                  ),
                ),

                // Product list
                Expanded(
                  child: _filteredProducts.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.inventory_2_outlined, size: 60, color: Colors.grey.shade400),
                              const SizedBox(height: 16),
                              Text('No products found', style: TextStyle(color: Colors.grey.shade500, fontSize: 18)),
                            ],
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: _loadData,
                          child: ListView.builder(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            itemCount: _filteredProducts.length,
                            itemBuilder: (context, index) => _buildProductCard(_filteredProducts[index]),
                          ),
                        ),
                ),
              ],
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
            Text(value, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: color)),
            Text(label, style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
          ],
        ),
      ),
    );
  }

  Widget _buildProductCard(Product product) {
    final isLow = product.isLowStock;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        leading: CircleAvatar(
          backgroundColor: isLow ? Colors.red.withValues(alpha: 0.1) : Colors.green.withValues(alpha: 0.1),
          child: Icon(
            isLow ? Icons.warning_amber : Icons.check_circle,
            color: isLow ? Colors.red : Colors.green,
            size: 20,
          ),
        ),
        title: Row(
          children: [
            Expanded(
              child: Text(
                product.name,
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
        subtitle: Text(
          '${product.category.isNotEmpty ? "${product.category} · " : ""}₹${product.price.toStringAsFixed(0)}/${product.unit}',
          style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${product.stockQuantity}',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                    color: isLow ? Colors.red : Colors.grey.shade800,
                  ),
                ),
                Text(
                  'in stock',
                  style: TextStyle(fontSize: 10, color: Colors.grey.shade500),
                ),
              ],
            ),
            const SizedBox(width: 8),
            PopupMenuButton<String>(
              itemBuilder: (ctx) => [
                const PopupMenuItem(value: 'in', child: Text('Stock In')),
                const PopupMenuItem(value: 'out', child: Text('Stock Out')),
                const PopupMenuItem(value: 'history', child: Text('View History')),
              ],
              onSelected: (val) {
                if (val == 'in') {
                  _showStockDialog(product, true);
                } else if (val == 'out') {
                  _showStockDialog(product, false);
                } else if (val == 'history') {
                  _showMovementHistory(product);
                }
              },
            ),
          ],
        ),
      ),
    ).animate().fade(delay: Duration(milliseconds: 30 * _filteredProducts.indexOf(product))).slideX(begin: 0.05);
  }

  Widget _buildAddProductForm() {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Add New Product', style: TextStyle(fontWeight: FontWeight.bold, color: Theme.of(context).primaryColor)),
            const SizedBox(height: 12),
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(labelText: 'Product Name *', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _descController,
              decoration: const InputDecoration(labelText: 'Description', border: OutlineInputBorder()),
              maxLines: 2,
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _priceController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Rate (₹)', border: OutlineInputBorder()),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _selectedUnit,
                      decoration: const InputDecoration(labelText: 'Unit', border: OutlineInputBorder()),
                    items: const [
                      DropdownMenuItem(value: 'SFT', child: Text('SFT')),
                      DropdownMenuItem(value: 'NOS', child: Text('NOS')),
                      DropdownMenuItem(value: 'PCS', child: Text('PCS')),
                      DropdownMenuItem(value: 'SET', child: Text('SET')),
                      DropdownMenuItem(value: 'RFT', child: Text('RFT')),
                      DropdownMenuItem(value: 'RUN', child: Text('RUN')),
                      DropdownMenuItem(value: 'KG', child: Text('KG')),
                    ],
                    onChanged: (val) => setState(() => _selectedUnit = val ?? 'SFT'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _categoryController,
              decoration: const InputDecoration(labelText: 'Category', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _stockController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Initial Stock', border: OutlineInputBorder()),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _thresholdController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Low Stock Alert', border: OutlineInputBorder()),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _hsnController,
                    decoration: const InputDecoration(labelText: 'HSN Code', border: OutlineInputBorder()),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _addProduct,
                icon: const Icon(Icons.add),
                label: const Text('Add Product'),
              ),
            ),
          ],
        ),
      ),
    ).animate().fade().slideY(begin: 0.1);
  }

  void _showMovementHistory(Product product) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.6,
        minChildSize: 0.3,
        maxChildSize: 0.9,
        expand: false,
        builder: (ctx, scrollController) => FutureBuilder<List<StockMovement>>(
          future: InventoryService.instance.fetchMovements(
            product.id ?? '',
            Provider.of<AppState>(context, listen: false).clientConfig.clientId,
          ),
          builder: (ctx, snapshot) {
            final movements = snapshot.data ?? [];
            return Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Stock History — ${product.name}',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Current: ${product.stockQuantity} ${product.unit}',
                    style: TextStyle(color: Colors.grey.shade600),
                  ),
                  const Divider(),
                  Expanded(
                    child: movements.isEmpty
                        ? const Center(child: Text('No stock movements yet'))
                        : ListView.builder(
                            controller: scrollController,
                            itemCount: movements.length,
                            itemBuilder: (ctx, i) {
                              final m = movements[i];
                              return ListTile(
                                dense: true,
                                leading: CircleAvatar(
                                  radius: 14,
                                  backgroundColor: m.isStockIn
                                      ? Colors.green.withValues(alpha: 0.1)
                                      : Colors.red.withValues(alpha: 0.1),
                                  child: Icon(
                                    m.isStockIn ? Icons.add : Icons.remove,
                                    size: 16,
                                    color: m.isStockIn ? Colors.green : Colors.red,
                                  ),
                                ),
                                title: Text(
                                  '${m.isStockIn ? "+" : "-"}${m.quantity} ${product.unit}',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: m.isStockIn ? Colors.green : Colors.red,
                                  ),
                                ),
                                subtitle: Text(
                                  m.note?.isNotEmpty == true ? m.note! : (m.reference.isNotEmpty ? m.reference : 'Manual adjustment'),
                                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                                ),
                                trailing: Text(
                                  DateFormat('dd MMM, HH:mm').format(m.createdAt),
                                  style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                                ),
                              );
                            },
                          ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}
