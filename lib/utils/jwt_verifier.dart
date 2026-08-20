import 'dart:convert';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import '../supabase_config.dart';

class JwtVerifier {
  static const String _expectedIssuer = 'https://gumpmnbjdtzajhysnnaz.supabase.co/auth/v1';
  static const String _expectedType = 'sso';
  
  /// Verifies a Supabase-issued SSO JWT using the anon key (public secret).
  /// Returns the decoded payload if valid, null otherwise.
  /// 
  /// Validates:
  /// - Signature (HS256 with Supabase anon key)
  /// - Issuer matches expected Supabase project
  /// - Token type is 'sso'
  /// - Expiration (exp claim)
  /// - Required claims: client_id, session_id, jti, email
  static Map<String, dynamic>? verifySsoToken(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) {
        debugPrint('JWT verifier: Invalid token format');
        return null;
      }
      
      final headerB64 = parts[0];
      final payloadB64 = parts[1];
      final signatureB64 = parts[2];
      
      // Verify signature
      final signingInput = '$headerB64.$payloadB64';
      final secret = SupabaseConfig.supabaseAnonKey;
      final keyBytes = utf8.encode(secret);
      final inputBytes = utf8.encode(signingInput);
      
      final hmac = Hmac(sha256, keyBytes);
      final digest = hmac.convert(inputBytes);
      final expectedSignature = base64UrlEncode(digest.bytes);
      
      if (expectedSignature != signatureB64) {
        debugPrint('JWT verifier: Invalid signature');
        return null;
      }
      
      // Decode payload
      final payloadJson = utf8.decode(base64Url.decode(base64Url.normalize(payloadB64)));
      final payload = jsonDecode(payloadJson) as Map<String, dynamic>;
      
      // Validate standard claims
      if (payload['iss'] != _expectedIssuer) {
        debugPrint('JWT verifier: Invalid issuer - ${payload['iss']}');
        return null;
      }
      
      final exp = payload['exp'] as int?;
      if (exp == null) {
        debugPrint('JWT verifier: Missing exp claim');
        return null;
      }
      
      final expDate = DateTime.fromMillisecondsSinceEpoch(exp * 1000);
      if (expDate.isBefore(DateTime.now())) {
        debugPrint('JWT verifier: Token expired');
        return null;
      }
      
      // Validate required claims
      if (payload['type'] != _expectedType) {
        debugPrint('JWT verifier: Invalid token type - ${payload['type']}');
        return null;
      }
      
      final clientId = payload['client_id'] as String?;
      if (clientId == null || clientId.isEmpty) {
        debugPrint('JWT verifier: Missing client_id');
        return null;
      }
      
      final sessionId = payload['session_id'] as String?;
      if (sessionId == null || sessionId.isEmpty) {
        debugPrint('JWT verifier: Missing session_id');
        return null;
      }
      
      final jti = payload['jti'] as String?;
      if (jti == null || jti.isEmpty) {
        debugPrint('JWT verifier: Missing jti');
        return null;
      }
      
      final email = payload['email'] as String?;
      if (email == null || email.isEmpty) {
        debugPrint('JWT verifier: Missing email');
        return null;
      }
      
      // All validations passed - return the payload for further processing
      return {
        'client_id': clientId,
        'session_id': sessionId,
        'jti': jti,
        'email': email,
        'role': payload['role'],
        'type': payload['type'],
      };
    } catch (e) {
      debugPrint('JWT verifier: Unexpected error - $e');
      return null;
    }
  }
}