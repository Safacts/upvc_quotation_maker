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

  /// Scales a TextTheme's font sizes by [scale], safely handling null sizes.
  /// TextTheme.apply() asserts all font sizes are non-null, but Google Fonts
  /// can produce TextStyles with null fontSize — so we scale manually.
  static TextTheme scaleTextTheme(TextTheme base, double scale) {
    if (scale == 1.0) return base;
    TextStyle? scaleStyle(TextStyle? style) {
      if (style == null || style.fontSize == null) return style;
      return style.copyWith(fontSize: style.fontSize! * scale);
    }
    return base.copyWith(
      displayLarge: scaleStyle(base.displayLarge),
      displayMedium: scaleStyle(base.displayMedium),
      displaySmall: scaleStyle(base.displaySmall),
      headlineLarge: scaleStyle(base.headlineLarge),
      headlineMedium: scaleStyle(base.headlineMedium),
      headlineSmall: scaleStyle(base.headlineSmall),
      titleLarge: scaleStyle(base.titleLarge),
      titleMedium: scaleStyle(base.titleMedium),
      titleSmall: scaleStyle(base.titleSmall),
      bodyLarge: scaleStyle(base.bodyLarge),
      bodyMedium: scaleStyle(base.bodyMedium),
      bodySmall: scaleStyle(base.bodySmall),
      labelLarge: scaleStyle(base.labelLarge),
      labelMedium: scaleStyle(base.labelMedium),
      labelSmall: scaleStyle(base.labelSmall),
    );
  }

  static TextStyle _safeOutfit({double? fontSize, FontWeight? fontWeight, double? letterSpacing}) {
    if (kIsWeb) return TextStyle(fontSize: fontSize, fontWeight: fontWeight, letterSpacing: letterSpacing);
    try {
      return GoogleFonts.outfit(fontSize: fontSize, fontWeight: fontWeight, letterSpacing: letterSpacing);
    } catch (_) {
      return TextStyle(fontSize: fontSize, fontWeight: fontWeight, letterSpacing: letterSpacing);
    }
  }



  static ThemeData lightTheme(ClientConfig config, {double fontScale = 1.0, double densityMultiplier = 1.0}) {
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
      textTheme: scaleTextTheme(_safeTextTheme(ThemeData.light().textTheme), fontScale),
      cardTheme: CardThemeData(
        elevation: 12,
        shadowColor: config.primaryColor.withValues(alpha: 0.15),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(24)),
          side: BorderSide(color: Color(0xCCFFFFFF), width: 1.5),
        ),
        color: const Color(0xCCFFFFFF), // Glass effect
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFFF1F5F9).withValues(alpha: 0.7),
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
        contentPadding: EdgeInsets.symmetric(horizontal: 24 * densityMultiplier, vertical: 18 * densityMultiplier),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          elevation: 10,
          shadowColor: config.primaryColor.withValues(alpha: 0.5),
          backgroundColor: config.primaryColor,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          padding: EdgeInsets.symmetric(horizontal: 24 * densityMultiplier, vertical: 14 * densityMultiplier),
          textStyle: _safeOutfit(fontWeight: FontWeight.w700, fontSize: 16 * fontScale, letterSpacing: 1.2),
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

  static ThemeData darkTheme(ClientConfig config, {double fontScale = 1.0, double densityMultiplier = 1.0}) {
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
      textTheme: scaleTextTheme(_safeTextTheme(ThemeData.dark().textTheme), fontScale),
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
        fillColor: const Color(0xFF0F172A).withValues(alpha: 0.6),
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
        contentPadding: EdgeInsets.symmetric(horizontal: 24 * densityMultiplier, vertical: 18 * densityMultiplier),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          elevation: 12,
          shadowColor: config.primaryColor.withValues(alpha: 0.5),
          backgroundColor: config.primaryColor,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          padding: EdgeInsets.symmetric(horizontal: 24 * densityMultiplier, vertical: 14 * densityMultiplier),
          textStyle: _safeOutfit(fontWeight: FontWeight.w700, fontSize: 16 * fontScale, letterSpacing: 1.2),
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
