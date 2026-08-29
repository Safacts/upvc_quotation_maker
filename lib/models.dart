import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'supabase_config.dart';

enum QuotationStatus { draft, sent, won, lost }

extension QuotationStatusX on QuotationStatus {
  String get label {
    switch (this) {
      case QuotationStatus.draft:
        return 'Draft';
      case QuotationStatus.sent:
        return 'Sent';
      case QuotationStatus.won:
        return 'Won';
      case QuotationStatus.lost:
        return 'Lost';
    }
  }

  String get value {
    switch (this) {
      case QuotationStatus.draft:
        return 'draft';
      case QuotationStatus.sent:
        return 'sent';
      case QuotationStatus.won:
        return 'approved';
      case QuotationStatus.lost:
        return 'rejected';
    }
  }

  static QuotationStatus fromString(String? s) {
    switch (s) {
      case 'sent':
        return QuotationStatus.sent;
      case 'approved':
      case 'won':
      case 'accepted':
        return QuotationStatus.won;
      case 'rejected':
      case 'lost':
        return QuotationStatus.lost;
      default:
        return QuotationStatus.draft;
    }
  }
}

class QuotationData {
  String? id; // Unique UUID
  String quotationNo = '';
  DateTime date = DateTime.now();
  String customerName = '';
  String reference = '';
  String address = '';
  String contactNo = '';
  String email = '';
  DateTime createdAt = DateTime.now();
  QuotationStatus status = QuotationStatus.draft;

  /// Server revision used to prevent one device silently overwriting another.
  /// Zero means this quotation has never been acknowledged by the cloud.
  int syncVersion = 0;

  List<MeasuredItem> measuredItems = [];
  List<UnmeasuredItem> unmeasuredItems = [];
  double transport = 0.0;

  /// KPRUPVC-only customer advance. This never changes [grandTotal].
  double advancePaid = 0.0;

  bool includeGst = false;
  double gstPercentage = 0.0;
  String supplierCompany = '';

  // Logic to handle continuous numbering via Supabase RPC + Offline fallback
  static Future<String> generateNextQuoteNumber({
    String prefix = 'JVUPVC',
    String? clientId,
  }) async {
    final cid = clientId ?? 'default';
    final datePart = DateFormat('ddMMyyyy').format(DateTime.now());
    try {
      final result = await SupabaseConfig.client.rpc(
        'get_next_quote_number',
        params: {'cid': clientId},
      );
      final quoteNo = result.toString();
      // Cache latest sequence locally so offline mode can continue seamlessly
      if (quoteNo.contains('-')) {
        final lastPart = quoteNo.split('-').last;
        final seq = int.tryParse(lastPart);
        if (seq != null) {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setInt('last_quote_seq_${cid}_$datePart', seq);
        }
      }
      return quoteNo;
    } catch (e) {
      // Offline fallback with monotonic local sequence:
      try {
        final prefs = await SharedPreferences.getInstance();
        final key = 'last_quote_seq_${cid}_$datePart';
        int lastSeq = prefs.getInt(key) ?? 100;
        lastSeq += 1;
        await prefs.setInt(key, lastSeq);
        final seqStr = lastSeq.toString().padLeft(4, '0');
        return '$prefix-$datePart-$seqStr';
      } catch (_) {
        final rand = (DateTime.now().millisecondsSinceEpoch % 9000) + 1000;
        return '$prefix-$datePart-$rand';
      }
    }
  }

  double get totalMeasuredAmount =>
      measuredItems.fold(0, (sum, item) => sum + item.total);
  double get totalUnmeasuredAmount =>
      unmeasuredItems.fold(0, (sum, item) => sum + item.total);
  double get actualAmount => totalMeasuredAmount + totalUnmeasuredAmount;
  double get totalSft =>
      measuredItems.fold(0, (sum, item) => sum + item.totalSft);
  double get igst =>
      includeGst ? (actualAmount + transport) * (gstPercentage / 100.0) : 0.0;
  double get grandTotal =>
      actualAmount + transport + igst; // Grand Total includes IGST
  double get balanceDue =>
      (grandTotal - advancePaid).clamp(0.0, double.infinity).toDouble();

  String get amountInWords => _amountInWords(grandTotal);

  /// KPR's payable figure after the customer's advance is deducted.
  ///
  /// Keep this separate from [amountInWords]: the commercial grand total must
  /// remain visible, while the amount requested from the customer is the
  /// remaining balance.
  String get balanceDueInWords => _amountInWords(balanceDue);

  static String _amountInWords(double amount) {
    if (!amount.isFinite || amount <= 0) return "RUPEES ZERO ONLY";
    // Convert once to paise so values such as 99.999 do not produce
    // "One Hundred Paise" instead of carrying into the rupee amount.
    final totalPaise = (amount * 100).round();
    int number = totalPaise ~/ 100;
    final paise = totalPaise % 100;

    String convertChunk(int n) {
      const ones = [
        "",
        "One",
        "Two",
        "Three",
        "Four",
        "Five",
        "Six",
        "Seven",
        "Eight",
        "Nine",
        "Ten",
        "Eleven",
        "Twelve",
        "Thirteen",
        "Fourteen",
        "Fifteen",
        "Sixteen",
        "Seventeen",
        "Eighteen",
        "Nineteen",
      ];
      const tens = [
        "",
        "",
        "Twenty",
        "Thirty",
        "Forty",
        "Fifty",
        "Sixty",
        "Seventy",
        "Eighty",
        "Ninety",
      ];
      if (n < 20) return ones[n];
      if (n < 100)
        return tens[n ~/ 10] + (n % 10 != 0 ? "-${ones[n % 10]}" : "");
      if (n < 1000)
        return "${ones[n ~/ 100]} Hundred${n % 100 != 0 ? " ${convertChunk(n % 100)}" : ""}";
      return "";
    }

    String words = "";
    if (number >= 10000000) {
      words += "${convertChunk(number ~/ 10000000)} Crore ";
      number %= 10000000;
    }
    if (number >= 100000) {
      words += "${convertChunk(number ~/ 100000)} Lakh ";
      number %= 100000;
    }
    if (number >= 1000) {
      words += "${convertChunk(number ~/ 1000)} Thousand ";
      number %= 1000;
    }
    if (number > 0) words += "${convertChunk(number)} ";
    words += "Rupees";
    if (paise > 0) words += " and ${convertChunk(paise)} Paise";
    return ("$words Only").toUpperCase();
  }

  Map<String, dynamic> toMap({String? clientId, bool includeStatus = true}) {
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
      'advance_paid': advancePaid,
      'include_gst': includeGst,
      'gst_percentage': gstPercentage,
      if (includeStatus) 'status': status.value,
      'supplier_company': supplierCompany,
      'sync_version': syncVersion,
      if (clientId != null && clientId.isNotEmpty) 'client_id': clientId,
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
    q.advancePaid = (map['advance_paid'] ?? 0).toDouble();
    q.createdAt =
        map['created_at'] != null
            ? DateTime.parse(map['created_at'])
            : DateTime.now();
    q.includeGst = map['include_gst'] ?? false;
    q.gstPercentage = (map['gst_percentage'] ?? 0.0).toDouble();
    q.status = QuotationStatusX.fromString(map['status']);
    q.syncVersion = (map['sync_version'] as num?)?.toInt() ?? 0;
    q.supplierCompany = map['supplier_company'] ?? '';
    if (map['measured_items'] != null && map['measured_items'] is List) {
      q.measuredItems =
          (map['measured_items'] as List)
              .map(
                (m) => MeasuredItem.fromMap(
                  m is Map<String, dynamic>
                      ? m
                      : Map<String, dynamic>.from(m as Map),
                ),
              )
              .toList();
    }
    if (map['unmeasured_items'] != null && map['unmeasured_items'] is List) {
      q.unmeasuredItems =
          (map['unmeasured_items'] as List)
              .map(
                (m) => UnmeasuredItem.fromMap(
                  m is Map<String, dynamic>
                      ? m
                      : Map<String, dynamic>.from(m as Map),
                ),
              )
              .toList();
    }
    return q;
  }
}

/// PRICING PARITY CONTRACT — read before editing any getter in this class.
///
/// This class is the AUTHORITATIVE uPVC pricing implementation because it renders
/// the customer-facing PDF. It is mirrored in TypeScript at `src/lib/pricing.ts`,
/// which is the single source of truth for every web/API surface (the formula used
/// to be copy-pasted into 4 places and had already drifted).
///
/// If you change `sft`, `totalSft`, `total`, `igst` or `grandTotal` here, you MUST
/// make the identical change in `src/lib/pricing.ts` in the SAME commit, and re-run
/// the parity fixtures (`PRICING_PARITY_FIXTURES` in that file). Preserve the
/// multiplication ORDER exactly — float multiplication is not associative, and a
/// reordering can move the result by a paisa. The mobile PDF and the web dashboard
/// disagreeing on a total is a trust-killer with the client.
class MeasuredItem {
  String? id;
  Key cardKey = UniqueKey();
  String code = '';
  String description = '';
  double width = 0;
  double height = 0;
  int units = 1;
  String glass = '';
  double rate = 0;

  /// Mirrored by `sqft()` in src/lib/pricing.ts. 304.8 mm = 1 foot.
  double get sft => (width / 304.8) * (height / 304.8);
  double get totalSft => sft * units;
  double get total => totalSft * rate;

  Map<String, dynamic> toMap(String quotationId, {String? clientId}) {
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
      if (clientId != null && clientId.isNotEmpty) 'client_id': clientId,
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
  Key cardKey = UniqueKey();
  String description = '';
  int units = 1;
  double rate = 0;
  double get total => units * rate;

  Map<String, dynamic> toMap(String quotationId, {String? clientId}) {
    return {
      if (id != null) 'id': id,
      'quotation_id': quotationId,
      'description': description,
      'units': units,
      'rate': rate,
      if (clientId != null && clientId.isNotEmpty) 'client_id': clientId,
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

  Map<String, dynamic> toMap({String? clientId}) {
    return {
      if (id != null) 'id': id,
      'recipient': recipient,
      'subject': subject,
      'body': body,
      if (clientId != null && clientId.isNotEmpty) 'client_id': clientId,
    };
  }
}
