import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseConfig {
  static const String supabaseUrl = 'https://effxrwrbsjduvhmorvrq.supabase.co';
  static const String supabaseAnonKey = 'sb_publishable_GmfOXLriCvXdppszTkF6Mg_FuLXt6PN';

  static Future<void> initialize() async {
    await Supabase.initialize(
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
    );
  }

  static SupabaseClient get client => Supabase.instance.client;
}
