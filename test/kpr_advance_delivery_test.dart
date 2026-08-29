import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'KPR and Venkateshwara advance are gated in entry UI and email summary',
    () {
      final source = File('lib/quotation_screen.dart').readAsStringSync();

      expect(source, contains('_supportsAdvance'));
      expect(source, contains("'kprupvc'"));
      expect(source, contains("'venkateshwara'"));
      expect(source, contains("ValueKey('kpr-advance-paid-field')"));
      expect(source, contains('Advance Paid'));
      expect(source, contains('Remaining Amount'));
      expect(source, contains('Advance Paid'));
    },
  );

  test('KPR and Venkateshwara PDF and payment QR use the remaining amount', () {
    final source = File('lib/pdf_generator.dart').readAsStringSync();

    expect(source, contains('kprAdvance:'));
    expect(source, contains("'kprupvc'"));
    expect(source, contains("'venkateshwara'"));
    expect(source, contains("'Remaining Amount'"));
    expect(source, contains("'Remaining Amount in Words'"));
    expect(source, contains('data.balanceDueInWords'));
    expect(source, contains('data.balanceDue'));
    expect(source, contains('data.grandTotal'));
  });
}
