import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Eva migration enables tenant isolation and integrity checks', () {
    final sql = File('supabase/migrations/056_eva_tenant_safety.sql').readAsStringSync();
    for (final table in ['price_structures', 'price_elements', 'profile_catalog', 'offcut_inventory', 'quotation_revisions', 'project_openings']) {
      expect(sql, contains('ALTER TABLE public.$table ENABLE ROW LEVEL SECURITY'));
    }
    expect(sql, contains('price_elements_tenant'));
    expect(sql, contains('quotation_revisions_tenant'));
    expect(sql, contains('validate_project_opening_quotation_tenant'));
    expect(sql, contains('price_structures_one_default_per_client'));
  });
}
