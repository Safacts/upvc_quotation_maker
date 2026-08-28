import 'package:flutter_test/flutter_test.dart';
import 'package:upvc_quotation_maker/models.dart';

void main() {
  test('advance paid reduces balance but never changes grand total', () {
    final quote = QuotationData()..transport = 500;
    final item =
        MeasuredItem()
          ..width = 1000
          ..height = 1000
          ..units = 1
          ..rate = 100;
    quote.measuredItems.add(item);
    quote.advancePaid = 250;

    expect(quote.grandTotal, 1500);
    expect(quote.balanceDue, 1250);
    expect(quote.toMap()['advance_paid'], 250);
  });

  test('balance cannot become negative when advance exceeds total', () {
    final quote = QuotationData()..advancePaid = 100;
    expect(quote.balanceDue, 0);
  });
}
