import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AppState extends ChangeNotifier {
  bool _isDarkMode = false;
  String _companyName = 'Venkateshwara UPVC Windows & Doors';
  String _companyAddress = 'Plot No: 95, Road No: 2, Near Omkar Nagar Bus Stop, LB NAGAR, HYDERABAD – 500074';
  String _companyContact = '9246588692, 9441888131';
  String _companyEmail = 'jvenkateshupvc@gmail.com';
  String _bankName = 'VENKATESHWARA WELDING WORKS';
  String _bankBranch = 'Union Bank, Hastinapuram';
  String _bankAccountNo = 'A/C No : 178511100000061';
  String _bankIfsc = 'IFSC Code : UBIN0817856';
  String _termsAndConditions = '1. 50% advance, 35% after dispatch, 15% after installation.\n2. Delivery minimum 15 days from advance.\n3. All payments in favor of M/s Niksha Industries Pvt Ltd.\n4. Client responsible for site safety & electricity.\n5. Material can be taken back if payment not received.\n6. Final wall-to-wall measurement includes silicone sealant.\n7. Rates may alter if size changes above 1 foot.\n8. Quotation valid for 15 days.\n9. Above rates inclusive of installation.';
  double _defaultGstPercentage = 18.0;

  bool get isDarkMode => _isDarkMode;
  String get companyName => _companyName;
  String get companyAddress => _companyAddress;
  String get companyContact => _companyContact;
  String get companyEmail => _companyEmail;
  String get bankName => _bankName;
  String get bankBranch => _bankBranch;
  String get bankAccountNo => _bankAccountNo;
  String get bankIfsc => _bankIfsc;
  String get termsAndConditions => _termsAndConditions;
  double get defaultGstPercentage => _defaultGstPercentage;

  AppState() {
    _loadSettings();
  }

  void _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    _isDarkMode = prefs.getBool('isDarkMode') ?? false;
    _companyName = prefs.getString('companyName') ?? 'Venkateshwara UPVC Windows & Doors';
    _companyAddress = prefs.getString('companyAddress') ?? 'Plot No: 95, Road No: 2, Near Omkar Nagar Bus Stop, LB NAGAR, HYDERABAD – 500074';
    _companyContact = prefs.getString('companyContact') ?? '9246588692, 9441888131';
    _companyEmail = prefs.getString('companyEmail') ?? 'jvenkateshupvc@gmail.com';
    _bankName = prefs.getString('bankName') ?? 'VENKATESHWARA WELDING WORKS';
    _bankBranch = prefs.getString('bankBranch') ?? 'Union Bank, Hastinapuram';
    _bankAccountNo = prefs.getString('bankAccountNo') ?? 'A/C No : 178511100000061';
    _bankIfsc = prefs.getString('bankIfsc') ?? 'IFSC Code : UBIN0817856';
    _termsAndConditions = prefs.getString('termsAndConditions') ?? '1. 50% advance, 35% after dispatch, 15% after installation.\n2. Delivery minimum 15 days from advance.\n3. All payments in favor of M/s Niksha Industries Pvt Ltd.\n4. Client responsible for site safety & electricity.\n5. Material can be taken back if payment not received.\n6. Final wall-to-wall measurement includes silicone sealant.\n7. Rates may alter if size changes above 1 foot.\n8. Quotation valid for 15 days.\n9. Above rates inclusive of installation.';
    _defaultGstPercentage = prefs.getDouble('defaultGstPercentage') ?? 18.0;
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
    required String terms, required double gstPercentage,
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
    
    notifyListeners();
  }
}
