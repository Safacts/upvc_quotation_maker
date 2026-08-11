/// OFFLINE TIER (Rs.10,000 "Low") — PAYMENT / RECEIVABLES DOMAIN MODELS.
///
/// ZERO-SERVER CONTRACT
/// --------------------
/// Nothing in `lib/offline/**` may import:
///   * `package:supabase_flutter/...`
///   * `../../supabase_config.dart`
///   * `package:http/http.dart`
///   * `package:connectivity_plus/...`
///   * anything under `lib/services/**`
///
/// The Low tier is sold on the promise that the app makes ZERO network calls.
/// `test/offline_no_network_test.dart` fails the build on any banned import and
/// Bugsy verifies it with a packet capture. Breaking this is a breach of the
/// client contract, not a bug. This file imports only `flutter/foundation.dart`
/// (for `@immutable`), `intl` (date formatting) and its sibling `models.dart`.
///
/// MONEY CONTRACT
/// --------------
/// Every amount here is a Dart `double`, matching `grand_total` (SQLite REAL)
/// and the pricing getters in `models.dart`. That means EQUALITY ON MONEY IS
/// FORBIDDEN: `0.1 + 0.2 != 0.3`, and a quotation of Rs.1,20,000 paid in three
/// instalments will land a few nano-rupees away from the total. Every "is this
/// settled?" question in this tier goes through [kMoneyEpsilon]. A screen that
/// writes `paid == grandTotal` will tell the owner a fully-paid job is still
/// outstanding, and they will chase a customer who has already paid.
library;

import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';

import 'models.dart';

/// Half a paisa, in rupees.
///
/// The tolerance for EVERY money comparison in the offline tier. Chosen as half
/// the smallest unit Indian currency can actually express: anything below this
/// cannot be paid, received or printed, so it is definitionally zero. Never
/// compare two money doubles with `==`, `<= 0` or `>= total` directly.
const double kMoneyEpsilon = 0.005;

/// `yyyy-MM-dd` — the ONLY format written to the `payments.date` column.
///
/// Zero-padded and therefore lexicographically sortable, which is what lets the
/// repository do `date >= ? AND date <= ?` as a TEXT comparison in SQL instead
/// of loading every payment ever taken and filtering in Dart. Identical to the
/// format `OfflineQuotation.toDb()` writes for `quotations.date`, so the two
/// tables can be range-filtered and merged with the same arguments.
final DateFormat paymentDateFormat = DateFormat('yyyy-MM-dd');

// ---------------------------------------------------------------------------
// Payment method
// ---------------------------------------------------------------------------

/// How the money physically arrived.
///
/// Deliberately a closed set rather than free text: the reports screen groups
/// receipts by method, and free text produces "UPI", "upi", "Upi", "G Pay" and
/// "gpay" as five separate rows in the owner's own collection report.
enum PaymentMethod { cash, upi, bankTransfer, cheque, card, other }

extension PaymentMethodX on PaymentMethod {
  /// Human label for UI, PDF receipts and the ledger `ref` column.
  ///
  /// ⚠️ Kept strictly ASCII. The offline PDF generator uses the PDF standard
  /// Helvetica (Type1), which is LATIN-1 ONLY — `latin1.encode` THROWS on a
  /// non-ASCII rune, so a fancy dash or a rupee glyph here would not merely
  /// look wrong, it would make the whole receipt fail to generate.
  String get label => switch (this) {
        PaymentMethod.cash => 'Cash',
        PaymentMethod.upi => 'UPI',
        PaymentMethod.bankTransfer => 'Bank Transfer',
        PaymentMethod.cheque => 'Cheque',
        PaymentMethod.card => 'Card',
        PaymentMethod.other => 'Other',
      };

  /// The value persisted in `payments.method`.
  ///
  /// ⚠️ These strings are STORAGE. Renaming one silently reclassifies every
  /// historical payment as [PaymentMethod.other] (see [PaymentMethodX.fromString],
  /// which cannot distinguish "new spelling" from "corrupt row"). If a value
  /// ever has to change, it needs a data migration in `offline_db.dart`, not an
  /// edit here.
  String get value => switch (this) {
        PaymentMethod.cash => 'cash',
        PaymentMethod.upi => 'upi',
        PaymentMethod.bankTransfer => 'bank_transfer',
        PaymentMethod.cheque => 'cheque',
        PaymentMethod.card => 'card',
        PaymentMethod.other => 'other',
      };

  /// True when [reference] is worth prompting for on the entry form.
  ///
  /// A cheque with no number and a UPI receipt with no transaction id are both
  /// unverifiable three months later when the customer disputes the payment.
  /// Cash genuinely has no reference, so nagging for one trains the owner to
  /// type junk.
  bool get wantsReference => switch (this) {
        PaymentMethod.cheque => true,
        PaymentMethod.upi => true,
        PaymentMethod.bankTransfer => true,
        PaymentMethod.card => true,
        PaymentMethod.cash => false,
        PaymentMethod.other => false,
      };

  /// Parse a stored value. Anything unrecognised (null, empty, a value written
  /// by a future version, a corrupt row) degrades to [PaymentMethod.other].
  ///
  /// WHY never throw: this runs while building the payment list. One bad row
  /// must not blank the screen and hide the other 200 receipts — the money was
  /// still received, only its label is unknown.
  static PaymentMethod fromString(String? s) =>
      switch (s?.trim().toLowerCase()) {
        'cash' => PaymentMethod.cash,
        'upi' => PaymentMethod.upi,
        'bank_transfer' => PaymentMethod.bankTransfer,
        // Tolerated spellings so a hand-edited .db or an older/other writer
        // does not silently collapse into `other`.
        'bank' => PaymentMethod.bankTransfer,
        'banktransfer' => PaymentMethod.bankTransfer,
        'neft' => PaymentMethod.bankTransfer,
        'rtgs' => PaymentMethod.bankTransfer,
        'imps' => PaymentMethod.bankTransfer,
        'cheque' => PaymentMethod.cheque,
        'check' => PaymentMethod.cheque,
        'card' => PaymentMethod.card,
        _ => PaymentMethod.other,
      };
}

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

/// One receipt against one quotation.
///
/// Mutable (like [OfflineQuotation] and [OfflineCustomer]) because the entry
/// sheet edits fields in place before calling `PaymentRepository.save`.
///
/// A payment ALWAYS belongs to a quotation — [quotationId] is a real FK with
/// `ON DELETE CASCADE`. There is deliberately no "unallocated advance" concept
/// in this tier: an amount that belongs to no document cannot be reconciled,
/// cannot be printed on anything, and turns the ledger into a puzzle.
class OfflinePayment {
  OfflinePayment({
    this.id,
    this.quotationId = '',
    this.customerId = '',
    DateTime? date,
    this.amount = 0,
    this.method = PaymentMethod.cash,
    this.reference = '',
    this.notes = '',
    DateTime? createdAt,
    DateTime? updatedAt,
  })  : date = date ?? DateTime.now(),
        createdAt = createdAt ?? DateTime.now(),
        updatedAt = updatedAt ?? DateTime.now();

  /// Null until the repository assigns one via `OfflineDb.newId()`.
  String? id;

  /// Owning quotation. Enforced by a FOREIGN KEY, so a value that does not
  /// resolve makes the INSERT fail rather than creating an orphan receipt.
  String quotationId;

  /// Denormalised copy of the quotation's `customer_id`.
  ///
  /// WHY duplicated rather than joined every time: the customer ledger and the
  /// per-customer outstanding figure filter on it directly, backed by
  /// `idx_pay_customer`. Joining through `quotations` on every ledger build is
  /// a second index lookup per row for a value that cannot change (a receipt
  /// does not move between customers). May legitimately be '' for a walk-in who
  /// was never saved to the address book — the ledger simply has no entry for
  /// them, which is correct, because there is no customer to have one.
  String customerId;

  /// Value date of the receipt. Only the DATE part is persisted (`yyyy-MM-dd`),
  /// matching `quotations.date` so the two can be merged in one sorted ledger.
  DateTime date;

  /// Rupees received. Always finite and `>= 0` — the repository rejects
  /// anything else. See `PaymentRepository.save`.
  double amount;

  PaymentMethod method;

  /// Cheque number / UPI transaction id / bank UTR. Free text on purpose: the
  /// formats differ per bank and a validator here would block real receipts.
  String reference;

  String notes;

  DateTime createdAt;
  DateTime updatedAt;

  /// Row for the `payments` table.
  ///
  /// ⚠️ Deliberately carries NO `sync_status` key, exactly like
  /// `OfflineQuotation.toDb()`. That column is owned by the repository's SQL so
  /// a stale in-memory value can never demote a row that is still waiting to be
  /// pushed. See `OfflineDb.syncStatusOnUpdateSql`.
  Map<String, Object?> toDb() => <String, Object?>{
        'id': id,
        'quotation_id': quotationId,
        'customer_id': customerId,
        // Date-only and zero-padded so SQL TEXT range filters work. Writing an
        // ISO timestamp here would break `date <= '2026-08-10'` for every
        // payment taken after midnight on the last day of a range.
        'date': paymentDateFormat.format(date),
        'amount': amount,
        'method': method.value,
        'reference': reference,
        'notes': notes,
        'created_at': createdAt.toIso8601String(),
        'updated_at': updatedAt.toIso8601String(),
      };

  /// Every field goes through the coercion helpers in `models.dart`: SQLite is
  /// dynamically typed, so a REAL column legitimately comes back as an `int`
  /// when the stored value happened to be whole (`5000` not `5000.0`), and a
  /// bare `m['amount'] as double` would throw on exactly the round numbers
  /// people actually pay.
  factory OfflinePayment.fromDb(Map<String, Object?> m) => OfflinePayment(
        id: m['id'] as String?,
        quotationId: asText(m['quotation_id']),
        customerId: asText(m['customer_id']),
        date: parsePaymentDate(m['date']),
        amount: asDouble(m['amount']),
        method: PaymentMethodX.fromString(m['method'] as String?),
        reference: asText(m['reference']),
        notes: asText(m['notes']),
        createdAt: parsePaymentDate(m['created_at']),
        updatedAt: parsePaymentDate(m['updated_at']),
      );

  OfflinePayment copy() => OfflinePayment(
        id: id,
        quotationId: quotationId,
        customerId: customerId,
        date: date,
        amount: amount,
        method: method,
        reference: reference,
        notes: notes,
        createdAt: createdAt,
        updatedAt: updatedAt,
      );

  @override
  String toString() =>
      'OfflinePayment(id: $id, quotation: $quotationId, ${method.value}, '
      '${amount.toStringAsFixed(2)} on ${paymentDateFormat.format(date)})';
}

/// Parse a date coming out of SQLite.
///
/// Must tolerate BOTH shapes because this tier stores both:
///   * `'2026-08-10'`                     — `payments.date`, `quotations.date`
///   * `'2026-08-10T14:32:07.123456'`     — `created_at`, `updated_at`
/// `DateTime.tryParse` handles each, and an unparseable value falls back to
/// "now" rather than throwing — a receipt with a mangled date must still show
/// its AMOUNT, because the amount is the part the owner is owed.
///
/// Public (unlike models.dart's private `_parseDate`) so the payment repository
/// and any reporting agent decode dates identically instead of each writing
/// their own slightly different parser.
DateTime parsePaymentDate(Object? v) {
  if (v == null) return DateTime.now();
  if (v is DateTime) return v;
  if (v is int) return DateTime.fromMillisecondsSinceEpoch(v);
  final s = v.toString().trim();
  if (s.isEmpty) return DateTime.now();
  return DateTime.tryParse(s) ?? DateTime.now();
}

/// Midnight of [d] — strips the time so two dates can be compared as days.
DateTime paymentDateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

// ---------------------------------------------------------------------------
// Per-quotation payment summary
// ---------------------------------------------------------------------------

/// "How much of this quotation has actually been collected?"
///
/// Immutable and computed in one place so the list badge, the detail header,
/// the dashboard KPI and the PDF footer can never disagree about whether a job
/// is paid. Three screens each doing their own subtraction is how one of them
/// ends up rounding differently.
@immutable
class PaymentSummary {
  const PaymentSummary({
    required this.quotationId,
    required this.grandTotal,
    required this.paid,
  });

  final String quotationId;

  /// The quotation's `grand_total` (the denormalised column, which is what the
  /// PDF the customer holds was rendered from).
  final double grandTotal;

  /// `COALESCE(SUM(payments.amount), 0)` for this quotation.
  final double paid;

  /// Still owed. RAW, NOT clamped.
  ///
  /// ⚠️ Deliberately allowed to go NEGATIVE. Clamping at zero would hide an
  /// overpayment, and an overpayment is real money the business owes back — the
  /// owner needs to see it to refund it or carry it forward. Screens that must
  /// not show a negative should render [isOverpaid] as an explicit "Rs.X
  /// excess" state, never by silently taking `max(0, balance)`.
  double get balance => grandTotal - paid;

  /// Settled. Uses [kMoneyEpsilon]; `balance == 0.0` would be false for a job
  /// paid in three instalments that sum to a few nano-rupees off the total, and
  /// the owner would chase a customer who has already paid in full.
  bool get isPaid => balance <= kMoneyEpsilon;

  /// Something has been received, but not everything.
  bool get isPartiallyPaid => paid > kMoneyEpsilon && !isPaid;

  /// Nothing at all has been received yet.
  bool get isUnpaid => paid <= kMoneyEpsilon;

  /// More was received than was billed.
  bool get isOverpaid => balance < -kMoneyEpsilon;

  /// Progress, 0..100, for a progress bar or a percentage chip.
  ///
  /// Two guards that both exist because of real crash/nonsense modes:
  ///  * `grandTotal <= 0` returns 0 — a zero-value or draft quotation would
  ///    otherwise divide by zero and produce `NaN`/`Infinity`, and `NaN` poisons
  ///    every average computed over a list of these.
  ///  * CLAMPED to 0..100 even though [balance] is raw. `LinearProgressIndicator`
  ///    ASSERTS `0.0 <= value <= 1.0`, so a 110% overpayment would crash the
  ///    widget in debug. Overpayment stays visible through [isOverpaid] and the
  ///    negative [balance]; it does not need to break the progress bar too.
  double get percentPaid {
    if (grandTotal <= 0) return 0;
    final pct = (paid / grandTotal) * 100.0;
    if (!pct.isFinite) return 0;
    if (pct < 0) return 0;
    if (pct > 100) return 100;
    return pct;
  }

  /// Short status word for a chip: 'Paid' | 'Overpaid' | 'Part paid' | 'Unpaid'.
  String get statusLabel {
    if (isOverpaid) return 'Overpaid';
    if (isPaid) return 'Paid';
    if (isPartiallyPaid) return 'Part paid';
    return 'Unpaid';
  }

  /// An empty summary for a quotation with no payments — used so callers never
  /// have to handle a null.
  static PaymentSummary empty(String quotationId, [double grandTotal = 0]) =>
      PaymentSummary(
        quotationId: quotationId,
        grandTotal: grandTotal,
        paid: 0,
      );

  @override
  String toString() => 'PaymentSummary($quotationId: paid '
      '${paid.toStringAsFixed(2)} of ${grandTotal.toStringAsFixed(2)}, '
      'balance ${balance.toStringAsFixed(2)}, $statusLabel)';
}

// ---------------------------------------------------------------------------
// Customer ledger
// ---------------------------------------------------------------------------

/// [LedgerEntry.type] for a quotation (a DEBIT — what the customer owes).
const String kLedgerTypeQuotation = 'quotation';

/// [LedgerEntry.type] for a payment (a CREDIT — what the customer paid).
const String kLedgerTypePayment = 'payment';

/// One line of a customer statement.
///
/// Classic two-column bookkeeping: exactly one of [debit] / [credit] is
/// non-zero. Kept as two fields rather than one signed amount because that is
/// how the owner's accountant reads a statement, and because summing a signed
/// column makes an accidental sign flip invisible.
@immutable
class LedgerEntry {
  const LedgerEntry({
    required this.date,
    required this.type,
    required this.ref,
    required this.description,
    required this.debit,
    required this.credit,
    required this.runningBalance,
  });

  final DateTime date;

  /// [kLedgerTypeQuotation] or [kLedgerTypePayment]. A plain String, not an
  /// enum, so a reporting agent can widen it later (credit notes, write-offs)
  /// without a breaking change to this shared type.
  final String type;

  /// Quote number, or the payment's reference falling back to its method label.
  final String ref;

  final String description;

  /// Quotation grand total — what they were billed. 0 on a payment row.
  final double debit;

  /// Payment amount — what they paid. 0 on a quotation row.
  final double credit;

  /// Cumulative `debit - credit` up to AND INCLUDING this row.
  ///
  /// Computed by the repository while it merges the two sources, because it is
  /// only meaningful in the context of the whole ordered list — a widget that
  /// tried to derive it per row would need the rows before it anyway.
  final double runningBalance;

  bool get isQuotation => type == kLedgerTypeQuotation;
  bool get isPayment => type == kLedgerTypePayment;

  @override
  String toString() => 'LedgerEntry(${paymentDateFormat.format(date)} $type '
      '$ref dr=${debit.toStringAsFixed(2)} cr=${credit.toStringAsFixed(2)} '
      'bal=${runningBalance.toStringAsFixed(2)})';
}

/// A complete customer statement: every quotation raised and every rupee
/// received, in one chronological list.
@immutable
class CustomerLedger {
  const CustomerLedger({
    required this.customerId,
    required this.customerName,
    required this.entries,
    required this.totalDebit,
    required this.totalCredit,
  });

  final String customerId;

  /// Resolved from the `customers` table, falling back to the most recent
  /// quotation's `customer_name` when the address-book row was deleted.
  /// Quotations deliberately have NO FK to customers (a quotation is a
  /// historical document and keeps its own copy of the name), so a deleted
  /// customer still has a perfectly valid ledger.
  final String customerName;

  /// Sorted by date ASC, then quotation-before-payment on the same date.
  final List<LedgerEntry> entries;

  final double totalDebit;
  final double totalCredit;

  /// What the customer still owes overall. Negative means the business owes
  /// them (advance held / overpayment). Raw, for the same reason
  /// [PaymentSummary.balance] is raw.
  double get closingBalance => totalDebit - totalCredit;

  bool get isSettled => closingBalance.abs() <= kMoneyEpsilon;
  bool get isEmpty => entries.isEmpty;
  bool get isNotEmpty => entries.isNotEmpty;

  static CustomerLedger empty(String customerId, [String customerName = '']) =>
      CustomerLedger(
        customerId: customerId,
        customerName: customerName,
        entries: const <LedgerEntry>[],
        totalDebit: 0,
        totalCredit: 0,
      );

  @override
  String toString() => 'CustomerLedger($customerName, ${entries.length} entries, '
      'closing ${closingBalance.toStringAsFixed(2)})';
}
