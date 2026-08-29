import 'dart:convert';

import 'package:flutter/material.dart';

import '../supabase_config.dart';

class ClientConfig {
  final String clientId;
  final String appName;
  final String companyName;
  final String companyAddress;
  final String companyContact;
  final String companyEmail;
  final String companyProprietor;
  final String gstNumber;
  final String bankName;
  final String bankBranch;
  final String bankAccountNo;
  final String bankIfsc;
  final List<String> termsAndConditions;
  final double defaultGstPercentage;
  final String quotePrefix;
  final String logoUrl;
  final String invoiceTopLogoUrl;
  final String invoiceBackgroundLogoUrl;
  final String portalPasswordHash;
  final Color primaryColor;
  final Color accentColor;
  final DateTime? trialExpiresAt;
  final bool isActive;
  final String supabaseUrl;
  final String supabaseAnonKey;
  final List<String> adminEmails;
  final String landingHeroTitle;
  final String landingHeroSubtitle;
  final String landingHeroImage;
  final List<String> landingFeatures;
  final List<String> landingServices;
  final List<String> landingGallery;
  final String landingMapUrl;
  final String landingAboutTitle;
  final String landingAboutText;
  final List<Map<String, String>> landingTestimonials;
  final String landingCTA;
  final String landingFooter;
  // Price Customizations & Presets
  final double costMarginPercent;
  final bool enablePricePresets;
  final bool enableRateCard;
  final List<Map<String, dynamic>> measuredPresets;
  final List<Map<String, dynamic>> unmeasuredPresets;

  // Custom Download Links
  final String appDownloadUrl;

  /// Latest APK version name published for this client (e.g. "1.0.1").
  /// Written by the APK CI after a successful build; empty when no build yet.
  final String appVersionName;

  /// Latest APK version code (integer) published for this client.
  /// Written by the APK CI after a successful build; 0 when no build yet.
  final int appVersionCode;

  /// Release notes for the latest APK (shown in the update dialog).
  final String appReleaseNotes;

  /// When true the update dialog is non-dismissable (mandatory update).
  final bool forceUpdate;

  // Supplier company names (kprupvc only)
  final List<String> supplierCompanies;

  /// UPI VPA used to collect payments, e.g. `6304562779@nyes`.
  /// When empty, every UPI QR surface (invoice PDF, payment sheet) hides
  /// itself rather than rendering an unscannable code.
  final String upiId;

  /// Name shown inside the customer's UPI app before they confirm payment.
  /// Falls back to [companyName] via [upiPayeeNameOrCompany] when blank.
  /// a QR whose payee reads "Unknown" destroys trust at the moment of payment.
  final String upiPayeeName;

  // SSO-pending state for tenant switching
  final bool isSsoPending;
  final String? ssoCurrentClientId;

  const ClientConfig({
    this.clientId = 'default',
    this.appName = 'UPVC Quotation Maker',
    this.companyName = '',
    this.companyAddress = '',
    this.companyContact = '',
    this.companyEmail = '',
    this.companyProprietor = '',
    this.gstNumber = '',
    this.bankName = '',
    this.bankBranch = '',
    this.bankAccountNo = '',
    this.bankIfsc = '',
    this.termsAndConditions = const [],
    this.defaultGstPercentage = 18.0,
    this.quotePrefix = '',
    this.logoUrl = '',
    this.invoiceTopLogoUrl = '',
    this.invoiceBackgroundLogoUrl = '',
    this.portalPasswordHash = '',
    this.primaryColor = const Color(0xFF6366F1),
    this.accentColor = const Color(0xFFEC4899),
    this.trialExpiresAt,
    this.isActive = true,
    this.supabaseUrl = 'https://jqjxhhgfwdzckijnnede.supabase.co',
    this.supabaseAnonKey =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxanhoaGdmd2R6Y2tpam5uZWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NTY3MTYsImV4cCI6MjEwMzIzMjcxNn0.rOx-8Y_aT0pNVdvZMxRUx8feP2ZU1OBlF63oLH6nAnY',
    this.adminEmails = const ['vitarn.dev@gmail.com'],
    this.landingHeroTitle = '',
    this.landingHeroSubtitle = 'Quality UPVC solutions for your home',
    this.landingHeroImage = '',
    this.landingFeatures = const [],
    this.landingServices = const [
      'UPVC Windows',
      'UPVC Doors',
      'Glass Installation',
      'Repairs & Maintenance',
    ],
    this.landingGallery = const [],
    this.landingMapUrl = '',
    this.landingAboutTitle = '',
    this.landingAboutText = '',
    this.landingTestimonials = const [],
    this.landingCTA = '',
    this.landingFooter = '',
    this.costMarginPercent = 65.0,
    this.enablePricePresets = false,
    this.enableRateCard = false,
    this.measuredPresets = const [],
    this.unmeasuredPresets = const [],
    this.appDownloadUrl = '',
    this.appVersionName = '',
    this.appVersionCode = 0,
    this.appReleaseNotes = '',
    this.forceUpdate = false,
    this.supplierCompanies = const [],
    this.upiId = '',
    this.upiPayeeName = '',
    this.isSsoPending = false,
    this.ssoCurrentClientId,
  });

  // Factory for SSO-pending state (tenant switch required)
  factory ClientConfig.ssoPending({
    required String clientId,
    required String currentClientId,
  }) = SsoPendingClientConfig;

  String get termsAsString => termsAndConditions
      .asMap()
      .entries
      // Config rows may already contain a stored list number. Strip it before
      // applying the renderer's single authoritative numbering pass.
      .map(
        (e) =>
            '${e.key + 1}. ${e.value.replaceFirst(RegExp(r'^\s*(?:\d+\s*[.)]\s*)+'), '')}',
      )
      .join('\n');

  /// jsonb tolerance helpers. A config writer that stores `"appVersionCode": "14"`
  /// (string) or a non-string in ANY of these fields must not silently zero the
  /// updater's comparison input — or throw and kill the whole client config.
  static int _asInt(Object? v) {
    if (v is num) return v.toInt();
    if (v is String) return int.tryParse(v.trim()) ?? 0;
    return 0;
  }

  static int _asIntOr(Object? v, int fallback) {
    if (v is num) return v.toInt();
    if (v is String) return int.tryParse(v.trim()) ?? fallback;
    return fallback;
  }

  static double _asDoubleOr(Object? v, double fallback) {
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v.trim()) ?? fallback;
    return fallback;
  }

  static String _asString(Object? v) => v == null ? '' : v.toString();

  static String _asStringOr(Object? v, String fallback) {
    if (v == null) return fallback;
    final value = v.toString();
    return value.isEmpty ? fallback : value;
  }

  static bool _asBool(Object? v) {
    if (v is bool) return v;
    if (v is num) return v != 0;
    if (v is String) return v.trim().toLowerCase() == 'true' || v.trim() == '1';
    return false;
  }

  static bool _asBoolOr(Object? v, bool fallback) {
    if (v == null) return fallback;
    if (v is bool) return v;
    if (v is num) return v != 0;
    if (v is String) {
      final value = v.trim().toLowerCase();
      if (value == 'true' || value == '1') return true;
      if (value == 'false' || value == '0') return false;
    }
    return fallback;
  }

  static List<dynamic>? _asList(Object? value) {
    if (value is List) return value;
    if (value is String && value.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(value);
        if (decoded is List) return decoded;
      } catch (_) {
        return [value];
      }
    }
    return null;
  }

  static List<String> _asStringList(
    Object? value, {
    List<String> fallback = const [],
  }) {
    if (value == null) return fallback;
    final list = _asList(value);
    if (list == null) return fallback;
    return list.map((item) => item.toString()).toList();
  }

  static List<Map<String, dynamic>> _asDynamicMapList(Object? value) {
    final list = _asList(value);
    if (list == null) return const [];
    return list
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  static List<Map<String, String>> _asStringMapList(Object? value) {
    final list = _asList(value);
    if (list == null) return const [];
    return list.whereType<Map>().map((item) {
      return item.map(
        (key, mapValue) => MapEntry(key.toString(), mapValue.toString()),
      );
    }).toList();
  }

  /// Payee name for UPI, never blank when a company name exists.
  String get upiPayeeNameOrCompany =>
      upiPayeeName.isNotEmpty ? upiPayeeName : companyName;

  /// True when this client can accept UPI and QR sections should render.
  bool get hasUpi => upiId.trim().isNotEmpty && upiId.contains('@');

  Map<String, dynamic> toJson() => {
    'clientId': clientId,
    'appName': appName,
    'companyName': companyName,
    'companyAddress': companyAddress,
    'companyContact': companyContact,
    'companyEmail': companyEmail,
    'companyProprietor': companyProprietor,
    'gstNumber': gstNumber,
    'bankName': bankName,
    'bankBranch': bankBranch,
    'bankAccountNo': bankAccountNo,
    'bankIfsc': bankIfsc,
    'termsAndConditions': termsAndConditions,
    'defaultGstPercentage': defaultGstPercentage,
    'quotePrefix': quotePrefix,
    'logoUrl': logoUrl,
    'invoiceTopLogoUrl': invoiceTopLogoUrl,
    'invoiceBackgroundLogoUrl': invoiceBackgroundLogoUrl,
    'portalPasswordHash': portalPasswordHash,
    'primaryColor': primaryColor.toARGB32(),
    'accentColor': accentColor.toARGB32(),
    'trialExpiresAt': trialExpiresAt?.toIso8601String(),
    'isActive': isActive,
    'supabaseUrl': supabaseUrl,
    'supabaseAnonKey': supabaseAnonKey,
    'adminEmails': adminEmails,
    'landingHeroTitle': landingHeroTitle,
    'landingHeroSubtitle': landingHeroSubtitle,
    'landingHeroImage': landingHeroImage,
    'landingFeatures': landingFeatures,
    'landingServices': landingServices,
    'landingGallery': landingGallery,
    'landingMapUrl': landingMapUrl,
    'landingAboutTitle': landingAboutTitle,
    'landingAboutText': landingAboutText,
    'landingTestimonials':
        landingTestimonials.map((t) => Map<String, String>.from(t)).toList(),
    'landingCTA': landingCTA,
    'landingFooter': landingFooter,
    'costMarginPercent': costMarginPercent,
    'enablePricePresets': enablePricePresets,
    'enableRateCard': enableRateCard,
    'measuredPresets': measuredPresets,
    'unmeasuredPresets': unmeasuredPresets,
    'appDownloadUrl': appDownloadUrl,
    'appVersionName': appVersionName,
    'appVersionCode': appVersionCode,
    'appReleaseNotes': appReleaseNotes,
    'forceUpdate': forceUpdate,
    'supplierCompanies': supplierCompanies,
    'upiId': upiId,
    'upiPayeeName': upiPayeeName,
  };

  factory ClientConfig.fromJson(Map<String, dynamic> json) => ClientConfig(
    clientId: _asStringOr(json['clientId'], 'default'),
    appName: _asStringOr(json['appName'], 'UPVC Quotation Maker'),
    companyName: _asString(json['companyName']),
    companyAddress: _asString(json['companyAddress']),
    companyContact: _asString(json['companyContact']),
    companyEmail: _asString(json['companyEmail']),
    companyProprietor: _asString(json['companyProprietor']),
    gstNumber: _asString(json['gstNumber']),
    bankName: _asString(json['bankName']),
    bankBranch: _asString(json['bankBranch']),
    bankAccountNo: _asString(json['bankAccountNo']),
    bankIfsc: _asString(json['bankIfsc']),
    termsAndConditions: _asStringList(json['termsAndConditions']),
    defaultGstPercentage: _asDoubleOr(json['defaultGstPercentage'], 18.0),
    quotePrefix: _asString(json['quotePrefix']),
    logoUrl: _asString(json['logoUrl']),
    invoiceTopLogoUrl: _asString(json['invoiceTopLogoUrl']),
    invoiceBackgroundLogoUrl: _asString(json['invoiceBackgroundLogoUrl']),
    portalPasswordHash: _asString(json['portalPasswordHash']),
    primaryColor: Color(_asIntOr(json['primaryColor'], 0xFF6366F1)),
    accentColor: Color(_asIntOr(json['accentColor'], 0xFFEC4899)),
    trialExpiresAt:
        json['trialExpiresAt'] != null
            ? DateTime.tryParse(json['trialExpiresAt'].toString())
            : null,
    isActive: _asBoolOr(json['isActive'], true),
    supabaseUrl: _asStringOr(
      json['supabaseUrl'],
      'https://jqjxhhgfwdzckijnnede.supabase.co',
    ),
    // Public config responses intentionally redact credentials. Falling back
    // to the build-time anon key keeps cloud sync working when the remote
    // client payload omits it, while never putting a service-role key here.
    supabaseAnonKey: _asStringOr(
      json['supabaseAnonKey'],
      SupabaseConfig.supabaseAnonKey,
    ),
    adminEmails: _asStringList(
      json['adminEmails'],
      fallback: const ['vitarn.dev@gmail.com'],
    ),
    landingHeroTitle: _asString(json['landingHeroTitle']),
    landingHeroSubtitle: _asStringOr(
      json['landingHeroSubtitle'],
      'Quality UPVC solutions for your home',
    ),
    landingHeroImage: _asString(json['landingHeroImage']),
    landingFeatures: _asStringList(json['landingFeatures']),
    landingServices: _asStringList(
      json['landingServices'],
      fallback: const [
        'UPVC Windows',
        'UPVC Doors',
        'Glass Installation',
        'Repairs & Maintenance',
      ],
    ),
    landingGallery: _asStringList(json['landingGallery']),
    landingMapUrl: _asString(json['landingMapUrl']),
    landingAboutTitle: _asString(json['landingAboutTitle']),
    landingAboutText: _asString(json['landingAboutText']),
    landingTestimonials: _asStringMapList(json['landingTestimonials']),
    landingCTA: _asString(json['landingCTA']),
    landingFooter: _asString(json['landingFooter']),
    costMarginPercent: _asDoubleOr(
      json['costMarginPercent'] ?? json['cost_margin_percent'],
      65.0,
    ),
    enablePricePresets: _asBool(json['enablePricePresets']),
    enableRateCard: _asBool(json['enableRateCard']),
    measuredPresets: _asDynamicMapList(json['measuredPresets']),
    unmeasuredPresets: _asDynamicMapList(json['unmeasuredPresets']),
    appDownloadUrl: _asString(
      json['appDownloadUrl'] ?? json['app_download_url'],
    ),
    // Version fields for the in-app APK updater. Tolerate camelCase config
    // writes and snake_case raw DB rows, like costMarginPercent above.
    appVersionName: _asString(
      json['appVersionName'] ?? json['app_version_name'],
    ),
    appVersionCode: _asInt(json['appVersionCode'] ?? json['app_version_code']),
    appReleaseNotes: _asString(
      json['appReleaseNotes'] ?? json['app_release_notes'],
    ),
    forceUpdate: _asBool(json['forceUpdate'] ?? json['force_update']),
    supplierCompanies: _asStringList(json['supplierCompanies']),
    // Accept both camelCase (app/console config) and snake_case (raw DB row),
    // matching the tolerance already applied to costMarginPercent above.
    upiId: (json['upiId'] ?? json['upi_id']) as String? ?? '',
    upiPayeeName:
        (json['upiPayeeName'] ?? json['upi_payee_name']) as String? ?? '',
  );
}

// Private subclass for SSO-pending state (tenant switch required)
class SsoPendingClientConfig extends ClientConfig {
  const SsoPendingClientConfig({
    required super.clientId,
    required String currentClientId,
  }) : super(isSsoPending: true, ssoCurrentClientId: currentClientId);

  @override
  bool get isSsoPending => true;
}
