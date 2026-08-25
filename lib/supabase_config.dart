import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseConfig {
  // The deployment pipeline supplies the environment-specific project and key
  // with --dart-define. Do not commit a JWT fallback: it makes the bundle
  // ambiguous and trips the release secret scanner.
  static const String supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: '',
  );
  static const String supabaseAnonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue: '',
  );

  static Future<void> initialize() async {
    await Supabase.initialize(
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
    );
  }

  static SupabaseClient get client => Supabase.instance.client;
}
