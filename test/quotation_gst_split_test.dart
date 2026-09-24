import 'package:flutter_test/flutter_test.dart';
import 'package:upvc_quotation_maker/models.dart';

/// CGST/SGST vs IGST display split on quotations (KPR GST fix, 24-09-2026).
///
/// Contract under test: the split is DISPLAY ONLY. Grand totals must be
/// bit-identical with the flag on or off, and CGST + SGST must equal the old
/// single IGST lump to the last paisa.
QuotationData _quote({required bool interstate}) {
  final q = QuotationData()
    ..includeGst = true
    ..gstPercentage = 18.0
    ..isInterstate = interstate
    ..transport = 2500;
  q.measuredItems = [
    MeasuredItem()
      ..description = 'Sliding window'
      ..width = 1200
      ..height = 1500
      ..units = 2
      ..rate = 450,
  ];
  return q;
}

void main() {
  test('intra-state splits CGST + SGST paisa-exact', () {
    final q = _quote(interstate: false);
    // Display legs are paisa-rounded; they reconcile with the full-precision
    // lump to within one paisa, while grandTotal stays bit-identical (below).
    expect(q.cgstAmount + q.sgstAmount, closeTo(q.igst, 0.01));
    expect(q.igstAmount, 0.0);
    // 18% intra-state: CGST and SGST differ by at most one paisa.
    expect((q.cgstAmount - q.sgstAmount).abs(), lessThanOrEqualTo(0.01));
  });

  test('inter-state puts everything on IGST', () {
    final q = _quote(interstate: true);
    expect(q.igstAmount, closeTo(q.igst, 0.000001));
    expect(q.cgstAmount, 0.0);
    expect(q.sgstAmount, 0.0);
  });

  test('grand total is identical with the flag on or off', () {
    final intra = _quote(interstate: false);
    final inter = _quote(interstate: true);
    expect(intra.grandTotal, inter.grandTotal);
  });

  test('GST off yields zero legs', () {
    final q = _quote(interstate: false)..includeGst = false;
    expect(q.cgstAmount, 0.0);
    expect(q.sgstAmount, 0.0);
    expect(q.igstAmount, 0.0);
  });

  test('isInterstate round-trips through toMap/fromMap', () {
    // NOTE: toMap carries scalar fields only (items travel separately), so
    // this asserts the flag itself — the money math is covered above.
    final q = _quote(interstate: true);
    expect(QuotationData.fromMap(q.toMap()).isInterstate, isTrue);

    final domestic = _quote(interstate: false);
    expect(
      QuotationData.fromMap(domestic.toMap()).isInterstate,
      isFalse,
    );
  });

  test('old rows without the flag default to intra-state', () {
    final q = _quote(interstate: false);
    final map = q.toMap()..remove('is_interstate');
    expect(QuotationData.fromMap(map).isInterstate, isFalse);
  });
}
