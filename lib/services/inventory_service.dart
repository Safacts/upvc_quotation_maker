import 'package:flutter/foundation.dart';
import '../models_extra.dart';
import '../supabase_config.dart';

/// Manages inventory: stock levels, movements, and product CRUD.
///
/// Falls back gracefully when inventory columns don't exist in the DB yet.
/// Callers should catch errors and show user-friendly messages.
class InventoryService {
  InventoryService._();
  static final InventoryService instance = InventoryService._();

  /// Whether the inventory columns exist (discovered on first query).
  bool _inventoryColumnsExist = true;

  // ---------------------------------------------------------------------------
  // Products
  // ---------------------------------------------------------------------------

  /// Fetch all products with inventory fields.
  Future<List<Product>> fetchProducts(String clientId) async {
    if (clientId.isEmpty) return const <Product>[];
    try {
      final response = await SupabaseConfig.client
          .from('products')
          .select()
          .eq('client_id', clientId)
          .eq('soft_deleted', false)
          .order('category', ascending: true)
          .order('name', ascending: true);

      final products = (response as List)
          .map((e) => Product.fromMap((e as Map).cast<String, dynamic>()))
          .where((p) => p.name.isNotEmpty || p.description.isNotEmpty)
          .toList();

      _inventoryColumnsExist = true;
      return products;
    } catch (e) {
      // If the error mentions the column, inventory columns don't exist yet.
      final msg = e.toString().toLowerCase();
      if (msg.contains('column') && msg.contains('stock_quantity')) {
        _inventoryColumnsExist = false;
        return _fetchProductsLegacy(clientId);
      }
      debugPrint('InventoryService.fetchProducts error: $e');
      rethrow;
    }
  }

  /// Fallback: fetch products without inventory columns.
  Future<List<Product>> _fetchProductsLegacy(String clientId) async {
    try {
      final response = await SupabaseConfig.client
          .from('products')
          .select('id, name, category, description, price, unit, client_id')
          .eq('client_id', clientId)
          .eq('soft_deleted', false)
          .order('category', ascending: true)
          .order('name', ascending: true);

      return (response as List)
          .map((e) => Product.fromMap((e as Map).cast<String, dynamic>()))
          .where((p) => p.name.isNotEmpty || p.description.isNotEmpty)
          .toList();
    } catch (e) {
      debugPrint('InventoryService._fetchProductsLegacy error: $e');
      return const <Product>[];
    }
  }

  /// Add a new product to the catalog.
  Future<Product?> addProduct(Product product, String clientId) async {
    if (clientId.isEmpty) return null;
    try {
      final map = _inventoryColumnsExist
          ? product.toMap(clientId: clientId)
          : product.toLegacyMap(clientId: clientId);
      final response = await SupabaseConfig.client
          .from('products')
          .insert(map)
          .select()
          .single();
      return Product.fromMap((response as Map).cast<String, dynamic>());
    } catch (e) {
      final msg = e.toString().toLowerCase();
      if (msg.contains('column') && msg.contains('stock_quantity')) {
        _inventoryColumnsExist = false;
        // Retry with legacy map
        try {
          final response = await SupabaseConfig.client
              .from('products')
              .insert(product.toLegacyMap(clientId: clientId))
              .select()
              .single();
          return Product.fromMap((response as Map).cast<String, dynamic>());
        } catch (e2) {
          debugPrint('InventoryService.addProduct legacy error: $e2');
          return null;
        }
      }
      debugPrint('InventoryService.addProduct error: $e');
      return null;
    }
  }

  /// Update stock quantity for a product.
  Future<bool> updateStock(String productId, int newQuantity, String clientId) async {
    if (clientId.isEmpty || productId.isEmpty) return false;
    if (!_inventoryColumnsExist) return false;
    try {
      await SupabaseConfig.client
          .from('products')
          .update({'stock_quantity': newQuantity})
          .eq('id', productId)
          .eq('client_id', clientId);
      return true;
    } catch (e) {
      debugPrint('InventoryService.updateStock error: $e');
      return false;
    }
  }

  /// Adjust stock by a delta (positive = stock in, negative = stock out).
  Future<bool> adjustStock(String productId, int delta, String clientId) async {
    if (clientId.isEmpty || productId.isEmpty) return false;
    if (!_inventoryColumnsExist) return false;
    try {
      // Use RPC if available, otherwise raw update
      await SupabaseConfig.client
          .from('products')
          .update({'stock_quantity': SupabaseConfig.client.rpc})
          .eq('id', productId)
          .eq('client_id', clientId);
      return true;
    } catch (_) {
      // Fallback: fetch current, compute new, update
      try {
        final res = await SupabaseConfig.client
            .from('products')
            .select('stock_quantity')
            .eq('id', productId)
            .eq('client_id', clientId)
            .single();
        final current = (res['stock_quantity'] as num?)?.toInt() ?? 0;
        final newQty = (current + delta).clamp(0, 999999);
        await SupabaseConfig.client
            .from('products')
            .update({'stock_quantity': newQty})
            .eq('id', productId)
            .eq('client_id', clientId);
        return true;
      } catch (e) {
        debugPrint('InventoryService.adjustStock error: $e');
        return false;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Stock Movements
  // ---------------------------------------------------------------------------

  /// Record a stock movement and update the product's stock_quantity.
  Future<bool> recordMovement(StockMovement movement, String clientId) async {
    if (clientId.isEmpty) return false;
    if (!_inventoryColumnsExist) return false;
    try {
      // Insert the movement record
      await SupabaseConfig.client
          .from('stock_movements')
          .insert(movement.toMap(clientId: clientId));

      // Update the product's stock_quantity
      final delta = movement.isStockIn ? movement.quantity : -movement.quantity;
      await adjustStock(movement.productId, delta, clientId);

      return true;
    } catch (e) {
      debugPrint('InventoryService.recordMovement error: $e');
      return false;
    }
  }

  /// Fetch movement history for a product.
  Future<List<StockMovement>> fetchMovements(String productId, String clientId) async {
    if (clientId.isEmpty || productId.isEmpty) return const <StockMovement>[];
    if (!_inventoryColumnsExist) return const <StockMovement>[];
    try {
      final response = await SupabaseConfig.client
          .from('stock_movements')
          .select()
          .eq('product_id', productId)
          .eq('client_id', clientId)
          .order('created_at', ascending: false)
          .limit(50);

      return (response as List)
          .map((e) => StockMovement.fromMap((e as Map).cast<String, dynamic>()))
          .toList();
    } catch (e) {
      debugPrint('InventoryService.fetchMovements error: $e');
      return const <StockMovement>[];
    }
  }

  /// Fetch all recent movements across all products.
  Future<List<StockMovement>> fetchAllMovements(String clientId) async {
    if (clientId.isEmpty) return const <StockMovement>[];
    if (!_inventoryColumnsExist) return const <StockMovement>[];
    try {
      final response = await SupabaseConfig.client
          .from('stock_movements')
          .select()
          .eq('client_id', clientId)
          .order('created_at', ascending: false)
          .limit(100);

      return (response as List)
          .map((e) => StockMovement.fromMap((e as Map).cast<String, dynamic>()))
          .toList();
    } catch (e) {
      debugPrint('InventoryService.fetchAllMovements error: $e');
      return const <StockMovement>[];
    }
  }

  /// Whether inventory columns are supported in the current DB schema.
  bool get inventorySupported => _inventoryColumnsExist;
}
