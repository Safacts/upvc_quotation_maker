import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseConfig {
  // LIVE production project (Mumbai, effxrwrbsjduvhmorvrq) — cutover completed
  // 20-08-2026. Aadi approved this change 21-08-2026 (was locked on Tokyo
  // `gumpmnbjdtzajhysnnaz`, which is now the staging/archive project).
  // Anon key is public by design — RLS + the `x-client-id` header are the
  // tenant boundary. Keep in sync with lib/config/client_config.dart defaults.
  static const String supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'https://effxrwrbsjduvhmorvrq.supabase.co',
  );
  static const String supabaseAnonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmZnhyd3Jic2pkdXZobW9ydnJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzI2ODgsImV4cCI6MjA5NTkwODY4OH0.47s0OUVmo3aeeICiLL_j-cfaiI_Z8i7l7tGIukKgs7I',
  );

  static Future<void> initialize() async {
    await Supabase.initialize(
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
    );
  }

  static SupabaseClient get client => Supabase.instance.client;
}
