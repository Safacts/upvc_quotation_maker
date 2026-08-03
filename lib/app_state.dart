import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'config/client_config.dart';

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
  bool get isDarkMode => _isDarkMode;
  String get appName => clientConfig.appName;
  String get quotePrefix => clientConfig.quotePrefix;
  List<String> get adminEmails => clientConfig.adminEmails;
  double get costMarginPercent => clientConfig.costMarginPercent;

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
    notifyListeners();
  }

  void toggleTheme() async {
    _isDarkMode = !_isDarkMode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('isDarkMode', _isDarkMode);
    notifyListeners();
  }

  Future<void> updateSettings({
    required String name, required String address, required String contact, required String email,
    required String bankName, required String bankBranch, required String accountNo, required String ifsc,
    required String terms, required double gstPercentage, required String proprietor, required String gstNumber,
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
    
    notifyListeners();
  }
}
