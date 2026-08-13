/// Data models for the Phase-5 mobile power features.
///
/// Kept OUT of `models.dart` deliberately: that file carries the PRICING PARITY
/// CONTRACT with `src/lib/pricing.ts`, and every unrelated edit to it forces a
/// re-read of that contract. These models touch no quotation arithmetic.
///
/// Backing schema: `supabase/migrations/012_mobile_features.sql`.
library;

import 'package:intl/intl.dart';

// ---------------------------------------------------------------------------
// Product — master catalogue row (`products`, migration 008)
// ---------------------------------------------------------------------------

/// A row from the `products` master table, used by the catalogue dropdown in
/// the quotation editor so a fabricator taps a product instead of retyping a
/// description and rate on every single line.
class Product {
  Product({
    this.id,
    this.name = '',
    this.category = '',
    this.description = '',
    this.price = 0,
    this.unit = 'SFT',
    this.stockQuantity = 0,
    this.lowStockThreshold = 10,
    this.hsnCode = '3925',
  });

  final String? id;
  final String name;
  final String category;
  final String description;

  /// Rate per [unit]. Named `price` in the DB; it is the per-unit rate that
  /// lands in `MeasuredItem.rate` / `UnmeasuredItem.rate`.
  final double price;

  /// 'SFT' for dimensional (measured) products, anything else (NOS, PCS, SET,
  /// RFT...) for unmeasured ones. This drives which item list the catalogue
  /// offers the product to.
  final String unit;

  /// Current stock level. Default 0 when column is missing from DB.
  final int stockQuantity;

  /// Stock level below which the product is flagged as low. Default 10.
  final int lowStockThreshold;

  /// HSN code for GST invoicing. Default '3925' (UPVC profiles).
  final String hsnCode;

  /// Measured items are priced per square foot; everything else is a countable
  /// piece and belongs in the unmeasured list.
  bool get isMeasured => unit.trim().toUpperCase() == 'SFT';

  /// Whether stock is at or below the low-stock threshold.
  bool get isLowStock => stockQuantity <= lowStockThreshold;

  /// Label shown in the dropdown. Category is included because fabricators
  /// stock near-identical names across categories ("3 Track" window vs door).
  String get displayLabel {
    final buffer = StringBuffer(name.isEmpty ? 'Unnamed product' : name);
    if (category.isNotEmpty) buffer.write('  ·  $category');
    return buffer.toString();
  }

  /// Label with stock level for the inventory screen.
  String get stockLabel => '$stockQuantity in stock';

  static Product fromMap(Map<String, dynamic> map) {
    return Product(
      id: map['id'] as String?,
      name: (map['name'] ?? '') as String,
      category: (map['category'] ?? '') as String,
      description: (map['description'] ?? '') as String,
      price: (map['price'] as num?)?.toDouble() ?? 0,
      unit: ((map['unit'] ?? 'SFT') as String).isEmpty ? 'SFT' : map['unit'] as String,
      stockQuantity: (map['stock_quantity'] as num?)?.toInt() ?? 0,
      lowStockThreshold: (map['low_stock_threshold'] as num?)?.toInt() ?? 10,
      hsnCode: (map['hsn_code'] ?? '3925') as String,
    );
  }

  Map<String, dynamic> toMap({String? clientId}) => {
        if (id != null) 'id': id,
        'name': name,
        'category': category,
        'description': description,
        'price': price,
        'unit': unit,
        'stock_quantity': stockQuantity,
        'low_stock_threshold': lowStockThreshold,
        'hsn_code': hsnCode,
        if (clientId != null && clientId.isNotEmpty) 'client_id': clientId,
      };

  /// Returns a map with only the original columns (pre-inventory) so inserts
  /// work even when the inventory migration hasn't been applied yet.
  Map<String, dynamic> toLegacyMap({String? clientId}) => {
        if (id != null) 'id': id,
        'name': name,
        'category': category,
        'description': description,
        'price': price,
        'unit': unit,
        if (clientId != null && clientId.isNotEmpty) 'client_id': clientId,
      };

  Product copyWith({
    String? id,
    String? name,
    String? category,
    String? description,
    double? price,
    String? unit,
    int? stockQuantity,
    int? lowStockThreshold,
    String? hsnCode,
  }) {
    return Product(
      id: id ?? this.id,
      name: name ?? this.name,
      category: category ?? this.category,
      description: description ?? this.description,
      price: price ?? this.price,
      unit: unit ?? this.unit,
      stockQuantity: stockQuantity ?? this.stockQuantity,
      lowStockThreshold: lowStockThreshold ?? this.lowStockThreshold,
      hsnCode: hsnCode ?? this.hsnCode,
    );
  }
}

// ---------------------------------------------------------------------------
// StockMovement — `stock_movements` (inventory tracking)
// ---------------------------------------------------------------------------

/// A single stock-in or stock-out event for a product.
class StockMovement {
  StockMovement({
    this.id,
    this.productId = '',
    this.productName = '',
    this.quantity = 0,
    this.type = 'in',
    this.reference = '',
    this.note,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  final String? id;
  final String productId;
  final String productName;
  final int quantity;

  /// 'in' for stock received, 'out' for stock sold/used.
  final String type;
  final String reference;
  final String? note;
  final DateTime createdAt;

  bool get isStockIn => type == 'in';
  int get signedQuantity => isStockIn ? quantity : -quantity;

  static StockMovement fromMap(Map<String, dynamic> map) {
    return StockMovement(
      id: map['id'] as String?,
      productId: (map['product_id'] ?? '') as String,
      productName: (map['product_name'] ?? '') as String,
      quantity: (map['quantity'] as num?)?.toInt() ?? 0,
      type: ((map['type'] ?? 'in') as String),
      reference: (map['reference'] ?? '') as String,
      note: map['note'] as String?,
      createdAt: map['created_at'] != null
          ? DateTime.tryParse(map['created_at'].toString())?.toLocal() ?? DateTime.now()
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toMap({String? clientId}) => {
        if (id != null) 'id': id,
        'product_id': productId,
        'product_name': productName,
        'quantity': quantity,
        'type': type,
        'reference': reference,
        if (note != null) 'note': note,
        if (clientId != null && clientId.isNotEmpty) 'client_id': clientId,
      };
}

// ---------------------------------------------------------------------------
// Payment — `payments` (migration 012)
// ---------------------------------------------------------------------------

/// A payment received against a quotation / customer.
///
/// NOTE: `amount` is `numeric` in Postgres, NOT float8 — deliberately the
/// opposite of the quotation money columns. Never sum a [Payment.amount] into
/// the same float expression as a quotation total (see 012's comments).
class Payment {
  Payment({
    this.id,
    this.quotationId,
    this.customerId,
    this.customerName = '',
    this.amount = 0,
    this.method = 'upi',
    this.reference = '',
    this.note = '',
    DateTime? paidAt,
  }) : paidAt = paidAt ?? DateTime.now();

  final String? id;
  final String? quotationId;
  final String? customerId;
  final String customerName;
  final double amount;

  /// Free text by design (`upi|cash|cheque|neft|rtgs|card|other`); constrained
  /// by the app dropdown, not by DDL.
  final String method;
  final String reference;
  final String note;
  final DateTime paidAt;

  static const List<String> methods = <String>[
    'upi',
    'cash',
    'cheque',
    'neft',
    'rtgs',
    'card',
    'other',
  ];

  String get methodLabel {
    switch (method) {
      case 'upi': return 'UPI';
      case 'cash': return 'Cash';
      case 'cheque': return 'Cheque';
      case 'neft': return 'NEFT';
      case 'rtgs': return 'RTGS';
      case 'card': return 'Card';
      default: return method.toUpperCase();
    }
  }

  static Payment fromMap(Map<String, dynamic> map) {
    return Payment(
      id: map['id'] as String?,
      quotationId: map['quotation_id'] as String?,
      customerId: map['customer_id'] as String?,
      customerName: (map['customer_name'] ?? '') as String,
      amount: (map['amount'] as num?)?.toDouble() ?? 0,
      method: ((map['method'] ?? 'upi') as String),
      reference: (map['reference'] ?? '') as String,
      note: (map['note'] ?? '') as String,
      paidAt: map['paid_at'] != null
          ? DateTime.tryParse(map['paid_at'].toString())?.toLocal() ?? DateTime.now()
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toMap({String? clientId}) => {
        if (id != null) 'id': id,
        if (quotationId != null) 'quotation_id': quotationId,
        if (customerId != null) 'customer_id': customerId,
        'customer_name': customerName,
        'amount': amount,
        'method': method,
        'reference': reference,
        'note': note,
        'paid_at': paidAt.toUtc().toIso8601String(),
        if (clientId != null && clientId.isNotEmpty) 'client_id': clientId,
      };
}

// ---------------------------------------------------------------------------
// QuotationPhoto — `quotation_photos` (migration 012)
// ---------------------------------------------------------------------------

/// A site photo attached to a quotation. The image bytes live in the
/// `site-photos` Storage bucket; this row is only the metadata index.
class QuotationPhoto {
  QuotationPhoto({
    this.id,
    this.quotationId = '',
    this.storagePath = '',
    this.publicUrl = '',
    this.caption = '',
    this.width,
    this.height,
    this.bytes,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  final String? id;
  final String quotationId;

  /// Path inside the bucket: `<client_id>/<quotation_id>/<uuid>.jpg`.
  /// Needed for deletion — the public URL cannot be reversed into a path.
  final String storagePath;
  final String publicUrl;
  final String caption;
  final int? width;
  final int? height;
  final int? bytes;
  final DateTime createdAt;

  /// Used to reserve the correct box before the image downloads, killing the
  /// layout jank you otherwise get in a photo grid.
  double get aspectRatio {
    if (width == null || height == null || width == 0 || height == 0) return 1;
    return width! / height!;
  }

  String get sizeLabel {
    final b = bytes;
    if (b == null || b <= 0) return '';
    if (b < 1024) return '$b B';
    if (b < 1024 * 1024) return '${(b / 1024).toStringAsFixed(0)} KB';
    return '${(b / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  static QuotationPhoto fromMap(Map<String, dynamic> map) {
    return QuotationPhoto(
      id: map['id'] as String?,
      quotationId: (map['quotation_id'] ?? '') as String,
      storagePath: (map['storage_path'] ?? '') as String,
      publicUrl: (map['public_url'] ?? '') as String,
      caption: (map['caption'] ?? '') as String,
      width: (map['width'] as num?)?.toInt(),
      height: (map['height'] as num?)?.toInt(),
      bytes: (map['bytes'] as num?)?.toInt(),
      createdAt: map['created_at'] != null
          ? DateTime.tryParse(map['created_at'].toString())?.toLocal() ?? DateTime.now()
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toMap({String? clientId}) => {
        if (id != null) 'id': id,
        'quotation_id': quotationId,
        'storage_path': storagePath,
        'public_url': publicUrl,
        'caption': caption,
        if (width != null) 'width': width,
        if (height != null) 'height': height,
        if (bytes != null) 'bytes': bytes,
        if (clientId != null && clientId.isNotEmpty) 'client_id': clientId,
      };
}

// ---------------------------------------------------------------------------
// AppNotification — `app_notifications` (migration 012)
// ---------------------------------------------------------------------------

/// One entry in the in-app notification centre. `title`/`body` are denormalised
/// at write time so the feed always shows what was true when the event fired.
class AppNotification {
  AppNotification({
    this.id,
    this.kind = '',
    this.title = '',
    this.body = '',
    this.entityType = '',
    this.entityId = '',
    this.read = false,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  final String? id;

  /// 'quote_opened' | 'payment_received' | 'quote_sent' | 'quote_won' |
  /// 'photo_added' | anything else (degrades to a generic bell).
  final String kind;
  final String title;
  final String body;
  final String entityType;

  /// `text`, not uuid — a notification can point at a non-UUID entity.
  final String entityId;
  final bool read;
  final DateTime createdAt;

  static const String kindQuoteOpened = 'quote_opened';
  static const String kindPaymentReceived = 'payment_received';
  static const String kindQuoteSent = 'quote_sent';
  static const String kindQuoteWon = 'quote_won';
  static const String kindPhotoAdded = 'photo_added';

  /// Human relative time for the feed ("2h ago"). Falls back to an absolute
  /// date past a week, where "9 days ago" stops being useful.
  String get relativeTime {
    final diff = DateTime.now().difference(createdAt);
    if (diff.inSeconds < 60) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return DateFormat('dd MMM yyyy').format(createdAt);
  }

  AppNotification copyWith({bool? read}) => AppNotification(
        id: id,
        kind: kind,
        title: title,
        body: body,
        entityType: entityType,
        entityId: entityId,
        read: read ?? this.read,
        createdAt: createdAt,
      );

  static AppNotification fromMap(Map<String, dynamic> map) {
    return AppNotification(
      id: map['id'] as String?,
      kind: (map['kind'] ?? '') as String,
      title: (map['title'] ?? '') as String,
      body: (map['body'] ?? '') as String,
      entityType: (map['entity_type'] ?? '') as String,
      entityId: (map['entity_id'] ?? '') as String,
      read: (map['read'] as bool?) ?? false,
      createdAt: map['created_at'] != null
          ? DateTime.tryParse(map['created_at'].toString())?.toLocal() ?? DateTime.now()
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toMap({String? clientId}) => {
        if (id != null) 'id': id,
        'kind': kind,
        'title': title,
        'body': body,
        'entity_type': entityType,
        'entity_id': entityId,
        'read': read,
        if (clientId != null && clientId.isNotEmpty) 'client_id': clientId,
      };
}

// ---------------------------------------------------------------------------
// CustomerHistory — the `customer_history()` RPC payload (migration 012)
// ---------------------------------------------------------------------------

/// One quotation row inside a customer's history.
///
/// This is a REPORT shape returned by the RPC (money already rounded to 2dp
/// server-side), not the editable `QuotationData`. Tapping a row loads the real
/// `QuotationData` from `quotations` before opening the editor.
class CustomerHistoryQuote {
  CustomerHistoryQuote({
    required this.id,
    this.quoteNo = '',
    this.status = 'draft',
    this.reference = '',
    this.netTotal = 0,
    this.grandTotal = 0,
    this.paymentStatus = 'unpaid',
    this.amountPaid = 0,
    this.balance = 0,
    this.viewedAt,
    this.viewCount = 0,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  final String id;
  final String quoteNo;
  final String status;
  final String reference;
  final double netTotal;
  final double grandTotal;
  final String paymentStatus;
  final double amountPaid;
  final double balance;

  /// Non-null once the customer has opened the public quote link — this is
  /// what powers the "Quote opened" signal.
  final DateTime? viewedAt;
  final int viewCount;
  final DateTime createdAt;

  bool get wasOpened => viewedAt != null || viewCount > 0;

  static CustomerHistoryQuote fromMap(Map<String, dynamic> map) {
    return CustomerHistoryQuote(
      id: (map['id'] ?? '').toString(),
      quoteNo: (map['quote_no'] ?? '') as String,
      status: (map['status'] ?? 'draft') as String,
      reference: (map['reference'] ?? '') as String,
      netTotal: (map['net_total'] as num?)?.toDouble() ?? 0,
      grandTotal: (map['grand_total'] as num?)?.toDouble() ?? 0,
      paymentStatus: (map['payment_status'] ?? 'unpaid') as String,
      amountPaid: (map['amount_paid'] as num?)?.toDouble() ?? 0,
      balance: (map['balance'] as num?)?.toDouble() ?? 0,
      viewedAt: map['viewed_at'] != null
          ? DateTime.tryParse(map['viewed_at'].toString())?.toLocal()
          : null,
      viewCount: (map['view_count'] as num?)?.toInt() ?? 0,
      createdAt: map['created_at'] != null
          ? DateTime.tryParse(map['created_at'].toString())?.toLocal() ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

/// The complete `customer_history()` response: one round-trip, everything the
/// Customer 360 screen needs.
class CustomerHistory {
  CustomerHistory({
    this.customerName = '',
    this.customerId,
    this.quotations = const [],
    this.payments = const [],
    this.totalQuoted = 0,
    this.totalPaid = 0,
    this.balance = 0,
  });

  final String customerName;
  final String? customerId;
  final List<CustomerHistoryQuote> quotations;
  final List<Payment> payments;
  final double totalQuoted;
  final double totalPaid;
  final double balance;

  int get quoteCount => quotations.length;
  int get paymentCount => payments.length;

  int get wonCount => quotations.where((q) => q.status == 'won').length;

  /// Win rate over DECIDED quotes only (won + lost). Counting drafts as losses
  /// makes an active fabricator look like they lose everything.
  double get winRate {
    final decided =
        quotations.where((q) => q.status == 'won' || q.status == 'lost').length;
    if (decided == 0) return 0;
    return wonCount / decided * 100;
  }

  static CustomerHistory empty(String name) => CustomerHistory(customerName: name);

  static CustomerHistory fromRpc(Map<String, dynamic> json, {String fallbackName = ''}) {
    final customer = (json['customer'] as Map?)?.cast<String, dynamic>() ?? const {};
    final summary = (json['summary'] as Map?)?.cast<String, dynamic>() ?? const {};

    final quotes = ((json['quotations'] as List?) ?? const [])
        .map((e) => CustomerHistoryQuote.fromMap((e as Map).cast<String, dynamic>()))
        .toList();

    final payments = ((json['payments'] as List?) ?? const [])
        .map((e) => Payment.fromMap((e as Map).cast<String, dynamic>()))
        .toList();

    return CustomerHistory(
      customerName: (customer['customer_name'] as String?) ?? fallbackName,
      customerId: customer['customer_id'] as String?,
      quotations: quotes,
      payments: payments,
      totalQuoted: (summary['total_quoted'] as num?)?.toDouble() ?? 0,
      totalPaid: (summary['total_paid'] as num?)?.toDouble() ?? 0,
      balance: (summary['balance'] as num?)?.toDouble() ?? 0,
    );
  }
}
