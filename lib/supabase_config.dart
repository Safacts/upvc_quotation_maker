import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseConfig {
  // Supabase project `gumpmnbjdtzajhysnnaz` (migrated 08-08-2026).
  // Anon key is public by design — RLS + the `x-client-id` header are the
  // tenant boundary. Keep in sync with lib/config/client_config.dart defaults.
  static const String supabaseUrl = 'https://gumpmnbjdtzajhysnnaz.supabase.co';
  static const String supabaseAnonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1bXBtbmJqZHR6YWpoeXNubmF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxNjI2NzgsImV4cCI6MjEwMTczODY3OH0.RbzuXFNDM0HXQhdL6Ex1q9s_t1SCejtKmBsYskBwUhs';

  static Future<void> initialize() async {
    await Supabase.initialize(
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
    );
  }

  static SupabaseClient get client => Supabase.instance.client;
}
