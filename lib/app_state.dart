import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AppState extends ChangeNotifier {
  bool _isDarkMode = false;
  String _companyName = 'Venkateshwara UPVC';
  String _companyAddress = 'Sri Sai Ram Nagar, P.N.Palem, P.M.Palem, Visakhapatnam-530041';
  String _companyContact = '9246588692, 9441888131';
  String _companyEmail = 'jvenkateshupvc@gmail.com';
  String _bankName = 'UNION BANK OF INDIA';
  String _bankBranch = 'P.M.PALEM, VISAKHAPATNAM';
  String _bankAccountNo = 'A/C.NO: 000000000000';
  String _bankIfsc = 'IFSC CODE: UBIN0000000';
  String _termsAndConditions = '1. 50% Advance along with work order.\n2. 40% before material delivery.\n3. 10% after completion of work.\n4. Quotation valid for 15 days.\n5. Taxes extra as applicable.';

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

  AppState() {
    _loadSettings();
  }

  void _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    _isDarkMode = prefs.getBool('isDarkMode') ?? false;
    _companyName = prefs.getString('companyName') ?? 'Venkateshwara UPVC';
    _companyAddress = prefs.getString('companyAddress') ?? 'Sri Sai Ram Nagar, P.N.Palem, P.M.Palem, Visakhapatnam-530041';
    _companyContact = prefs.getString('companyContact') ?? '9246588692, 9441888131';
    _companyEmail = prefs.getString('companyEmail') ?? 'jvenkateshupvc@gmail.com';
    _bankName = prefs.getString('bankName') ?? 'UNION BANK OF INDIA';
    _bankBranch = prefs.getString('bankBranch') ?? 'P.M.PALEM, VISAKHAPATNAM';
    _bankAccountNo = prefs.getString('bankAccountNo') ?? 'A/C.NO: 000000000000';
    _bankIfsc = prefs.getString('bankIfsc') ?? 'IFSC CODE: UBIN0000000';
    _termsAndConditions = prefs.getString('termsAndConditions') ?? '1. 50% Advance along with work order.\n2. 40% before material delivery.\n3. 10% after completion of work.\n4. Quotation valid for 15 days.\n5. Taxes extra as applicable.';
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
    required String terms,
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
    
    notifyListeners();
  }
}
