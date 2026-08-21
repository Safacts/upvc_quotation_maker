import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'config/client_config.dart';
import 'services/feature_flag_service.dart';
import 'services/white_label_service.dart';
import 'favicon_service.dart';

/// Element density options for UI customization.
enum ElementDensity { compact, comfortable, spacious }

extension ElementDensityLabel on ElementDensity {
  String get label {
    switch (this) {
      case ElementDensity.compact:
        return 'Compact';
      case ElementDensity.comfortable:
        return 'Comfortable';
      case ElementDensity.spacious:
        return 'Spacious';
    }
  }

  /// Multiplier applied to padding/spacing values.
  double get multiplier {
    switch (this) {
      case ElementDensity.compact:
        return 0.7;
      case ElementDensity.comfortable:
        return 1.0;
      case ElementDensity.spacious:
        return 1.4;
    }
  }
}

class AppState extends ChangeNotifier {
  ClientConfig? _clientConfig;
  bool _isDarkMode = false;
  String _companyName = '';
  String _companyAddress = '';
  String _companyContact = '';
  String _companyEmail = '';
  String _bankName = '';
  String _bankBranch = '';
  String _bankAccountNo = '';
  String _bankIfsc = '';
  String _termsAndConditions = '';
  double _defaultGstPercentage = 18.0;
  String _companyProprietor = '';
  String _gstNumber = '';
  List<String> _supplierCompanies = [];

  // UI customization state
  double _fontScale = 1.0;
  ElementDensity _elementDensity = ElementDensity.comfortable;
  bool _loaded = false;

  // Feature toggles (persisted locally)
  bool _enableSitePhotos = true;
  bool _enablePdfLink = true; // true = PDF, false = Link for quotation sharing

  // Trial expiry warning state
  String _trialWarning = ''; // '', 'TRIAL_EXPIRING_SOON', 'TRIAL_EXPIRED'
  int _trialDaysRemaining = -1; // -1 = unknown / not applicable

  ClientConfig get clientConfig => _clientConfig ?? ClientConfig();

  String get companyName => _companyName.isNotEmpty ? _companyName : clientConfig.companyName;
  String get companyAddress => _companyAddress.isNotEmpty ? _companyAddress : clientConfig.companyAddress;
  String get companyContact => _companyContact.isNotEmpty ? _companyContact : clientConfig.companyContact;
  String get companyEmail => _companyEmail.isNotEmpty ? _companyEmail : clientConfig.companyEmail;
  String get bankName => _bankName.isNotEmpty ? _bankName : clientConfig.bankName;
  String get bankBranch => _bankBranch.isNotEmpty ? _bankBranch : clientConfig.bankBranch;
  String get bankAccountNo => _bankAccountNo.isNotEmpty ? _bankAccountNo : clientConfig.bankAccountNo;
  String get bankIfsc => _bankIfsc.isNotEmpty ? _bankIfsc : clientConfig.bankIfsc;
  String get termsAndConditions => _termsAndConditions.isNotEmpty ? _termsAndConditions : clientConfig.termsAsString;
  double get defaultGstPercentage => _defaultGstPercentage;
  String get companyProprietor => _companyProprietor.isNotEmpty ? _companyProprietor : clientConfig.companyProprietor;
  String get gstNumber => _gstNumber.isNotEmpty ? _gstNumber : clientConfig.gstNumber;
  List<String> get supplierCompanies => _supplierCompanies.isNotEmpty ? _supplierCompanies : clientConfig.supplierCompanies;
  bool get isDarkMode => _isDarkMode;
  double get fontScale => _fontScale;
  ElementDensity get elementDensity => _elementDensity;
  String get appName => clientConfig.appName;
  String get quotePrefix => clientConfig.quotePrefix;
  List<String> get adminEmails => clientConfig.adminEmails;
  double get costMarginPercent => clientConfig.costMarginPercent;

  // ---------------------------------------------------------------------------
  // Feature flags
  // ---------------------------------------------------------------------------

  /// Whether offline mode is enabled.
  bool get offlineMode => FeatureFlagService.instance.offlineMode;

  /// Whether product catalog is enabled.
  bool get productCatalog => FeatureFlagService.instance.productCatalog;

  /// Whether push notifications are enabled.
  bool get pushNotifications => FeatureFlagService.instance.pushNotifications;

  /// Whether customer history is enabled.
  bool get customerHistory => FeatureFlagService.instance.customerHistory;

  /// Whether site photos are enabled.
  bool get sitePhotos => FeatureFlagService.instance.sitePhotos;

  /// Whether UPI QR is enabled.
  bool get upiQr => FeatureFlagService.instance.upiQr;

  /// Whether analytics is enabled.
  bool get analytics => FeatureFlagService.instance.analytics;

  /// Whether Excel export is enabled.
  bool get excelExport => FeatureFlagService.instance.excelExport;

  /// Whether WhatsApp sharing is enabled.
  bool get whatsappShare => FeatureFlagService.instance.whatsappShare;

  /// Whether email portal is enabled.
  bool get emailPortal => FeatureFlagService.instance.emailPortal;

  /// Whether GST invoices are enabled.
  bool get gstInvoices => FeatureFlagService.instance.gstInvoices;

  /// Get the current tier.
  String get tier => FeatureFlagService.instance.tier;

  /// Whether site photos are enabled in Quotation Maker (local toggle, persisted in SharedPreferences).
  bool get enableSitePhotos => _enableSitePhotos;

  /// Whether to use PDF (true) or Link (false) for quotation sharing (local toggle, persisted in SharedPreferences).
  bool get enablePdfLink => _enablePdfLink;

  /// Toggle site photos visibility in Quotation Maker.
  Future<void> setEnableSitePhotos(bool value) async {
    _enableSitePhotos = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('enable_site_photos', value);
    notifyListeners();
  }

  /// Toggle PDF vs Link for quotation sharing.
  Future<void> setEnablePdfLink(bool value) async {
    _enablePdfLink = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('enable_pdf_link', value);
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // White-label config
  // ---------------------------------------------------------------------------

  /// Get the dynamic logo URL (overrides static config if set).
  String get dynamicLogoUrl {
    final wlConfig = WhiteLabelService.instance.config;
    return wlConfig.logoUrl.isNotEmpty ? wlConfig.logoUrl : clientConfig.logoUrl;
  }

  /// Get the dynamic primary color.
  Color get dynamicPrimaryColor {
    final wlConfig = WhiteLabelService.instance.config;
    return Color(wlConfig.primaryColor);
  }

  /// Get the dynamic accent color.
  Color get dynamicAccentColor {
    final wlConfig = WhiteLabelService.instance.config;
    return Color(wlConfig.accentColor);
  }

  /// Get the dynamic invoice top logo URL.
  String get dynamicInvoiceTopLogoUrl {
    final wlConfig = WhiteLabelService.instance.config;
    return wlConfig.invoiceTopLogoUrl.isNotEmpty
        ? wlConfig.invoiceTopLogoUrl
        : clientConfig.invoiceTopLogoUrl;
  }

  /// Get the dynamic invoice background logo URL.
  String get dynamicInvoiceBackgroundLogoUrl {
    final wlConfig = WhiteLabelService.instance.config;
    return wlConfig.invoiceBackgroundLogoUrl.isNotEmpty
        ? wlConfig.invoiceBackgroundLogoUrl
        : clientConfig.invoiceBackgroundLogoUrl;
  }

  /// Trial warning status — '' (none), 'TRIAL_EXPIRING_SOON', 'TRIAL_EXPIRED'.
  String get trialWarning => _trialWarning;

  /// Days remaining in the trial. -1 when unknown / not applicable.
  int get trialDaysRemaining => _trialDaysRemaining;

  /// Whether the trial has fully expired (blocking state).
  bool get isTrialExpired => _trialWarning == 'TRIAL_EXPIRED';

  /// Whether the trial is expiring soon (within 2 days).
  bool get isTrialExpiringSoon => _trialWarning == 'TRIAL_EXPIRING_SOON';

  /// Set the trial warning from the login response.
  /// Call this immediately after a successful login.
  void setTrialWarning({required String warning, int daysRemaining = -1}) {
    _trialWarning = warning;
    _trialDaysRemaining = daysRemaining;
    notifyListeners();
  }

  /// Clear the trial warning (e.g. on logout).
  void clearTrialWarning() {
    _trialWarning = '';
    _trialDaysRemaining = -1;
    notifyListeners();
  }

  AppState() {
    _loadSettings();
  }

  Future<void> applyClientConfig(ClientConfig config) async {
    _clientConfig = config;

    // Source of truth is the client config (per-client branding/settings).
    // Always overwrite the in-memory values so each client sees its OWN
    // company name, address, bank details, etc. (not the first-loaded client).
    _companyName = config.companyName;
    _companyAddress = config.companyAddress;
    _companyContact = config.companyContact;
    _companyEmail = config.companyEmail;
    _bankName = config.bankName;
    _bankBranch = config.bankBranch;
    _bankAccountNo = config.bankAccountNo;
    _bankIfsc = config.bankIfsc;
    _termsAndConditions = config.termsAsString;
    _defaultGstPercentage = config.defaultGstPercentage;
    _companyProprietor = config.companyProprietor;
    _gstNumber = config.gstNumber;
    _supplierCompanies = config.supplierCompanies;

    FaviconService.setFromUrl(config.logoUrl);

    notifyListeners();
  }

  void _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    _isDarkMode = prefs.getBool('isDarkMode') ?? false;
    _companyName = prefs.getString('companyName') ?? '';
    _companyAddress = prefs.getString('companyAddress') ?? '';
    _companyContact = prefs.getString('companyContact') ?? '';
    _companyEmail = prefs.getString('companyEmail') ?? '';
    _bankName = prefs.getString('bankName') ?? '';
    _bankBranch = prefs.getString('bankBranch') ?? '';
    _bankAccountNo = prefs.getString('bankAccountNo') ?? '';
    _bankIfsc = prefs.getString('bankIfsc') ?? '';
    _termsAndConditions = prefs.getString('termsAndConditions') ?? '';
    _defaultGstPercentage = prefs.getDouble('defaultGstPercentage') ?? 18.0;
    _companyProprietor = prefs.getString('companyProprietor') ?? '';
    _gstNumber = prefs.getString('gstNumber') ?? '';
    _supplierCompanies = prefs.getStringList('supplierCompanies') ?? [];
    // Feature toggles (persisted locally)
    _enableSitePhotos = prefs.getBool('enable_site_photos') ?? true;
    _enablePdfLink = prefs.getBool('enable_pdf_link') ?? true;
    // BUGFIX: Only apply loaded values if no explicit update has been made
    // since the constructor fired _loadSettings. Without this guard, a late-
    // completing _loadSettings could overwrite user changes made via
    // updateUiPreferences before the async load finished.
    if (!_loaded) {
      _fontScale = prefs.getDouble('fontScale') ?? 1.0;
      final densityStr = prefs.getString('elementDensity');
      _elementDensity = ElementDensity.values.firstWhere(
        (e) => e.name == densityStr,
        orElse: () => ElementDensity.comfortable,
      );
      _loaded = true;
      notifyListeners();
    }
  }

  void toggleTheme() async {
    _isDarkMode = !_isDarkMode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('isDarkMode', _isDarkMode);
    notifyListeners();
  }

  /// Updates UI customization preferences (font scale + element density).
  /// These are local-only — not pushed to server.
  Future<void> updateUiPreferences({
    required double fontScale,
    required ElementDensity elementDensity,
  }) async {
    _fontScale = fontScale;
    _elementDensity = elementDensity;
    _loaded = true;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble('fontScale', fontScale);
    await prefs.setString('elementDensity', elementDensity.name);
    notifyListeners();
  }

  Future<bool> updateSettings({
    required String name, required String address, required String contact, required String email,
    required String bankName, required String bankBranch, required String accountNo, required String ifsc,
    required String terms, required double gstPercentage, required String proprietor, required String gstNumber,
    required List<String> supplierCompanies,
  }) async {
    _companyName = name;
    _companyAddress = address;
    _companyContact = contact;
    _companyEmail = email;
    _bankName = bankName;
    _bankBranch = bankBranch;
    _bankAccountNo = accountNo;
    _bankIfsc = ifsc;
    _termsAndConditions = terms;
    _defaultGstPercentage = gstPercentage;
    _companyProprietor = proprietor;
    _gstNumber = gstNumber;
    _supplierCompanies = supplierCompanies;

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('companyName', name);
    await prefs.setString('companyAddress', address);
    await prefs.setString('companyContact', contact);
    await prefs.setString('companyEmail', email);
    await prefs.setString('bankName', bankName);
    await prefs.setString('bankBranch', bankBranch);
    await prefs.setString('bankAccountNo', accountNo);
    await prefs.setString('bankIfsc', ifsc);
    await prefs.setString('termsAndConditions', terms);
    await prefs.setDouble('defaultGstPercentage', gstPercentage);
    await prefs.setString('companyProprietor', proprietor);
    await prefs.setString('gstNumber', gstNumber);
    await prefs.setStringList('supplierCompanies', supplierCompanies);

    notifyListeners();

    return _pushSettingsToServer(
      name: name, address: address, contact: contact, email: email,
      bankName: bankName, bankBranch: bankBranch, accountNo: accountNo, ifsc: ifsc,
      terms: terms, gstPercentage: gstPercentage, proprietor: proprietor, gstNumber: gstNumber,
      supplierCompanies: supplierCompanies,
    );
  }

  // Persists the settings edit to the server so every device/client sees it
  // (local SharedPreferences are per-device only). Uses merge mode so only the
  // fields edited here are written; server-side secrets are left untouched.
  Future<bool> _pushSettingsToServer({
    required String name, required String address, required String contact, required String email,
    required String bankName, required String bankBranch, required String accountNo, required String ifsc,
    required String terms, required double gstPercentage, required String proprietor, required String gstNumber,
    required List<String> supplierCompanies,
  }) async {
    final cfg = clientConfig;
    final url = kIsWeb
        ? '/api/save_client'
        : 'https://app.vitharn.com/api/save_client';
    try {
      // CRITICAL FIX: Include admin_password_hash for save_client authentication.
      // For web: hash comes from login/session response stored in secure storage.
      // For native (APK): hash comes from client config (local password verification).
      final prefs = await SharedPreferences.getInstance();
      final storedHash = prefs.getString('session_password_hash') ?? '';
      final passwordHash = storedHash.isNotEmpty ? storedHash : cfg.portalPasswordHash;
      
      final Map<String, dynamic> body = {
        'admin_email': cfg.companyEmail,
        'admin_password_hash': passwordHash,
        'id': cfg.clientId,
        'merge': true,
        'config': {
          'companyName': name,
          'companyAddress': address,
          'companyContact': contact,
          'companyEmail': email,
          'companyProprietor': proprietor,
          'gstNumber': gstNumber,
          'supplierCompanies': supplierCompanies,
          'bankName': bankName,
          'bankBranch': bankBranch,
          'bankAccountNo': accountNo,
          'bankIfsc': ifsc,
          'defaultGstPercentage': gstPercentage,
          'termsAndConditions': terms
              .split('\n')
              .map((e) => e.trim())
              .where((e) => e.isNotEmpty)
              .toList(),
        },
      };
      
      final res = await http.post(
        Uri.parse(url),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(body),
      );
      return res.statusCode == 200;
    } catch (e) {
      debugPrint('Settings sync to server failed: $e');
      return false;
    }
  }
}
