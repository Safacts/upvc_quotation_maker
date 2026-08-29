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
    final totalBeforeAdvance = quote.grandTotal;
    quote.advancePaid = 250;

    expect(quote.grandTotal, totalBeforeAdvance);
    expect(quote.balanceDue, closeTo(totalBeforeAdvance - 250, 0.000001));
    expect(quote.toMap()['advance_paid'], 250);
  });

  test('balance cannot become negative when advance exceeds total', () {
    final quote = QuotationData()..advancePaid = 100;
    expect(quote.balanceDue, 0);
    expect(quote.balanceDueInWords, 'RUPEES ZERO ONLY');
  });

  test('amount-in-words rounds paise without producing one hundred paise', () {
    final quote =
        QuotationData()
          ..transport = 99.999
          ..advancePaid = 0;

    expect(quote.amountInWords, 'ONE HUNDRED RUPEES ONLY');
  });
}
