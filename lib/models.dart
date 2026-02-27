import 'package:intl/intl.dart';

class QuotationData {
  String quotationNo = 'JVUPVC-${DateFormat('ddMMyyyy').format(DateTime.now())}-${DateTime.now().millisecondsSinceEpoch.toString().substring(9)}';
  DateTime date = DateTime.now();
  String customerName = '';
  String reference = '';
  String address = '';
  String contactNo = '';
  
  List<MeasuredItem> measuredItems = [];
  List<UnmeasuredItem> unmeasuredItems = [];
  double transport = 0.0;

  double get totalMeasuredAmount => measuredItems.fold(0, (sum, item) => sum + item.total);
  double get totalUnmeasuredAmount => unmeasuredItems.fold(0, (sum, item) => sum + item.total);
  double get actualAmount => totalMeasuredAmount + totalUnmeasuredAmount;
  double get totalSft => measuredItems.fold(0, (sum, item) => sum + item.totalSft);
  double get grandTotal => actualAmount + transport;

  String get amountInWords {
    if (grandTotal == 0) return "RUPEES ZERO ONLY";
    
    int number = grandTotal.floor();
    int paise = ((grandTotal - number) * 100).round();
    
    String convertChunk(int n) {
      const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
      const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
      
      if (n < 20) return ones[n];
      if (n < 100) return tens[n ~/ 10] + (n % 10 != 0 ? "-" + ones[n % 10] : "");
      if (n < 1000) return ones[n ~/ 100] + " Hundred" + (n % 100 != 0 ? " " + convertChunk(n % 100) : "");
      return "";
    }

    String words = "";
    if (number >= 10000000) { words += convertChunk(number ~/ 10000000) + " Crore "; number %= 10000000; }
    if (number >= 100000) { words += convertChunk(number ~/ 100000) + " Lakh "; number %= 100000; }
    if (number >= 1000) { words += convertChunk(number ~/ 1000) + " Thousand "; number %= 1000; }
    if (number > 0) words += convertChunk(number) + " ";

    words += "Rupees";
    if (paise > 0) words += " and " + convertChunk(paise) + " Paise";
    return (words + " Only").toUpperCase();
  }
}

class MeasuredItem {
  String code = '';
  String description = '';
  double width = 0;
  double height = 0;
  int units = 1;
  String glass = '';
  double rate = 0;

  double get sft => (width / 304.8) * (height / 304.8);
  double get totalSft => sft * units;
  double get total => totalSft * rate;
}

class UnmeasuredItem {
  String description = '';
  int units = 1;
  double rate = 0;
  double get total => units * rate;
}
