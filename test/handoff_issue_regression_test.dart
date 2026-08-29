import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('redacted client config keeps a build-time anon key for sync', () {
    final source = File('lib/config/client_config.dart').readAsStringSync();
    expect(source, contains('SupabaseConfig.supabaseAnonKey'));
    expect(source, contains('_asStringOr'));
  });

  test('email callers provide the admin identity used by the auth route', () {
    final quotation = File('lib/quotation_screen.dart').readAsStringSync();
    final portal = File('lib/email_portal_screen.dart').readAsStringSync();
    expect(quotation, contains("'admin_email'"));
    expect(portal, contains("'admin_email'"));
    expect(quotation, contains("'admin_password_hash'"));
    expect(portal, contains("'admin_password_hash'"));
  });

  test('share link and advance support remain tenant-scoped', () {
    final quotation = File('lib/quotation_screen.dart').readAsStringSync();
    final pdf = File('lib/pdf_generator.dart').readAsStringSync();
    final share = File('lib/quote_share.dart').readAsStringSync();
    expect(quotation, contains("'venkateshwara'"));
    expect(pdf, contains("'venkateshwara'"));
    expect(share, contains('Review & confirm online'));
    expect(share, contains('reviewUrl'));
  });
}
