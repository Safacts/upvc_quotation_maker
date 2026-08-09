import 'package:flutter/foundation.dart';

import '../models_extra.dart';
import '../supabase_config.dart';

/// Reads the `products` master table (migration 008) for the catalogue
/// dropdown in the quotation editor.
///
/// TENANT ISOLATION: every query carries an explicit `.eq('client_id', ...)`
/// on top of the global `x-client-id` header and the `client_isolation_products`
/// RLS policy. That is the 3-layer pattern used by every other query in this
/// app; do not remove the explicit filter just because RLS exists.
class CatalogService {
  CatalogService._();
  static final CatalogService instance = CatalogService._();

  /// Cache keyed by client id.
  ///
  /// Keyed rather than a bare list because the WEB build can switch tenants
  /// without a process restart (the client id comes from the URL). A single
  /// unkeyed cache would leak one fabricator's rate card into another's
  /// dropdown — a catastrophic trust failure, and exactly the kind of bug that
  /// only shows up in production.
  final Map<String, List<Product>> _cache = <String, List<Product>>{};
  final Map<String, DateTime> _fetchedAt = <String, DateTime>{};

  /// Rates change rarely (a fabricator revises them monthly at most), but a
  /// stale rate on a quotation is a real money error — so we re-fetch after
  /// five minutes rather than caching for the session.
  static const Duration _ttl = Duration(minutes: 5);

  bool _isFresh(String clientId) {
    final at = _fetchedAt[clientId];
    if (at == null) return false;
    return DateTime.now().difference(at) < _ttl;
  }

  /// Products for [clientId], newest rate card first.
  ///
  /// Returns an empty list (never throws) on failure: the catalogue is an
  /// accelerator, and a network blip must not block manual entry of a quote.
  Future<List<Product>> fetchProducts(String clientId, {bool forceRefresh = false}) async {
    if (clientId.isEmpty) return const <Product>[];

    if (!forceRefresh && _isFresh(clientId)) {
      return _cache[clientId] ?? const <Product>[];
    }

    try {
      final response = await SupabaseConfig.client
          .from('products')
          .select()
          .eq('client_id', clientId)
          // `soft_deleted` exists on products since migration 008. A deleted
          // product must vanish from the dropdown but stay resolvable on the
          // historical quotations that already reference it.
          .eq('soft_deleted', false)
          .order('category', ascending: true)
          .order('name', ascending: true);

      final products = (response as List)
          .map((e) => Product.fromMap((e as Map).cast<String, dynamic>()))
          .where((p) => p.name.isNotEmpty || p.description.isNotEmpty)
          .toList();

      _cache[clientId] = products;
      _fetchedAt[clientId] = DateTime.now();
      return products;
    } catch (e) {
      debugPrint('CatalogService.fetchProducts failed: $e');
      // Serve stale data if we have any — an old rate card beats no rate card
      // when the fabricator is standing on a site with one bar of signal.
      return _cache[clientId] ?? const <Product>[];
    }
  }

  /// Products priced per square foot — offered on MEASURED item rows.
  Future<List<Product>> fetchMeasuredProducts(String clientId) async {
    final all = await fetchProducts(clientId);
    return all.where((p) => p.isMeasured).toList();
  }

  /// Everything priced per piece — offered on UNMEASURED item rows.
  Future<List<Product>> fetchUnmeasuredProducts(String clientId) async {
    final all = await fetchProducts(clientId);
    return all.where((p) => !p.isMeasured).toList();
  }

  /// Distinct categories, for grouping/filtering the dropdown.
  Future<List<String>> fetchCategories(String clientId) async {
    final all = await fetchProducts(clientId);
    final set = <String>{};
    for (final p in all) {
      if (p.category.trim().isNotEmpty) set.add(p.category.trim());
    }
    final list = set.toList()..sort();
    return list;
  }

  /// Drops the cache for one tenant (or all tenants when [clientId] is null).
  /// Called on logout and after the console pushes a rate-card change.
  void invalidate([String? clientId]) {
    if (clientId == null) {
      _cache.clear();
      _fetchedAt.clear();
    } else {
      _cache.remove(clientId);
      _fetchedAt.remove(clientId);
    }
  }
}
