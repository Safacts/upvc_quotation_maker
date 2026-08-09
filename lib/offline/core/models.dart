/// OFFLINE TIER (Rs.10,000 "Low") — PURE DART DOMAIN MODELS.
///
/// ZERO-SERVER CONTRACT
/// --------------------
/// Nothing in `lib/offline/**` may import:
///   * `package:supabase_flutter/...`
///   * `../supabase_config.dart`
///   * `package:http/http.dart`
///   * any `lib/services/*.dart` that touches the network
///
/// The Low tier is sold on the promise that the app makes ZERO network calls.
/// Bugsy verifies this with a packet capture (MEETING-003, blocking test #5),
/// and `test/offline_no_network_test.dart` fails the build on any banned import.
/// Breaking this is not a bug, it is a breach of the client contract.
///
/// PRICING PARITY CONTRACT
/// -----------------------
/// The getters `sft`, `totalSft`, `total`, `igst` and `grandTotal` below are
/// byte-identical in behaviour to `lib/models.dart` (the online app) and to
/// `src/lib/pricing.ts` (the web console). Preserve the MULTIPLICATION ORDER —
/// float multiplication is not associative and a reorder moves the result by a
/// paisa. A quotation PDF that disagrees with the console is a trust-killer.
/// If you change a formula here, change it in all three places in one commit.
library;

import 'package:intl/intl.dart';

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

enum OfflineQuotationStatus { draft, sent, won, lost }

extension OfflineQuotationStatusX on OfflineQuotationStatus {
  String get label => switch (this) {
        OfflineQuotationStatus.draft => 'Draft',
        OfflineQuotationStatus.sent => 'Sent',
        OfflineQuotationStatus.won => 'Won',
        OfflineQuotationStatus.lost => 'Lost',
      };

  String get value => switch (this) {
        OfflineQuotationStatus.draft => 'draft',
        OfflineQuotationStatus.sent => 'sent',
        OfflineQuotationStatus.won => 'won',
        OfflineQuotationStatus.lost => 'lost',
      };

  static OfflineQuotationStatus fromString(String? s) => switch (s) {
        'sent' => OfflineQuotationStatus.sent,
        'won' => OfflineQuotationStatus.won,
        'lost' => OfflineQuotationStatus.lost,
        _ => OfflineQuotationStatus.draft,
      };
}

// ---------------------------------------------------------------------------
// Numeric coercion — SQLite is dynamically typed; a REAL column can come back
// as int, and a TEXT column as String. Every read goes through these so a bad
// row degrades to 0 instead of throwing mid-PDF-render.
// ---------------------------------------------------------------------------

double asDouble(Object? v) {
  if (v == null) return 0.0;
  if (v is double) return v.isFinite ? v : 0.0;
  if (v is int) return v.toDouble();
  if (v is num) return v.toDouble();
  final parsed = double.tryParse(v.toString().trim());
  return (parsed == null || !parsed.isFinite) ? 0.0 : parsed;
}

int asInt(Object? v) {
  if (v == null) return 0;
  if (v is int) return v;
  if (v is num) return v.toInt();
  return int.tryParse(v.toString().trim()) ?? 0;
}

bool asBool(Object? v) {
  if (v == null) return false;
  if (v is bool) return v;
  if (v is num) return v != 0;
  final s = v.toString().trim().toLowerCase();
  return s == '1' || s == 'true' || s == 'yes';
}

String asText(Object? v) => v?.toString() ?? '';

/// SQLite has no BOOLEAN type — persist as 0/1 INTEGER.
int boolToDb(bool v) => v ? 1 : 0;

// ---------------------------------------------------------------------------
// Measured item (priced by area: width x height x units x rate)
// ---------------------------------------------------------------------------

class OfflineMeasuredItem {
  String? id;
  String code;
  String description;
  double width; // millimetres
  double height; // millimetres
  int units;
  String glass;
  double rate; // rupees per square foot
  int position;

  OfflineMeasuredItem({
    this.id,
    this.code = '',
    this.description = '',
    this.width = 0,
    this.height = 0,
    this.units = 1,
    this.glass = '',
    this.rate = 0,
    this.position = 0,
  });

  /// 304.8 mm = 1 foot. Per-unit area. Mirrors `sqft()` in pricing.ts.
  double get sft => (width / 304.8) * (height / 304.8);

  /// Area for all units of this line.
  double get totalSft => sft * units;

  /// Line amount. Amount is ALWAYS derived — never stored, never hand-entered.
  double get total => totalSft * rate;

  Map<String, Object?> toDb(String quotationId) => {
        'id': id,
        'quotation_id': quotationId,
        'code': code,
        'description': description,
        'width': width,
        'height': height,
        'units': units,
        'glass': glass,
        'rate': rate,
        'position': position,
      };

  factory OfflineMeasuredItem.fromDb(Map<String, Object?> m) =>
      OfflineMeasuredItem(
        id: m['id'] as String?,
        code: asText(m['code']),
        description: asText(m['description']),
        width: asDouble(m['width']),
        height: asDouble(m['height']),
        units: asInt(m['units']),
        glass: asText(m['glass']),
        rate: asDouble(m['rate']),
        position: asInt(m['position']),
      );

  OfflineMeasuredItem copy() => OfflineMeasuredItem(
        id: id,
        code: code,
        description: description,
        width: width,
        height: height,
        units: units,
        glass: glass,
        rate: rate,
        position: position,
      );
}

// ---------------------------------------------------------------------------
// Unmeasured item (priced per piece: units x rate)
// ---------------------------------------------------------------------------

class OfflineUnmeasuredItem {
  String? id;
  String description;
  int units;
  double rate;
  int position;

  OfflineUnmeasuredItem({
    this.id,
    this.description = '',
    this.units = 1,
    this.rate = 0,
    this.position = 0,
  });

  double get total => units * rate;

  Map<String, Object?> toDb(String quotationId) => {
        'id': id,
        'quotation_id': quotationId,
        'description': description,
        'units': units,
        'rate': rate,
        'position': position,
      };

  factory OfflineUnmeasuredItem.fromDb(Map<String, Object?> m) =>
      OfflineUnmeasuredItem(
        id: m['id'] as String?,
        description: asText(m['description']),
        units: asInt(m['units']),
        rate: asDouble(m['rate']),
        position: asInt(m['position']),
      );

  OfflineUnmeasuredItem copy() => OfflineUnmeasuredItem(
        id: id,
        description: description,
        units: units,
        rate: rate,
        position: position,
      );
}

// ---------------------------------------------------------------------------
// Quotation
// ---------------------------------------------------------------------------

class OfflineQuotation {
  String? id;
  String quotationNo;
  DateTime date;
  String customerName;
  String customerId;
  String reference;
  String address;
  String contactNo;
  String email;
  DateTime createdAt;
  DateTime updatedAt;
  OfflineQuotationStatus status;
  String notes;

  List<OfflineMeasuredItem> measuredItems;
  List<OfflineUnmeasuredItem> unmeasuredItems;

  double transport;
  bool includeGst;
  double gstPercentage;

  OfflineQuotation({
    this.id,
    this.quotationNo = '',
    DateTime? date,
    this.customerName = '',
    this.customerId = '',
    this.reference = '',
    this.address = '',
    this.contactNo = '',
    this.email = '',
    DateTime? createdAt,
    DateTime? updatedAt,
    this.status = OfflineQuotationStatus.draft,
    this.notes = '',
    List<OfflineMeasuredItem>? measuredItems,
    List<OfflineUnmeasuredItem>? unmeasuredItems,
    this.transport = 0.0,
    this.includeGst = false,
    this.gstPercentage = 0.0,
  })  : date = date ?? DateTime.now(),
        createdAt = createdAt ?? DateTime.now(),
        updatedAt = updatedAt ?? DateTime.now(),
        measuredItems = measuredItems ?? <OfflineMeasuredItem>[],
        unmeasuredItems = unmeasuredItems ?? <OfflineUnmeasuredItem>[];

  // --- Pricing (parity-locked with lib/models.dart + src/lib/pricing.ts) ---

  double get totalMeasuredAmount =>
      measuredItems.fold(0.0, (s, i) => s + i.total);

  double get totalUnmeasuredAmount =>
      unmeasuredItems.fold(0.0, (s, i) => s + i.total);

  double get actualAmount => totalMeasuredAmount + totalUnmeasuredAmount;

  double get totalSft => measuredItems.fold(0.0, (s, i) => s + i.totalSft);

  double get igst =>
      includeGst ? (actualAmount + transport) * (gstPercentage / 100.0) : 0.0;

  double get grandTotal => actualAmount + transport + igst;

  int get itemCount => measuredItems.length + unmeasuredItems.length;

  /// Indian-numbering amount in words, e.g. "ONE LAKH TWENTY THOUSAND RUPEES ONLY".
  /// Same algorithm as `lib/models.dart` so the PDF text matches exactly.
  String get amountInWords {
    if (grandTotal <= 0) return 'RUPEES ZERO ONLY';
    int number = grandTotal.floor();
    final int paise = ((grandTotal - number) * 100).round();

    String convertChunk(int n) {
      const ones = [
        '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight',
        'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
        'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
      ];
      const tens = [
        '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy',
        'Eighty', 'Ninety'
      ];
      if (n < 20) return ones[n];
      if (n < 100) {
        return tens[n ~/ 10] + (n % 10 != 0 ? '-${ones[n % 10]}' : '');
      }
      if (n < 1000) {
        return '${ones[n ~/ 100]} Hundred'
            '${n % 100 != 0 ? " ${convertChunk(n % 100)}" : ""}';
      }
      return '';
    }

    var words = '';
    if (number >= 10000000) {
      words += '${convertChunk(number ~/ 10000000)} Crore ';
      number %= 10000000;
    }
    if (number >= 100000) {
      words += '${convertChunk(number ~/ 100000)} Lakh ';
      number %= 100000;
    }
    if (number >= 1000) {
      words += '${convertChunk(number ~/ 1000)} Thousand ';
      number %= 1000;
    }
    if (number > 0) words += '${convertChunk(number)} ';
    words += 'Rupees';
    if (paise > 0) words += ' and ${convertChunk(paise)} Paise';
    return '$words Only'.toUpperCase();
  }

  /// Header row only. Child items are persisted by the repository separately.
  Map<String, Object?> toDb() => {
        'id': id,
        'quote_no': quotationNo,
        'date': DateFormat('yyyy-MM-dd').format(date),
        'customer_name': customerName,
        'customer_id': customerId,
        'reference': reference,
        'address': address,
        'contact_no': contactNo,
        'email': email,
        'transport_cost': transport,
        'include_gst': boolToDb(includeGst),
        'gst_percentage': gstPercentage,
        'status': status.value,
        'notes': notes,
        // Denormalised so the list screen never has to join or recompute.
        'grand_total': grandTotal,
        'created_at': createdAt.toIso8601String(),
        'updated_at': updatedAt.toIso8601String(),
      };

  factory OfflineQuotation.fromDb(Map<String, Object?> m) => OfflineQuotation(
        id: m['id'] as String?,
        quotationNo: asText(m['quote_no']),
        date: _parseDate(m['date']),
        customerName: asText(m['customer_name']),
        customerId: asText(m['customer_id']),
        reference: asText(m['reference']),
        address: asText(m['address']),
        contactNo: asText(m['contact_no']),
        email: asText(m['email']),
        createdAt: _parseDate(m['created_at']),
        updatedAt: _parseDate(m['updated_at']),
        status: OfflineQuotationStatusX.fromString(m['status'] as String?),
        notes: asText(m['notes']),
        transport: asDouble(m['transport_cost']),
        includeGst: asBool(m['include_gst']),
        gstPercentage: asDouble(m['gst_percentage']),
      );

  /// Value stored in the denormalised `grand_total` column. Used by the list
  /// screen, which does NOT load child items.
  static double storedGrandTotal(Map<String, Object?> m) =>
      asDouble(m['grand_total']);
}

DateTime _parseDate(Object? v) {
  if (v == null) return DateTime.now();
  if (v is DateTime) return v;
  if (v is int) return DateTime.fromMillisecondsSinceEpoch(v);
  return DateTime.tryParse(v.toString()) ?? DateTime.now();
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

class OfflineCustomer {
  String? id;
  String name;
  String phone;
  String email;
  String address;
  String gstin;
  String notes;
  DateTime createdAt;
  DateTime updatedAt;

  OfflineCustomer({
    this.id,
    this.name = '',
    this.phone = '',
    this.email = '',
    this.address = '',
    this.gstin = '',
    this.notes = '',
    DateTime? createdAt,
    DateTime? updatedAt,
  })  : createdAt = createdAt ?? DateTime.now(),
        updatedAt = updatedAt ?? DateTime.now();

  Map<String, Object?> toDb() => {
        'id': id,
        'name': name,
        'name_lower': name.trim().toLowerCase(),
        'phone': phone,
        'email': email,
        'address': address,
        'gstin': gstin,
        'notes': notes,
        'created_at': createdAt.toIso8601String(),
        'updated_at': updatedAt.toIso8601String(),
      };

  factory OfflineCustomer.fromDb(Map<String, Object?> m) => OfflineCustomer(
        id: m['id'] as String?,
        name: asText(m['name']),
        phone: asText(m['phone']),
        email: asText(m['email']),
        address: asText(m['address']),
        gstin: asText(m['gstin']),
        notes: asText(m['notes']),
        createdAt: _parseDate(m['created_at']),
        updatedAt: _parseDate(m['updated_at']),
      );
}

// ---------------------------------------------------------------------------
// Product (rate-card entry the quotation editor pulls from)
// ---------------------------------------------------------------------------

/// `sft` products feed the MEASURED section (rate is per square foot).
/// Everything else feeds the UNMEASURED section (rate is per piece).
/// This mirrors the split already used by `CatalogService` in the online app.
class OfflineProduct {
  String? id;
  String code;
  String name;
  String description;
  String unit; // 'sft' | 'nos' | 'set' | 'rft' ...
  double rate;
  String glass;
  String category;
  bool isActive;
  DateTime createdAt;
  DateTime updatedAt;

  OfflineProduct({
    this.id,
    this.code = '',
    this.name = '',
    this.description = '',
    this.unit = 'sft',
    this.rate = 0,
    this.glass = '',
    this.category = '',
    this.isActive = true,
    DateTime? createdAt,
    DateTime? updatedAt,
  })  : createdAt = createdAt ?? DateTime.now(),
        updatedAt = updatedAt ?? DateTime.now();

  /// True when this product is priced by area and belongs in Measured Items.
  bool get isMeasured => unit.trim().toLowerCase() == 'sft';

  Map<String, Object?> toDb() => {
        'id': id,
        'code': code,
        'name': name,
        'description': description,
        'unit': unit,
        'rate': rate,
        'glass': glass,
        'category': category,
        'is_active': boolToDb(isActive),
        'created_at': createdAt.toIso8601String(),
        'updated_at': updatedAt.toIso8601String(),
      };

  factory OfflineProduct.fromDb(Map<String, Object?> m) => OfflineProduct(
        id: m['id'] as String?,
        code: asText(m['code']),
        name: asText(m['name']),
        description: asText(m['description']),
        unit: asText(m['unit']).isEmpty ? 'sft' : asText(m['unit']),
        rate: asDouble(m['rate']),
        glass: asText(m['glass']),
        category: asText(m['category']),
        isActive: asBool(m['is_active']),
        createdAt: _parseDate(m['created_at']),
        updatedAt: _parseDate(m['updated_at']),
      );
}

// ---------------------------------------------------------------------------
// Formatting helpers shared by UI and PDF
// ---------------------------------------------------------------------------

/// Indian digit grouping (1,20,000 not 120,000). Used everywhere money is shown.
final NumberFormat inrFormat =
    NumberFormat.currency(locale: 'en_IN', symbol: '\u20B9', decimalDigits: 2);

final NumberFormat inrCompactFormat =
    NumberFormat.currency(locale: 'en_IN', symbol: '\u20B9', decimalDigits: 0);

/// Plain grouped number, no symbol — the PDF draws its own currency glyph
/// because not every embedded font contains the rupee sign.
final NumberFormat plainAmountFormat = NumberFormat('#,##,##0.00', 'en_IN');

String formatInr(double v) => inrFormat.format(v);
String formatAmount(double v) => plainAmountFormat.format(v);
String formatQuoteDate(DateTime d) => DateFormat('dd-MM-yyyy').format(d);
