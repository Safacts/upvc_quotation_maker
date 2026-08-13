import 'package:intl/intl.dart';
import 'supabase_config.dart';

enum GstInvoiceStatus { draft, sent, paid, cancelled }

extension GstInvoiceStatusX on GstInvoiceStatus {
  String get label => switch (this) {
    GstInvoiceStatus.draft => 'Draft',
    GstInvoiceStatus.sent => 'Sent',
    GstInvoiceStatus.paid => 'Paid',
    GstInvoiceStatus.cancelled => 'Cancelled',
  };
  String get value => switch (this) {
    GstInvoiceStatus.draft => 'draft',
    GstInvoiceStatus.sent => 'sent',
    GstInvoiceStatus.paid => 'paid',
    GstInvoiceStatus.cancelled => 'cancelled',
  };
  static GstInvoiceStatus fromString(String? s) => switch (s) {
    'sent' => GstInvoiceStatus.sent,
    'paid' => GstInvoiceStatus.paid,
    'cancelled' => GstInvoiceStatus.cancelled,
    _ => GstInvoiceStatus.draft,
  };
}

class GstInvoiceItem {
  String? id;
  int sno;
  String hsnCode;
  String description;
  double quantity;
  String unit;
  double rate;
  double get taxableValue => quantity * rate;

  GstInvoiceItem({
    this.id,
    this.sno = 1,
    this.hsnCode = '3925',
    this.description = '',
    this.quantity = 1,
    this.unit = 'SFT',
    this.rate = 0,
  });

  Map<String, dynamic> toMap(String invoiceId, {String? clientId}) {
    return {
      if (id != null) 'id': id,
      'invoice_id': invoiceId,
      if (clientId != null) 'client_id': clientId,
      'sno': sno,
      'hsn_code': hsnCode,
      'description': description,
      'quantity': quantity,
      'unit': unit,
      'rate': rate,
      'taxable_value': taxableValue,
    };
  }

  static GstInvoiceItem fromMap(Map<String, dynamic> m) => GstInvoiceItem(
    id: m['id'],
    sno: m['sno'] ?? 1,
    hsnCode: m['hsn_code'] ?? '3925',
    description: m['description'] ?? '',
    quantity: (m['quantity'] ?? 1).toDouble(),
    unit: m['unit'] ?? 'SFT',
    rate: (m['rate'] ?? 0).toDouble(),
  );
}

class GstInvoiceData {
  String? id;
  String invoiceNumber;
  DateTime invoiceDate;
  String supplierCompanyName;
  String supplierAddress;
  String supplierGstin;
  String supplierState;
  String supplierStateCode;
  String buyerName;
  String buyerAddress;
  String buyerGstin;
  String buyerState;
  String buyerStateCode;
  String placeOfSupply;
  String placeOfSupplyCode;
  bool isInterstate;
  bool isReverseCharge;
  String? sourceQuotationId;
  double transportCost;
  double subtotal;
  double taxableValue;
  double cgstRate;
  double sgstRate;
  double igstRate;
  double cgstAmount;
  double sgstAmount;
  double igstAmount;
  double grandTotal;
  String notes;
  GstInvoiceStatus status;
  DateTime createdAt;
  List<GstInvoiceItem> items;

  /// Round to 2 decimal places (paisa-level), matching JS
  /// `Math.round(x * 100) / 100` and TS `round2()`.
  static double _round2(double x) {
    return (x * 100).roundToDouble() / 100;
  }

  /// Convert a number to Indian Rupees-in-words (uppercase, hyphenated tens).
  /// Matches the TS `amountInWords` in `src/lib/gst-invoice-pdf.ts`.
  static String numberToWords(double n) {
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
      "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    String convertChunk(int x) {
      if (x < 20) return ones[x];
      if (x < 100) return tens[x ~/ 10] + (x % 10 != 0 ? "-${ones[x % 10]}" : "");
      if (x < 1000) return "${ones[x ~/ 100]} Hundred${x % 100 != 0 ? " ${convertChunk(x % 100)}" : ""}";
      return "";
    }

    int rupees = n.floor();
    int paise = ((n - rupees) * 100).round();
    if (rupees == 0 && paise == 0) return "RUPEES ZERO ONLY";

    String words = "";
    if (rupees >= 10000000) { words += "${convertChunk(rupees ~/ 10000000)} Crore "; rupees %= 10000000; }
    if (rupees >= 100000) { words += "${convertChunk(rupees ~/ 100000)} Lakh "; rupees %= 100000; }
    if (rupees >= 1000) { words += "${convertChunk(rupees ~/ 1000)} Thousand "; rupees %= 1000; }
    if (rupees > 0) words += "${convertChunk(rupees)} ";
    words += "Rupees";
    if (paise > 0) words += " and ${convertChunk(paise)} Paise";
    return "${words}Only".toUpperCase();
  }

  /// GAP 2: amountInWords is now a computed getter derived from [grandTotal],
  /// not a stored field. Uses the existing [numberToWords] function so every
  /// invoice — even ones loaded without a persisted amount_in_words column —
  /// produces the correct words.
  String get amountInWords => numberToWords(grandTotal);

  GstInvoiceData({
    this.id,
    this.invoiceNumber = '',
    DateTime? invoiceDate,
    this.supplierCompanyName = '',
    this.supplierAddress = '',
    this.supplierGstin = '',
    this.supplierState = 'Telangana',
    this.supplierStateCode = '36',
    this.buyerName = '',
    this.buyerAddress = '',
    this.buyerGstin = '',
    this.buyerState = '',
    this.buyerStateCode = '',
    this.placeOfSupply = 'Telangana',
    this.placeOfSupplyCode = '36',
    this.isInterstate = false,
    this.isReverseCharge = false,
    this.sourceQuotationId,
    this.transportCost = 0,
    this.subtotal = 0,
    this.taxableValue = 0,
    this.cgstRate = 9.0,
    this.sgstRate = 9.0,
    this.igstRate = 0.0,
    this.cgstAmount = 0,
    this.sgstAmount = 0,
    this.igstAmount = 0,
    this.grandTotal = 0,
    this.notes = '',
    this.status = GstInvoiceStatus.draft,
    DateTime? createdAt,
    List<GstInvoiceItem>? items,
  }) : invoiceDate = invoiceDate ?? DateTime.now(),
       createdAt = createdAt ?? DateTime.now(),
       items = items ?? [];

  double get totalTaxableValue => items.fold(0.0, (sum, i) => sum + i.taxableValue);

  void calculateTotals() {
    subtotal = totalTaxableValue;
    taxableValue = subtotal + transportCost;
    if (isInterstate) {
      igstRate = cgstRate + sgstRate;
      cgstRate = 0;
      sgstRate = 0;
      igstAmount = _round2(taxableValue * igstRate / 100);
      cgstAmount = 0;
      sgstAmount = 0;
    } else {
      // Intra-state: CGST + SGST — split IGST-equivalent so CGST+SGST = IGST exactly.
      final combined = _round2(taxableValue * (cgstRate + sgstRate) / 100);
      final paisa = (combined * 100).round();
      cgstAmount = _round2((paisa ~/ 2) / 100); // floor half
      sgstAmount = _round2(combined - cgstAmount); // remainder
      igstRate = 0; // display
      igstAmount = 0; // display
    }
    grandTotal = _round2(taxableValue + cgstAmount + sgstAmount + igstAmount);
  }

  static Future<String> generateNextNumber(String clientId) async {
    try {
      final result = await SupabaseConfig.client
          .rpc('get_next_gst_invoice_number', params: {'cid': clientId});
      return result.toString();
    } catch (e) {
      String fy = DateFormat('yyyy').format(DateTime.now());
      int month = DateTime.now().month;
      if (month >= 4) {
        fy = '${DateTime.now().year}-${DateTime.now().year + 1}';
      } else {
        fy = '${DateTime.now().year - 1}-${DateTime.now().year}';
      }
      return 'GST/$fy/ERR';
    }
  }

  Map<String, dynamic> toMap({String? clientId}) {
    calculateTotals();
    final Map<String, dynamic> map = {
      'invoice_number': invoiceNumber,
      'invoice_date': DateFormat('yyyy-MM-dd').format(invoiceDate),
      'supplier_company_name': supplierCompanyName,
      'supplier_address': supplierAddress,
      'supplier_gstin': supplierGstin,
      'supplier_state': supplierState,
      'supplier_state_code': supplierStateCode,
      'buyer_name': buyerName,
      'buyer_address': buyerAddress,
      'buyer_gstin': buyerGstin,
      'buyer_state': buyerState,
      'buyer_state_code': buyerStateCode,
      'place_of_supply': placeOfSupply,
      'place_of_supply_code': placeOfSupplyCode,
      'is_interstate': isInterstate,
      'is_reverse_charge': isReverseCharge,
      'transport_cost': transportCost,
      'subtotal': subtotal,
      'taxable_value': taxableValue,
      'cgst_rate': cgstRate,
      'sgst_rate': sgstRate,
      'igst_rate': igstRate,
      'cgst_amount': cgstAmount,
      'sgst_amount': sgstAmount,
      'igst_amount': igstAmount,
      'grand_total': grandTotal,
      'amount_in_words': amountInWords,
      'notes': notes,
      'status': status.value,
      'updated_at': DateTime.now().toIso8601String(),
    };
    if (id != null) map['id'] = id;
    if (clientId != null) map['client_id'] = clientId;
    if (sourceQuotationId != null) map['source_quotation_id'] = sourceQuotationId;
    return map;
  }

  static GstInvoiceData fromMap(Map<String, dynamic> map) {
    final d = GstInvoiceData();
    d.id = map['id'];
    d.invoiceNumber = map['invoice_number'] ?? '';
    d.invoiceDate = map['invoice_date'] != null ? DateTime.parse(map['invoice_date']) : DateTime.now();
    d.supplierCompanyName = map['supplier_company_name'] ?? '';
    d.supplierAddress = map['supplier_address'] ?? '';
    d.supplierGstin = map['supplier_gstin'] ?? '';
    d.supplierState = map['supplier_state'] ?? 'Telangana';
    d.supplierStateCode = map['supplier_state_code'] ?? '36';
    d.buyerName = map['buyer_name'] ?? '';
    d.buyerAddress = map['buyer_address'] ?? '';
    d.buyerGstin = map['buyer_gstin'] ?? '';
    d.buyerState = map['buyer_state'] ?? '';
    d.buyerStateCode = map['buyer_state_code'] ?? '';
    d.placeOfSupply = map['place_of_supply'] ?? 'Telangana';
    d.placeOfSupplyCode = map['place_of_supply_code'] ?? '36';
    d.isInterstate = map['is_interstate'] ?? false;
    d.isReverseCharge = map['is_reverse_charge'] ?? false;
    d.sourceQuotationId = map['source_quotation_id'];
    d.transportCost = (map['transport_cost'] ?? 0).toDouble();
    d.subtotal = (map['subtotal'] ?? 0).toDouble();
    d.taxableValue = (map['taxable_value'] ?? 0).toDouble();
    d.cgstRate = (map['cgst_rate'] ?? 9.0).toDouble();
    d.sgstRate = (map['sgst_rate'] ?? 9.0).toDouble();
    d.igstRate = (map['igst_rate'] ?? 0.0).toDouble();
    d.cgstAmount = (map['cgst_amount'] ?? 0).toDouble();
    d.sgstAmount = (map['sgst_amount'] ?? 0).toDouble();
    d.igstAmount = (map['igst_amount'] ?? 0).toDouble();
    d.grandTotal = (map['grand_total'] ?? 0).toDouble();
    d.notes = map['notes'] ?? '';
    d.status = GstInvoiceStatusX.fromString(map['status']);
    d.createdAt = map['created_at'] != null ? DateTime.parse(map['created_at']) : DateTime.now();
    return d;
  }
}
