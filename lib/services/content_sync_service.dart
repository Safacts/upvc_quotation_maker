import 'dart:async';
import 'package:flutter/foundation.dart';

import 'offline_database.dart';
import 'sync_engine.dart';
import '../models_extra.dart';

/// Content sync service that manages the synchronization of dynamic content
/// such as product catalogs, pricing templates, and terms.
///
/// This service coordinates between the offline database and the sync engine
/// to ensure content is always up-to-date.
class ContentSyncService {
  ContentSyncService._();
  static final ContentSyncService instance = ContentSyncService._();

  final OfflineDatabase _db = OfflineDatabase.instance;
  final SyncEngine _syncEngine = SyncEngine.instance;

  /// Initialize the content sync service.
  Future<void> initialize() async {
    await _db.initialize();
    debugPrint('ContentSyncService initialized');
  }

  /// Get products for a client, using offline cache when available.
  Future<List<Product>> getProducts(String clientId, {bool forceRefresh = false}) async {
    // If not forcing refresh, try to get from local cache first
    if (!forceRefresh) {
      final cached = await _db.getProducts(clientId);
      if (cached.isNotEmpty) {
        return cached;
      }
    }

    // Fetch from server via catalog service pattern
    // (The actual Supabase fetch is handled by CatalogService)
    // This service just manages the caching
    return [];
  }

  /// Get measured products (unit = SFT).
  Future<List<Product>> getMeasuredProducts(String clientId) async {
    final all = await _db.getProducts(clientId);
    return all.where((p) => p.isMeasured).toList();
  }

  /// Get unmeasured products (unit != SFT).
  Future<List<Product>> getUnmeasuredProducts(String clientId) async {
    final all = await _db.getProducts(clientId);
    return all.where((p) => !p.isMeasured).toList();
  }

  /// Get distinct categories.
  Future<List<String>> getCategories(String clientId) async {
    return _db.getCategories(clientId);
  }

  /// Cache products from server response.
  Future<void> cacheProducts(List<Product> products, String clientId) async {
    await _db.upsertProducts(products, clientId);
  }

  /// Get the last sync time for a content type.
  Future<DateTime?> getLastSyncTime(String contentType) async {
    return _db.getContentSyncTime(contentType);
  }

  /// Check if content needs syncing.
  bool needsSync(DateTime? lastSync, {Duration maxAge = const Duration(minutes: 5)}) {
    if (lastSync == null) return true;
    return DateTime.now().difference(lastSync) > maxAge;
  }

  /// Force a sync of all content.
  Future<void> forceSync(String clientId) async {
    await _syncEngine.syncAll(clientId: clientId);
  }

  /// Get sync status information.
  Future<Map<String, dynamic>> getSyncStatus(String clientId) async {
    final pendingCount = await _db.getPendingSyncCount(clientId);
    final lastSync = await _db.getContentSyncTime('all');

    return {
      'pending_count': pendingCount,
      'last_sync': lastSync?.toIso8601String(),
      'is_syncing': _syncEngine.isSyncing,
    };
  }
}
