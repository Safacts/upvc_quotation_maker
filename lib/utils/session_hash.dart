import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Reads the session password hash from wherever the login flow stored it.
///
/// Login writes to [FlutterSecureStorage] on native platforms (with
/// SharedPreferences only as an emergency fallback), while several readers
/// were checking SharedPreferences alone — silently returning null after
/// every successful native login and making server calls send an empty
/// password hash (403 "password hash required").
Future<String> readSessionPasswordHash() async {
  if (!kIsWeb) {
    try {
      const storage = FlutterSecureStorage();
      final v = await storage.read(key: 'session_password_hash');
      if (v != null && v.isNotEmpty) return v;
    } catch (_) {
      // Secure storage unavailable (locked profile etc.) — fall through.
    }
  }
  try {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('session_password_hash') ?? '';
  } catch (_) {
    return '';
  }
}
