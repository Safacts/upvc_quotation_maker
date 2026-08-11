/// OFFLINE TIER — SELF-BRANDING CONFIG (the "white label by the client" model).
///
/// In the Rs.10,000 Low tier we do NOT build a per-client APK by hand and we do
/// NOT push branding from a server. The client installs one generic APK and
/// brands it themselves on first launch. This object is the complete result of
/// that wizard, and it is the ONLY source of company identity for the PDF.
///
/// Persisted as a single JSON blob in SharedPreferences under [prefsKey].
/// The logo is stored as raw bytes on disk (see `logoPath`) rather than inside
/// the JSON — base64 in SharedPreferences would bloat every read of every
/// setting, and a 4.6 MB logo already burned us once in production (Nexy,
/// 09-08-2026: a 2048x2048 PNG made PDF generation 785x slower).
library;

import 'dart:convert';
import 'package:path/path.dart' as p;

/// The wizard is complete only when these are all satisfied. Company name is
/// the single hard requirement — everything else can be filled in later from
/// Settings, because forcing a 12-field form before first use loses the user.
class BrandConfig {
  final String companyName;
  final String proprietorName;
  final String address;
  final String phone;
  final String email;
  final String gstin;

  /// Absolute path to the copied logo file in app documents. Empty = no logo.
  final String logoPath;

  final String bankName;
  final String bankBranch;
  final String bankAccountName;
  final String bankAccountNo;
  final String bankIfsc;

  /// UPI VPA, e.g. `name@bank`. Empty hides every UPI surface.
  final String upiId;

  /// Quote number prefix, e.g. `JVUPVC`. See `QuoteNumberService`.
  final String quotePrefix;

  /// Next sequence number to be issued. Owned by the counter service; the
  /// wizard only sets the STARTING value so a client migrating from Excel can
  /// continue from quote 348 instead of restarting at 1.
  final int quoteStartNumber;

  final double defaultGstPercentage;
  final bool includeGstByDefault;

  final List<String> termsAndConditions;

  /// ARGB int, matching the encoding used by `ClientConfig`.
  final int primaryColorValue;
  final int accentColorValue;

  /// Set true only after the wizard is completed. Gates the whole app.
  final bool setupComplete;

  final DateTime? brandedAt;

  const BrandConfig({
    this.companyName = '',
    this.proprietorName = '',
    this.address = '',
    this.phone = '',
    this.email = '',
    this.gstin = '',
    this.logoPath = '',
    this.bankName = '',
    this.bankBranch = '',
    this.bankAccountName = '',
    this.bankAccountNo = '',
    this.bankIfsc = '',
    this.upiId = '',
    this.quotePrefix = 'QT',
    this.quoteStartNumber = 1,
    this.defaultGstPercentage = 18.0,
    this.includeGstByDefault = false,
    this.termsAndConditions = defaultTerms,
    this.primaryColorValue = 0xFF6366F1,
    this.accentColorValue = 0xFFEC4899,
    this.setupComplete = false,
    this.brandedAt,
  });

  static const String prefsKey = 'offline_brand_config_v1';

  /// Sensible uPVC-trade defaults so a client who skips the terms step still
  /// ships a professional-looking quotation.
  static const List<String> defaultTerms = <String>[
    'Prices are valid for 15 days from the date of this quotation.',
    '50% advance along with the work order, balance before dispatch.',
    'Delivery within 3-4 weeks from the date of confirmed order and final measurement.',
    'Any deviation from the above specification will be charged extra.',
    'Scaffolding, electricity and water at site to be provided by the customer.',
    'Taxes as applicable at the time of billing.',
  ];

  bool get hasLogo => logoPath.trim().isNotEmpty;

  /// Just the filename portion of [logoPath], e.g. `logo_1691234567890.png`.
  /// Used by BrandService.resolveLogoPath() to re-join onto the current documents
  /// directory when the stored absolute path is dead (iOS UUID change, etc.).
  String get logoFileName =>
      logoPath.trim().isEmpty ? '' : p.basename(logoPath);

  bool get hasBankDetails =>
      bankName.trim().isNotEmpty && bankAccountNo.trim().isNotEmpty;

  bool get hasUpi => upiId.trim().isNotEmpty && upiId.contains('@');

  bool get hasGstin => gstin.trim().length >= 15;

  /// The minimum bar for the app to be usable. Only the company name is
  /// mandatory; the PDF degrades gracefully without anything else.
  bool get isUsable => companyName.trim().isNotEmpty;

  /// Name to show inside the customer's UPI app. Never blank when we have a
  /// company name — a payee reading "Unknown" destroys trust at payment time.
  String get upiPayeeName =>
      bankAccountName.trim().isNotEmpty ? bankAccountName.trim() : companyName;

  String get termsAsString => termsAndConditions
      .asMap()
      .entries
      .map((e) => '${e.key + 1}. ${e.value}')
      .join('\n');

  BrandConfig copyWith({
    String? companyName,
    String? proprietorName,
    String? address,
    String? phone,
    String? email,
    String? gstin,
    String? logoPath,
    String? bankName,
    String? bankBranch,
    String? bankAccountName,
    String? bankAccountNo,
    String? bankIfsc,
    String? upiId,
    String? quotePrefix,
    int? quoteStartNumber,
    double? defaultGstPercentage,
    bool? includeGstByDefault,
    List<String>? termsAndConditions,
    int? primaryColorValue,
    int? accentColorValue,
    bool? setupComplete,
    DateTime? brandedAt,
  }) =>
      BrandConfig(
        companyName: companyName ?? this.companyName,
        proprietorName: proprietorName ?? this.proprietorName,
        address: address ?? this.address,
        phone: phone ?? this.phone,
        email: email ?? this.email,
        gstin: gstin ?? this.gstin,
        logoPath: logoPath ?? this.logoPath,
        bankName: bankName ?? this.bankName,
        bankBranch: bankBranch ?? this.bankBranch,
        bankAccountName: bankAccountName ?? this.bankAccountName,
        bankAccountNo: bankAccountNo ?? this.bankAccountNo,
        bankIfsc: bankIfsc ?? this.bankIfsc,
        upiId: upiId ?? this.upiId,
        quotePrefix: quotePrefix ?? this.quotePrefix,
        quoteStartNumber: quoteStartNumber ?? this.quoteStartNumber,
        defaultGstPercentage:
            defaultGstPercentage ?? this.defaultGstPercentage,
        includeGstByDefault: includeGstByDefault ?? this.includeGstByDefault,
        termsAndConditions: termsAndConditions ?? this.termsAndConditions,
        primaryColorValue: primaryColorValue ?? this.primaryColorValue,
        accentColorValue: accentColorValue ?? this.accentColorValue,
        setupComplete: setupComplete ?? this.setupComplete,
        brandedAt: brandedAt ?? this.brandedAt,
      );

  Map<String, dynamic> toJson() => {
        'companyName': companyName,
        'proprietorName': proprietorName,
        'address': address,
        'phone': phone,
        'email': email,
        'gstin': gstin,
        'logoPath': logoPath,
        'bankName': bankName,
        'bankBranch': bankBranch,
        'bankAccountName': bankAccountName,
        'bankAccountNo': bankAccountNo,
        'bankIfsc': bankIfsc,
        'upiId': upiId,
        'quotePrefix': quotePrefix,
        'quoteStartNumber': quoteStartNumber,
        'defaultGstPercentage': defaultGstPercentage,
        'includeGstByDefault': includeGstByDefault,
        'termsAndConditions': termsAndConditions,
        'primaryColorValue': primaryColorValue,
        'accentColorValue': accentColorValue,
        'setupComplete': setupComplete,
        'brandedAt': brandedAt?.toIso8601String(),
      };

  /// Tolerant of every field being absent or the wrong type — a corrupt or
  /// partially-written config must degrade to defaults, never throw. Throwing
  /// here would brick the app on launch with no way for the user to recover.
  factory BrandConfig.fromJson(Map<String, dynamic> j) {
    String s(String k) => (j[k] is String) ? j[k] as String : '';
    double d(String k, double fallback) =>
        (j[k] is num) ? (j[k] as num).toDouble() : fallback;
    int i(String k, int fallback) =>
        (j[k] is num) ? (j[k] as num).toInt() : fallback;
    bool b(String k, bool fallback) => (j[k] is bool) ? j[k] as bool : fallback;

    final rawTerms = j['termsAndConditions'];
    final terms = (rawTerms is List)
        ? rawTerms.map((e) => e.toString()).where((e) => e.isNotEmpty).toList()
        : defaultTerms;

    return BrandConfig(
      companyName: s('companyName'),
      proprietorName: s('proprietorName'),
      address: s('address'),
      phone: s('phone'),
      email: s('email'),
      gstin: s('gstin'),
      logoPath: s('logoPath'),
      bankName: s('bankName'),
      bankBranch: s('bankBranch'),
      bankAccountName: s('bankAccountName'),
      bankAccountNo: s('bankAccountNo'),
      bankIfsc: s('bankIfsc'),
      upiId: s('upiId'),
      quotePrefix: s('quotePrefix').isEmpty ? 'QT' : s('quotePrefix'),
      quoteStartNumber: i('quoteStartNumber', 1),
      defaultGstPercentage: d('defaultGstPercentage', 18.0),
      includeGstByDefault: b('includeGstByDefault', false),
      termsAndConditions: terms.isEmpty ? defaultTerms : terms,
      primaryColorValue: i('primaryColorValue', 0xFF6366F1),
      accentColorValue: i('accentColorValue', 0xFFEC4899),
      setupComplete: b('setupComplete', false),
      brandedAt: (j['brandedAt'] is String)
          ? DateTime.tryParse(j['brandedAt'] as String)
          : null,
    );
  }

  String encode() => jsonEncode(toJson());

  static BrandConfig decode(String raw) {
    try {
      final obj = jsonDecode(raw);
      if (obj is Map<String, dynamic>) return BrandConfig.fromJson(obj);
    } catch (_) {
      // Corrupt JSON -> unbranded defaults, wizard runs again. Better than a
      // crash loop the user cannot escape without clearing app data.
    }
    return const BrandConfig();
  }
}
