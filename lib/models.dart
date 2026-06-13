import 'package:intl/intl.dart';
import 'supabase_config.dart';

class QuotationData {
  String? id; // UUID from Supabase
  String quotationNo = ''; 
  DateTime date = DateTime.now();
  String customerName = '';
  String reference = '';
  String address = '';
  String contactNo = '';
  String email = ''; // Added email field
  DateTime createdAt = DateTime.now(); // Added createdAt timestamp
  
  List<MeasuredItem> measuredItems = [];
  List<UnmeasuredItem> unmeasuredItems = [];
  double transport = 0.0;

  bool includeGst = false;
  double gstPercentage = 0.0;

  // Logic to handle continuous numbering via Supabase RPC
  static Future<String> generateNextQuoteNumber() async {
    try {
      final result = await SupabaseConfig.client.rpc('get_next_quote_number');
      return result.toString();
    } catch (e) {
      // Fallback for offline/error: add milliseconds since epoch modulo 10000 to prevent collisions
      String datePart = DateFormat('ddMMyyyy').format(DateTime.now());
      int rand = DateTime.now().millisecondsSinceEpoch % 10000;
      return 'JVUPVC-$datePart-ERR-$rand';
    }
  }

  double get totalMeasuredAmount => measuredItems.fold(0, (sum, item) => sum + item.total);
  double get totalUnmeasuredAmount => unmeasuredItems.fold(0, (sum, item) => sum + item.total);
  double get actualAmount => totalMeasuredAmount + totalUnmeasuredAmount;
  double get totalSft => measuredItems.fold(0, (sum, item) => sum + item.totalSft);
  double get igst => includeGst ? (actualAmount + transport) * (gstPercentage / 100.0) : 0.0;
  double get grandTotal => actualAmount + transport + igst; // Grand Total includes IGST

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

  Map<String, dynamic> toMap() {
    return {
      if (id != null) 'id': id,
      'quote_no': quotationNo,
      'date': DateFormat('yyyy-MM-dd').format(date),
      'customer_name': customerName,
      'reference': reference,
      'address': address,
      'contact_no': contactNo,
      'email': email,
      'transport_cost': transport,
      'include_gst': includeGst,
      'gst_percentage': gstPercentage,
    };
  }

  static QuotationData fromMap(Map<String, dynamic> map) {
    var q = QuotationData();
    q.id = map['id'];
    q.quotationNo = map['quote_no'] ?? '';
    q.date = map['date'] != null ? DateTime.parse(map['date']) : DateTime.now();
    q.customerName = map['customer_name'] ?? '';
    q.reference = map['reference'] ?? '';
    q.address = map['address'] ?? '';
    q.contactNo = map['contact_no'] ?? '';
    q.email = map['email'] ?? '';
    q.transport = (map['transport_cost'] ?? 0).toDouble();
    q.createdAt = map['created_at'] != null ? DateTime.parse(map['created_at']) : DateTime.now();
    q.includeGst = map['include_gst'] ?? false;
    q.gstPercentage = (map['gst_percentage'] ?? 0.0).toDouble();
    return q;
  }
}

class MeasuredItem {
  String? id;
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

  Map<String, dynamic> toMap(String quotationId) {
    return {
      if (id != null) 'id': id,
      'quotation_id': quotationId,
      'code': code,
      'description': description,
      'width': width,
      'height': height,
      'units': units,
      'glass': glass,
      'rate': rate,
    };
  }

  static MeasuredItem fromMap(Map<String, dynamic> map) {
    var item = MeasuredItem();
    item.id = map['id'];
    item.code = map['code'] ?? '';
    item.description = map['description'] ?? '';
    item.width = (map['width'] ?? 0).toDouble();
    item.height = (map['height'] ?? 0).toDouble();
    item.units = map['units'] ?? 1;
    item.glass = map['glass'] ?? '';
    item.rate = (map['rate'] ?? 0).toDouble();
    return item;
  }
}

class UnmeasuredItem {
  String? id;
  String description = '';
  int units = 1;
  double rate = 0;
  double get total => units * rate;

  Map<String, dynamic> toMap(String quotationId) {
    return {
      if (id != null) 'id': id,
      'quotation_id': quotationId,
      'description': description,
      'units': units,
      'rate': rate,
    };
  }

  static UnmeasuredItem fromMap(Map<String, dynamic> map) {
    var item = UnmeasuredItem();
    item.id = map['id'];
    item.description = map['description'] ?? '';
    item.units = map['units'] ?? 1;
    item.rate = (map['rate'] ?? 0).toDouble();
    return item;
  }
}

class SentEmail {
  String? id;
  DateTime createdAt;
  String recipient;
  String subject;
  String body;

  SentEmail({
    this.id,
    required this.createdAt,
    required this.recipient,
    required this.subject,
    required this.body,
  });

  static SentEmail fromMap(Map<String, dynamic> map) {
    return SentEmail(
      id: map['id'],
      createdAt: DateTime.parse(map['created_at']),
      recipient: map['recipient'],
      subject: map['subject'],
      body: map['body'],
    );
  }

  Map<String, dynamic> toMap() {
    return {
      if (id != null) 'id': id,
      'recipient': recipient,
      'subject': subject,
      'body': body,
    };
  }
}