// field_mode.dart -- ADDITIVE ONLY. Never imported by existing files.
// Distinguishes the separate Field Executive APK (lib/main_field.dart)
// from the owner APK (lib/main.dart) without forking shared code.
class FieldMode {
  FieldMode._();

  /// True only inside the field APK entry point.
  static bool isFieldApp = false;

  /// Pilot tenant for the field experiment (KPR UPVC).
  static const String pilotClientId = 'kprupvc';

  /// Package/label used by the field APK build (see build command in memory).
  static const String fieldApplicationId = 'com.vitharn.field';
  static const String fieldAppLabel = 'Vitharn Field';
}
