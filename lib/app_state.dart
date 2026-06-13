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

    String savedName = prefs.getString('companyName') ?? '';
    _companyName = (savedName.isEmpty || savedName == 'Venkateshwara UPVC') 
        ? 'Venkateshwara UPVC Windows & Doors' : savedName;

    String savedAddress = prefs.getString('companyAddress') ?? '';
    _companyAddress = (savedAddress.isEmpty || savedAddress == 'Sri Sai Ram Nagar, P.N.Palem, P.M.Palem, Visakhapatnam-530041') 
        ? 'Plot No: 95, Road No: 2, Near Omkar Nagar Bus Stop, LB NAGAR, HYDERABAD – 500074' : savedAddress;

    _companyContact = prefs.getString('companyContact') ?? '9246588692, 9441888131';
    if (_companyContact.isEmpty) _companyContact = '9246588692, 9441888131';

    _companyEmail = prefs.getString('companyEmail') ?? 'jvenkateshupvc@gmail.com';

    String savedBankName = prefs.getString('bankName') ?? '';
    _bankName = (savedBankName.isEmpty || savedBankName == 'UNION BANK OF INDIA') 
        ? 'VENKATESHWARA WELDING WORKS' : savedBankName;

    String savedBankBranch = prefs.getString('bankBranch') ?? '';
    _bankBranch = (savedBankBranch.isEmpty || savedBankBranch == 'P.M.PALEM, VISAKHAPATNAM') 
        ? 'Union Bank, Hastinapuram' : savedBankBranch;

    String savedAccount = prefs.getString('bankAccountNo') ?? '';
    _bankAccountNo = (savedAccount.isEmpty || savedAccount.contains('0000000') || savedAccount == '00000' || savedAccount == 'A/C.NO: 000000000000') 
        ? 'A/C No : 178511100000061' : savedAccount;

    String savedIfsc = prefs.getString('bankIfsc') ?? '';
    _bankIfsc = (savedIfsc.isEmpty || savedIfsc.contains('0000') || savedIfsc == 'IFSC CODE: UBIN0000000') 
        ? 'IFSC Code : UBIN0817856' : savedIfsc;

    String savedTerms = prefs.getString('termsAndConditions') ?? '';
    _termsAndConditions = (savedTerms.isEmpty || savedTerms.startsWith('1. 50% Advance along with work order.')) 
        ? '1. 50% advance, 35% after dispatch, 15% after installation.\n2. Delivery minimum 15 days from advance.\n3. All payments in favor of M/s Niksha Industries Pvt Ltd.\n4. Client responsible for site safety & electricity.\n5. Material can be taken back if payment not received.\n6. Final wall-to-wall measurement includes silicone sealant.\n7. Rates may alter if size changes above 1 foot.\n8. Quotation valid for 15 days.\n9. Above rates inclusive of installation.' 
        : savedTerms;

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
