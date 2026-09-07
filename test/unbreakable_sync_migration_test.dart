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

  test('advance payment is constrained to KPRUPVC at database level', () {
    final sql =
        File(
          'supabase/migrations/051_recovery_integrity_and_kpr_scope.sql',
        ).readAsStringSync();

    expect(sql, contains('scope_quotation_advance_paid_v1'));
    expect(sql, contains("NEW.client_id IS DISTINCT FROM 'kprupvc'"));
    expect(sql, contains('NEW.advance_paid := 0'));
    expect(sql, contains('quotations_advance_paid_kpr_only'));
    expect(sql, contains("client_id = 'kprupvc' OR advance_paid = 0"));
  });

  test(
    'migration 055 restores schema-compatible item payloads and strict versions',
    () {
      final sql =
          File(
            'supabase/migrations/055_fix_quotation_sync_rpc.sql',
          ).readAsStringSync();

      expect(sql, contains('jsonb_to_recordset'));
      expect(sql, contains('code, description, width, height'));
      expect(sql, contains('units, glass, rate, bom_config'));
      expect(sql, contains('description, units, rate'));
      expect(sql, isNot(contains('window_name')));
      expect(sql, isNot(contains('item_name')));
      expect(sql, contains('COALESCE(p_base_version, 0) <= 0'));
      expect(
        sql,
        contains('v_current_version > 1 OR v_last_operation IS NOT NULL'),
      );
      expect(sql, contains("'status', 'conflict'"));
    },
  );
}
