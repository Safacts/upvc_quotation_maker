import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'recovery migration keeps saves atomic, idempotent and tenant scoped',
    () {
      final sql =
          File(
            'supabase/migrations/050_unbreakable_quotation_sync.sql',
          ).readAsStringSync();

      expect(sql, contains('quotation_recovery_snapshots'));
      expect(sql, contains('save_quotation_bundle_v1'));
      expect(sql, contains('FOR UPDATE'));
      expect(sql, contains('last_operation_id = p_operation_id'));
      expect(sql, contains("'status', 'conflict'"));
      expect(sql, contains("current_setting('request.headers'"));
      expect(sql, contains('DELETE FROM public.measured_items'));
      expect(sql, contains('DELETE FROM public.unmeasured_items'));
    },
  );
}
