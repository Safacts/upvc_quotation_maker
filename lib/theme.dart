import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'config/client_config.dart';

class AppTheme {
  static const Color _defaultPrimary = Color(0xFF6366F1);
  static const Color _defaultGradientEnd = Color(0xFFA855F7);
  static const Color _defaultAccentLight = Color(0xFFEC4899);
  static const Color _defaultAccentDark = Color(0xFFF472B6);

  static LinearGradient get primaryGradient => const LinearGradient(
        colors: [_defaultPrimary, _defaultGradientEnd],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      );

  static LinearGradient primaryGradientFrom(ClientConfig config) => LinearGradient(
        colors: [config.primaryColor, _defaultGradientEnd],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      );

  static TextTheme _safeTextTheme(TextTheme base) {
    if (kIsWeb) return base;
    try {
      return GoogleFonts.outfitTextTheme(base);
    } catch (_) {
      return base;
    }
  }

  static TextStyle _safeOutfit({double? fontSize, FontWeight? fontWeight, double? letterSpacing}) {
    if (kIsWeb) return TextStyle(fontSize: fontSize, fontWeight: fontWeight, letterSpacing: letterSpacing);
    try {
      return GoogleFonts.outfit(fontSize: fontSize, fontWeight: fontWeight, letterSpacing: letterSpacing);
    } catch (_) {
      return TextStyle(fontSize: fontSize, fontWeight: fontWeight, letterSpacing: letterSpacing);
    }
  }



  static ThemeData lightTheme(ClientConfig config) {
    return ThemeData(
      brightness: Brightness.light,
      primaryColor: config.primaryColor,
      scaffoldBackgroundColor: const Color(0xFFF8FAFC), 
      colorScheme: ColorScheme.light(
        primary: config.primaryColor,
        secondary: config.accentColor,
        surface: Colors.white,
        error: Colors.redAccent,
      ),
      textTheme: _safeTextTheme(ThemeData.light().textTheme),
      cardTheme: CardThemeData(
        elevation: 12,
        shadowColor: config.primaryColor.withOpacity(0.15),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(24)),
          side: BorderSide(color: Color(0xCCFFFFFF), width: 1.5),
        ),
        color: const Color(0xCCFFFFFF), // Glass effect
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFFF1F5F9).withOpacity(0.7),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(20),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(20),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(20),
          borderSide: BorderSide(color: config.accentColor, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          elevation: 10,
          shadowColor: config.primaryColor.withOpacity(0.5),
          backgroundColor: config.primaryColor,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          textStyle: _safeOutfit(fontWeight: FontWeight.w700, fontSize: 16, letterSpacing: 1.2),
        ),
      ),
      appBarTheme: AppBarTheme(
        elevation: 0,
        centerTitle: true,
        backgroundColor: Colors.transparent,
        foregroundColor: config.primaryColor,
      ),
    );
  }

  static ThemeData darkTheme(ClientConfig config) {
    return ThemeData(
      brightness: Brightness.dark,
      primaryColor: config.primaryColor,
      scaffoldBackgroundColor: const Color(0xFF0F172A), 
      colorScheme: ColorScheme.dark(
        primary: config.primaryColor,
        secondary: config.accentColor,
        surface: const Color(0xFF1E293B),
        error: Colors.redAccent,
      ),
      textTheme: _safeTextTheme(ThemeData.dark().textTheme),
      cardTheme: const CardThemeData(
        elevation: 16,
        shadowColor: Color(0x99000000), // Colors.black.withOpacity(0.6)
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(24)),
          side: BorderSide(color: Color(0x1AFFFFFF), width: 1),
        ),
        color: Color(0xB31E293B), // Glass effect
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFF0F172A).withOpacity(0.6),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(20),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(20),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(20),
          borderSide: BorderSide(color: config.accentColor, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          elevation: 12,
          shadowColor: config.primaryColor.withOpacity(0.5),
          backgroundColor: config.primaryColor,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          textStyle: _safeOutfit(fontWeight: FontWeight.w700, fontSize: 16, letterSpacing: 1.2),
        ),
      ),
      appBarTheme: const AppBarTheme(
        elevation: 0,
        centerTitle: true,
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
      ),
    );
  }
}
