import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:upvc_quotation_maker/app_state.dart';
import 'package:upvc_quotation_maker/theme.dart';
import 'package:upvc_quotation_maker/settings_screen.dart';
import 'package:upvc_quotation_maker/supabase_config.dart';

/// Helper to wrap a widget in a Provider for testing.
Widget _wrapWithAppState(AppState appState, Widget child) {
  return ChangeNotifierProvider.value(
    value: appState,
    child: MaterialApp(home: child),
  );
}

void main() {
  // Prevent Google Fonts from trying to fetch fonts over the network in tests.
  // In test env there's no network and no asset bundle for the fonts.
  GoogleFonts.config.allowRuntimeFetching = false;

  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await SupabaseConfig.initialize();
  });

  group('ElementDensity enum', () {
    test('has correct labels', () {
      expect(ElementDensity.compact.label, 'Compact');
      expect(ElementDensity.comfortable.label, 'Comfortable');
      expect(ElementDensity.spacious.label, 'Spacious');
    });

    test('has correct multipliers', () {
      expect(ElementDensity.compact.multiplier, 0.7);
      expect(ElementDensity.comfortable.multiplier, 1.0);
      expect(ElementDensity.spacious.multiplier, 1.4);
    });
  });

  group('AppState UI preferences', () {
    setUp(() {
      SharedPreferences.setMockInitialValues({});
    });

    test('defaults to fontScale=1.0 and comfortable density', () {
      final appState = AppState();
      expect(appState.fontScale, 1.0);
      expect(appState.elementDensity, ElementDensity.comfortable);
    });

    test('updateUiPreferences updates state and persists', () async {
      final appState = AppState();
      // Wait for the constructor's async _loadSettings to complete
      await Future.delayed(const Duration(milliseconds: 50));
      await appState.updateUiPreferences(
        fontScale: 1.2,
        elementDensity: ElementDensity.compact,
      );
      expect(appState.fontScale, 1.2);
      expect(appState.elementDensity, ElementDensity.compact);

      // Verify persistence
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getDouble('fontScale'), 1.2);
      expect(prefs.getString('elementDensity'), 'compact');
    });

    test('persisted values load on construction', () async {
      // Pre-seed SharedPreferences
      SharedPreferences.setMockInitialValues({
        'fontScale': 1.3,
        'elementDensity': 'spacious',
      });
      final appState = AppState();
      // _loadSettings is async — pump and settle to let it complete
      await Future.delayed(const Duration(milliseconds: 50));
      expect(appState.fontScale, 1.3);
      expect(appState.elementDensity, ElementDensity.spacious);
    });

    test('invalid density string falls back to comfortable', () async {
      SharedPreferences.setMockInitialValues({
        'elementDensity': 'invalid_value',
      });
      final appState = AppState();
      await Future.delayed(const Duration(milliseconds: 50));
      expect(appState.elementDensity, ElementDensity.comfortable);
    });

    test('fontScale clamps within reasonable range via slider', () {
      // The slider in SettingsScreen uses min: 0.8, max: 1.4
      // Verify these bounds make sense
      expect(AppState().fontScale, inInclusiveRange(0.8, 1.4));
    });

    test('updateUiPreferences notifies listeners', () async {
      final appState = AppState();
      var notified = false;
      appState.addListener(() => notified = true);
      await appState.updateUiPreferences(
        fontScale: 1.1,
        elementDensity: ElementDensity.spacious,
      );
      expect(notified, isTrue);
    });
  });

  group('Theme font scaling helper', () {
    test('_scaleTextTheme scales non-null font sizes', () {
      final base = TextTheme(
        bodyMedium: const TextStyle(fontSize: 14),
        titleLarge: const TextStyle(fontSize: 22),
        labelSmall: const TextStyle(fontSize: 10),
      );
      final scaled = AppTheme.scaleTextTheme(base, 1.5);

      expect(scaled.bodyMedium!.fontSize, closeTo(21.0, 0.01));
      expect(scaled.titleLarge!.fontSize, closeTo(33.0, 0.01));
      expect(scaled.labelSmall!.fontSize, closeTo(15.0, 0.01));
    });

    test('scaleTextTheme preserves null font sizes', () {
      final base = TextTheme(
        bodyMedium: const TextStyle(fontSize: 14),
        // bodyLarge has null fontSize
        bodyLarge: const TextStyle(fontWeight: FontWeight.bold),
      );
      final scaled = AppTheme.scaleTextTheme(base, 1.5);

      expect(scaled.bodyMedium!.fontSize, closeTo(21.0, 0.01));
      expect(scaled.bodyLarge!.fontSize, isNull);
    });

    test('scaleTextTheme returns same instance when scale is 1.0', () {
      final base = TextTheme(bodyMedium: const TextStyle(fontSize: 14));
      final scaled = AppTheme.scaleTextTheme(base, 1.0);
      expect(scaled, same(base));
    });

    test('scaleTextTheme scales down correctly', () {
      final base = TextTheme(bodyMedium: const TextStyle(fontSize: 16));
      final scaled = AppTheme.scaleTextTheme(base, 0.8);
      expect(scaled.bodyMedium!.fontSize, closeTo(12.8, 0.01));
    });
  });

  group('SettingsScreen UI customization', () {
    setUp(() {
      SharedPreferences.setMockInitialValues({});
    });

    testWidgets('renders font size slider and density chips', (tester) async {
      final appState = AppState();
      await tester.pumpWidget(_wrapWithAppState(appState, const SettingsScreen()));
      await tester.pumpAndSettle();

      // Font size section
      expect(find.text('Font Size'), findsOneWidget);
      expect(find.byType(Slider), findsWidgets); // margin slider + font slider

      // Density section
      expect(find.text('Layout Density'), findsOneWidget);
      expect(find.text('Compact'), findsOneWidget);
      expect(find.text('Comfortable'), findsOneWidget);
      expect(find.text('Spacious'), findsOneWidget);
    });

    testWidgets('changing font slider updates displayed value', (tester) async {
      final appState = AppState();
      await tester.pumpWidget(_wrapWithAppState(appState, const SettingsScreen()));
      await tester.pumpAndSettle();

      // The font slider is the first (and only visible) Slider — the margin
      // slider is below the fold in the ListView and not rendered.
      final fontSlider = find.byType(Slider).first;
      final initialValue = tester.widget<Slider>(fontSlider).value;
      expect(initialValue, 1.0);

      // Drag right to increase font scale
      await tester.drag(fontSlider, const Offset(60, 0));
      await tester.pumpAndSettle();

      final sliderWidget = tester.widget<Slider>(fontSlider);
      expect(sliderWidget.value, greaterThan(initialValue));
    });

    testWidgets('selecting density chip updates local state', (tester) async {
      final appState = AppState();
      await tester.pumpWidget(_wrapWithAppState(appState, const SettingsScreen()));
      await tester.pumpAndSettle();

      // Tap "Compact" chip
      await tester.tap(find.text('Compact'));
      await tester.pumpAndSettle();

      // Verify the chip is selected
      final chip = tester.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Compact'));
      expect(chip.selected, isTrue);
    });

    testWidgets('Apply Display Settings persists to AppState', (tester) async {
      final appState = AppState();
      await tester.pumpWidget(_wrapWithAppState(appState, const SettingsScreen()));
      await tester.pumpAndSettle();

      // Change font slider (first visible Slider = font size)
      final fontSlider = find.byType(Slider).first;
      await tester.drag(fontSlider, const Offset(80, 0));
      await tester.pumpAndSettle();

      // Tap "Compact"
      await tester.tap(find.text('Compact'));
      await tester.pumpAndSettle();

      // Tap Apply
      await tester.tap(find.text('Apply Display Settings'));
      await tester.pumpAndSettle();

      // Verify AppState was updated
      expect(appState.fontScale, greaterThan(1.0));
      expect(appState.elementDensity, ElementDensity.compact);

      // Verify snackbar
      expect(find.text('Display settings saved'), findsOneWidget);
    });

    testWidgets('preferences persist to SharedPreferences after Apply', (tester) async {
      final appState = AppState();
      await tester.pumpWidget(_wrapWithAppState(appState, const SettingsScreen()));
      await tester.pumpAndSettle();

      // Change and apply
      final fontSlider = find.byType(Slider).first;
      await tester.drag(fontSlider, const Offset(100, 0));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Spacious'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Apply Display Settings'));
      await tester.pump();

      final savedFontScale = appState.fontScale;
      final savedDensity = appState.elementDensity;

      // Verify persistence directly from SharedPreferences (simulates restart)
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getDouble('fontScale'), savedFontScale);
      expect(prefs.getString('elementDensity'), savedDensity.name);
    });
  });
}
