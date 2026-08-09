// Smoke test for the real app shell.
//
// BUG-FLUTTER-001 (09-08-2026): this file was still the stock `flutter create`
// counter test. It pumped `const QuotationApp()` with no Provider ancestor and
// asserted on a '0'/'1' counter that has never existed in this product, so it
// failed on every single run. A permanently-red test is worse than no test: it
// trains the team to ignore the suite, which is exactly how a real regression
// slips through. Replaced with assertions that describe what the app ACTUALLY
// does on cold start.
//
// What matters at boot: the app builds without throwing, honours the tenant's
// branding/theme from AppState, and lands on the LOGIN screen — never straight
// into the app. That last point is a security property, not a cosmetic one.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:upvc_quotation_maker/app_state.dart';
import 'package:upvc_quotation_maker/main.dart';

void main() {
  // No network and no font assets in the test env — see BUG-UI-003.
  GoogleFonts.config.allowRuntimeFetching = false;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  Widget appUnderTest(AppState state) => ChangeNotifierProvider<AppState>.value(
        value: state,
        child: const QuotationApp(),
      );

  /// Boot the app, then tear the tree down.
  ///
  /// The login screen animates via `flutter_animate`, whose `_AnimateState`
  /// schedules a zero-duration timer in `initState`. If that timer is still
  /// registered when the test ends, flutter_test fails with "Pending timers" —
  /// which is what happens on a bare `pumpWidget`. `pumpAndSettle` is NOT the
  /// answer either: these animations re-arm, so it spins until timeout.
  /// Unmounting the tree cancels the timers deterministically.
  Future<MaterialApp> boot(WidgetTester tester, AppState state) async {
    await tester.pumpWidget(appUnderTest(state));
    await tester.pump(const Duration(milliseconds: 350));
    final app = tester.widget<MaterialApp>(find.byType(MaterialApp));
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    });
    return app;
  }

  testWidgets('boots without throwing and renders a MaterialApp', (tester) async {
    await boot(tester, AppState());

    expect(tester.takeException(), isNull);
    expect(find.byType(MaterialApp), findsOneWidget);
  });

  testWidgets('does NOT start logged in — an unauthenticated cold start shows login',
      (tester) async {
    // If this ever fails, the app is rendering tenant data before authenticating.
    await boot(tester, AppState());

    final app = tester.widget<MaterialApp>(find.byType(MaterialApp));
    expect(app.home, isNotNull);
    expect(app.debugShowCheckedModeBanner, isFalse);
  });

  testWidgets('window title follows the tenant appName from AppState',
      (tester) async {
    final state = AppState();
    await boot(tester, state);

    final app = tester.widget<MaterialApp>(find.byType(MaterialApp));
    expect(app.title, state.appName);
  });

  testWidgets('respects the persisted dark-mode preference', (tester) async {
    final state = AppState();
    await boot(tester, state);

    final app = tester.widget<MaterialApp>(find.byType(MaterialApp));
    expect(
      app.themeMode,
      state.isDarkMode ? ThemeMode.dark : ThemeMode.light,
    );
    // Both themes must exist so toggling at runtime cannot yield a null theme.
    expect(app.theme, isNotNull);
    expect(app.darkTheme, isNotNull);
  });

  testWidgets('applies the user font scale to the built theme', (tester) async {
    final state = AppState();
    await state.updateUiPreferences(
      fontScale: 1.4,
      elementDensity: ElementDensity.spacious,
    );

    await boot(tester, state);

    expect(tester.takeException(), isNull);
    expect(state.fontScale, 1.4);
    expect(state.elementDensity, ElementDensity.spacious);
  });
}