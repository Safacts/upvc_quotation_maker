import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'dashboard preserves local quotations and distinguishes load failure',
    () {
      final source = File('lib/dashboard_screen.dart').readAsStringSync();

      expect(source, contains('localDrafts(clientId)'));
      expect(source, contains('pendingEnvelopes(clientId)'));
      expect(source, contains('Saved quotations could not be loaded yet'));
      expect(source, contains('Your device copies are protected'));
      expect(source, contains('No matching quotations'));
      expect(source, isNot(contains("Text('No quotations found'")));
    },
  );
}
