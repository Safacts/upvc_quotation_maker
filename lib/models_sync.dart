/// Data models for the in-app update mechanism (migration 014).
///
/// Kept OUT of `models.dart` (pricing parity contract) and `models_extra.dart`
/// (Phase 5 mobile features) deliberately. These models are for the offline
/// sync engine and feature flag system.

library;

// ---------------------------------------------------------------------------
// SyncStatus — tracking sync state for local records
// ---------------------------------------------------------------------------

/// The sync status of a local record.
enum SyncStatus {
  synced,
  pendingCreated,
  pendingUpdated,
  pendingDeleted,
  conflict,
}

extension SyncStatusLabel on SyncStatus {
  String get value {
    switch (this) {
      case SyncStatus.synced:
        return 'synced';
      case SyncStatus.pendingCreated:
        return 'pending_created';
      case SyncStatus.pendingUpdated:
        return 'pending_updated';
      case SyncStatus.pendingDeleted:
        return 'pending_deleted';
      case SyncStatus.conflict:
        return 'conflict';
    }
  }

  static SyncStatus fromString(String? s) {
    switch (s) {
      case 'pending_created':
        return SyncStatus.pendingCreated;
      case 'pending_updated':
        return SyncStatus.pendingUpdated;
      case 'pending_deleted':
        return SyncStatus.pendingDeleted;
      case 'conflict':
        return SyncStatus.conflict;
      default:
        return SyncStatus.synced;
    }
  }
}

// ---------------------------------------------------------------------------
// ContentManifestItem — version tracking for syncable content
// ---------------------------------------------------------------------------

/// A single entry in the content manifest, tracking the version of a content type.
class ContentManifestItem {
  ContentManifestItem({
    required this.contentType,
    required this.version,
    required this.lastModified,
    this.checksum = '',
    this.itemCount = 0,
  });

  /// The type of content: 'products', 'pricing_templates', 'terms', etc.
  final String contentType;

  /// Monotonic version number that increments on every change.
  final int version;

  /// Timestamp of the last modification.
  final DateTime lastModified;

  /// MD5 hash of the content for integrity verification.
  final String checksum;

  /// Number of items in this content type.
  final int itemCount;

  static ContentManifestItem fromMap(Map<String, dynamic> map) {
    return ContentManifestItem(
      contentType: (map['content_type'] ?? '') as String,
      version: (map['version'] as num?)?.toInt() ?? 1,
      lastModified: map['last_modified'] != null
          ? DateTime.tryParse(map['last_modified'].toString())?.toLocal() ??
              DateTime.now()
          : DateTime.now(),
      checksum: (map['checksum'] ?? '') as String,
      itemCount: (map['item_count'] as num?)?.toInt() ?? 0,
    );
  }
}

// ---------------------------------------------------------------------------
// FeatureFlag — per-tier feature toggle
// ---------------------------------------------------------------------------

/// A feature flag that controls whether a feature is available.
class FeatureFlag {
  FeatureFlag({
    required this.featureKey,
    required this.enabled,
    this.description = '',
  });

  /// Unique identifier for the feature.
  final String featureKey;

  /// Whether the feature is enabled.
  final bool enabled;

  /// Human-readable description of the feature.
  final String description;

  static FeatureFlag fromMap(Map<String, dynamic> map) {
    return FeatureFlag(
      featureKey: (map['feature_key'] ?? '') as String,
      enabled: (map['enabled'] as bool?) ?? false,
      description: (map['description'] ?? '') as String,
    );
  }
}

// ---------------------------------------------------------------------------
// SyncResult — result of a sync operation
// ---------------------------------------------------------------------------

/// The result of a sync operation.
class SyncResult {
  SyncResult({
    required this.success,
    this.itemsSynced = 0,
    this.itemsFailed = 0,
    this.errorMessage = '',
    this.syncType = 'pull',
    this.durationMs = 0,
  });

  /// Whether the sync was successful.
  final bool success;

  /// Number of items successfully synced.
  final int itemsSynced;

  /// Number of items that failed to sync.
  final int itemsFailed;

  /// Error message if sync failed.
  final String errorMessage;

  /// Type of sync: 'push', 'pull', 'bidirectional'.
  final String syncType;

  /// Duration of the sync in milliseconds.
  final int durationMs;
}

// ---------------------------------------------------------------------------
// WhiteLabelConfig — dynamic branding configuration
// ---------------------------------------------------------------------------

/// Dynamic white-labeling configuration from the server.
class WhiteLabelConfig {
  WhiteLabelConfig({
    this.logoUrl = '',
    this.primaryColor = 0xFF6366F1,
    this.accentColor = 0xFFEC4899,
    this.companyName = '',
    this.appName = '',
    this.invoiceTopLogoUrl = '',
    this.invoiceBackgroundLogoUrl = '',
    this.version = 1,
    DateTime? lastModified,
  }) : lastModified = lastModified ?? DateTime.now();

  final String logoUrl;
  final int primaryColor;
  final int accentColor;
  final String companyName;
  final String appName;
  final String invoiceTopLogoUrl;
  final String invoiceBackgroundLogoUrl;
  final int version;
  final DateTime lastModified;

  WhiteLabelConfig copyWith({
    String? logoUrl,
    int? primaryColor,
    int? accentColor,
    String? companyName,
    String? appName,
    String? invoiceTopLogoUrl,
    String? invoiceBackgroundLogoUrl,
    int? version,
    DateTime? lastModified,
  }) {
    return WhiteLabelConfig(
      logoUrl: logoUrl ?? this.logoUrl,
      primaryColor: primaryColor ?? this.primaryColor,
      accentColor: accentColor ?? this.accentColor,
      companyName: companyName ?? this.companyName,
      appName: appName ?? this.appName,
      invoiceTopLogoUrl: invoiceTopLogoUrl ?? this.invoiceTopLogoUrl,
      invoiceBackgroundLogoUrl:
          invoiceBackgroundLogoUrl ?? this.invoiceBackgroundLogoUrl,
      version: version ?? this.version,
      lastModified: lastModified ?? this.lastModified,
    );
  }

  static WhiteLabelConfig fromServerResponse(Map<String, dynamic> json) {
    final config = (json['config'] as Map?)?.cast<String, dynamic>() ?? {};
    return WhiteLabelConfig(
      logoUrl: (config['logo_url'] ?? '') as String,
      primaryColor: (config['primary_color'] as num?)?.toInt() ?? 0xFF6366F1,
      accentColor: (config['accent_color'] as num?)?.toInt() ?? 0xFFEC4899,
      companyName: (config['company_name'] ?? '') as String,
      appName: (config['app_name'] ?? '') as String,
      invoiceTopLogoUrl: (config['invoice_top_logo_url'] ?? '') as String,
      invoiceBackgroundLogoUrl:
          (config['invoice_background_logo_url'] ?? '') as String,
      version: (json['version'] as num?)?.toInt() ?? 1,
      lastModified: json['last_modified'] != null
          ? DateTime.tryParse(json['last_modified'].toString())?.toLocal() ??
              DateTime.now()
          : DateTime.now(),
    );
  }
}

// ---------------------------------------------------------------------------
// SyncableRecord — base interface for syncable records
// ---------------------------------------------------------------------------

/// Base class for records that can be synced between local and server.
abstract class SyncableRecord {
  String? get id;
  String get tableName;
  String get clientId;
  SyncStatus get syncStatus;
  DateTime get updatedAt;
  Map<String, dynamic> toMap();
  Map<String, dynamic> toSyncMap();
}
