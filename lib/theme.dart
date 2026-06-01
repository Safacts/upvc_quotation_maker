import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  // Vibrant Gradient Base Colors
  static const Color primaryGradientStart = Color(0xFF6366F1); // Indigo
  static const Color primaryGradientEnd = Color(0xFFA855F7); // Purple
  
  static const Color accentLight = Color(0xFFEC4899); // Pink
  static const Color accentDark = Color(0xFFF472B6);

  static LinearGradient get primaryGradient => const LinearGradient(
        colors: [primaryGradientStart, primaryGradientEnd],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      );

  static ThemeData get lightTheme {
    return ThemeData(
      brightness: Brightness.light,
      primaryColor: primaryGradientStart,
      scaffoldBackgroundColor: const Color(0xFFF8FAFC), 
      colorScheme: const ColorScheme.light(
        primary: primaryGradientStart,
        secondary: accentLight,
        surface: Colors.white,
        error: Colors.redAccent,
      ),
      textTheme: GoogleFonts.outfitTextTheme(ThemeData.light().textTheme),
      cardTheme: const CardThemeData(
        elevation: 12,
        shadowColor: Color(0x266366F1), // primaryGradientStart with 0.15 opacity
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(24)),
          side: BorderSide(color: Color(0xCCFFFFFF), width: 1.5),
        ),
        color: Color(0xCCFFFFFF), // Glass effect
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
          borderSide: const BorderSide(color: primaryGradientEnd, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          elevation: 10,
          shadowColor: primaryGradientStart.withOpacity(0.5),
          backgroundColor: Colors.transparent, // Uses Ink container for gradient
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          padding: EdgeInsets.zero,
          textStyle: GoogleFonts.outfit(fontWeight: FontWeight.w700, fontSize: 16, letterSpacing: 1.2),
        ),
      ),
      appBarTheme: const AppBarTheme(
        elevation: 0,
        centerTitle: true,
        backgroundColor: Colors.transparent,
        foregroundColor: primaryGradientStart,
      ),
    );
  }

  static ThemeData get darkTheme {
    return ThemeData(
      brightness: Brightness.dark,
      primaryColor: primaryGradientStart,
      scaffoldBackgroundColor: const Color(0xFF0F172A), 
      colorScheme: const ColorScheme.dark(
        primary: primaryGradientStart,
        secondary: accentDark,
        surface: Color(0xFF1E293B),
        error: Colors.redAccent,
      ),
      textTheme: GoogleFonts.outfitTextTheme(ThemeData.dark().textTheme),
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
          borderSide: const BorderSide(color: primaryGradientEnd, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          elevation: 12,
          shadowColor: primaryGradientStart.withOpacity(0.5),
          backgroundColor: Colors.transparent, // Uses Ink container for gradient
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          padding: EdgeInsets.zero,
          textStyle: GoogleFonts.outfit(fontWeight: FontWeight.w700, fontSize: 16, letterSpacing: 1.2),
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
