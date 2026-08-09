import 'package:flutter/material.dart';

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
  final List<Map<String, dynamic>> measuredPresets;
  final List<Map<String, dynamic>> unmeasuredPresets;
  
  // Custom Download Links
  final String appDownloadUrl;

  // Supplier company names (kprupvc only)
  final List<String> supplierCompanies;

  /// UPI VPA used to collect payments, e.g. `6304562779@nyes`.
  /// When empty, every UPI QR surface (invoice PDF, payment sheet) hides
  /// itself rather than rendering an unscannable code.
  final String upiId;

  /// Name shown inside the customer's UPI app before they confirm payment.
  /// Falls back to [companyName] via [upiPayeeNameOrCompany] when blank —
  /// a QR whose payee reads "Unknown" destroys trust at the moment of payment.
  final String upiPayeeName;

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
    this.supabaseUrl = 'https://gumpmnbjdtzajhysnnaz.supabase.co',
    this.supabaseAnonKey =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1bXBtbmJqZHR6YWpoeXNubmF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxNjI2NzgsImV4cCI6MjEwMTczODY3OH0.RbzuXFNDM0HXQhdL6Ex1q9s_t1SCejtKmBsYskBwUhs',
    this.adminEmails = const ['jvenkateshupvc@gmail.com'],
    this.landingHeroTitle = '',
    this.landingHeroSubtitle = 'Quality UPVC solutions for your home',
    this.landingHeroImage = '',
    this.landingFeatures = const [],
    this.landingServices = const ['UPVC Windows', 'UPVC Doors', 'Glass Installation', 'Repairs & Maintenance'],
    this.landingGallery = const [],
    this.landingMapUrl = '',
    this.landingAboutTitle = '',
    this.landingAboutText = '',
    this.landingTestimonials = const [],
    this.landingCTA = '',
    this.landingFooter = '',
    this.costMarginPercent = 65.0,
    this.enablePricePresets = false,
    this.measuredPresets = const [],
    this.unmeasuredPresets = const [],
    this.appDownloadUrl = '',
    this.supplierCompanies = const [],
    this.upiId = '',
    this.upiPayeeName = '',
  });

  String get termsAsString => termsAndConditions.asMap().entries.map((e) => '${e.key + 1}. ${e.value}').join('\n');

  /// Payee name for UPI, never blank when a company name exists.
  String get upiPayeeNameOrCompany =>
      upiPayeeName.isNotEmpty ? upiPayeeName : companyName;

  /// True when this client can accept UPI — drives whether QR sections render.
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
    'landingTestimonials': landingTestimonials.map((t) => Map<String, String>.from(t)).toList(),
    'landingCTA': landingCTA,
    'landingFooter': landingFooter,
    'costMarginPercent': costMarginPercent,
    'enablePricePresets': enablePricePresets,
    'measuredPresets': measuredPresets,
    'unmeasuredPresets': unmeasuredPresets,
    'appDownloadUrl': appDownloadUrl,
    'supplierCompanies': supplierCompanies,
    'upiId': upiId,
    'upiPayeeName': upiPayeeName,
  };

  factory ClientConfig.fromJson(Map<String, dynamic> json) => ClientConfig(
    clientId: json['clientId'] as String? ?? 'default',
    appName: json['appName'] as String? ?? 'UPVC Quotation Maker',
    companyName: json['companyName'] as String? ?? '',
    companyAddress: json['companyAddress'] as String? ?? '',
    companyContact: json['companyContact'] as String? ?? '',
    companyEmail: json['companyEmail'] as String? ?? '',
    companyProprietor: json['companyProprietor'] as String? ?? '',
    gstNumber: json['gstNumber'] as String? ?? '',
    bankName: json['bankName'] as String? ?? '',
    bankBranch: json['bankBranch'] as String? ?? '',
    bankAccountNo: json['bankAccountNo'] as String? ?? '',
    bankIfsc: json['bankIfsc'] as String? ?? '',
    termsAndConditions: (json['termsAndConditions'] as List?)?.cast<String>() ?? const [],
    defaultGstPercentage: (json['defaultGstPercentage'] as num?)?.toDouble() ?? 18.0,
    quotePrefix: json['quotePrefix'] as String? ?? '',
    logoUrl: json['logoUrl'] as String? ?? '',
    invoiceTopLogoUrl: json['invoiceTopLogoUrl'] as String? ?? '',
    invoiceBackgroundLogoUrl: json['invoiceBackgroundLogoUrl'] as String? ?? '',
    portalPasswordHash: json['portalPasswordHash'] as String? ?? '',
    primaryColor: Color(json['primaryColor'] as int? ?? 0xFF6366F1),
    accentColor: Color(json['accentColor'] as int? ?? 0xFFEC4899),
    trialExpiresAt: json['trialExpiresAt'] != null ? DateTime.tryParse(json['trialExpiresAt']) : null,
    isActive: json['isActive'] as bool? ?? true,
    supabaseUrl: json['supabaseUrl'] as String? ?? 'https://gumpmnbjdtzajhysnnaz.supabase.co',
    supabaseAnonKey: json['supabaseAnonKey'] as String? ?? '',
    adminEmails: (json['adminEmails'] as List?)?.cast<String>() ?? ['jvenkateshupvc@gmail.com'],
    landingHeroTitle: json['landingHeroTitle'] as String? ?? '',
    landingHeroSubtitle: json['landingHeroSubtitle'] as String? ?? 'Quality UPVC solutions for your home',
    landingHeroImage: json['landingHeroImage'] as String? ?? '',
    landingFeatures: (json['landingFeatures'] as List?)?.cast<String>() ?? const [],
    landingServices: (json['landingServices'] as List?)?.cast<String>() ?? const ['UPVC Windows', 'UPVC Doors', 'Glass Installation', 'Repairs & Maintenance'],
    landingGallery: (json['landingGallery'] as List?)?.cast<String>() ?? const [],
    landingMapUrl: json['landingMapUrl'] as String? ?? '',
    landingAboutTitle: json['landingAboutTitle'] as String? ?? '',
    landingAboutText: json['landingAboutText'] as String? ?? '',
    landingTestimonials: (json['landingTestimonials'] as List?)?.map((e) => Map<String, String>.from(e as Map)).toList() ?? const [],
    landingCTA: json['landingCTA'] as String? ?? '',
    landingFooter: json['landingFooter'] as String? ?? '',
    costMarginPercent: (json['costMarginPercent'] ?? json['cost_margin_percent'] as num?)?.toDouble() ?? 65.0,
    enablePricePresets: json['enablePricePresets'] as bool? ?? false,
    measuredPresets: (json['measuredPresets'] as List?)?.map((e) => Map<String, dynamic>.from(e as Map)).toList() ?? const [],
    unmeasuredPresets: (json['unmeasuredPresets'] as List?)?.map((e) => Map<String, dynamic>.from(e as Map)).toList() ?? const [],
    appDownloadUrl: json['appDownloadUrl'] as String? ?? '',
    supplierCompanies: (json['supplierCompanies'] as List?)?.cast<String>() ?? const [],
    // Accept both camelCase (app/console config) and snake_case (raw DB row),
    // matching the tolerance already applied to costMarginPercent above.
    upiId: (json['upiId'] ?? json['upi_id']) as String? ?? '',
    upiPayeeName: (json['upiPayeeName'] ?? json['upi_payee_name']) as String? ?? '',
  );
}

