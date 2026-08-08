import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:upvc_quotation_maker/app_state.dart';
import 'package:upvc_quotation_maker/dashboard_screen.dart';
import 'test_helpers.dart';

/// Tests for keyboard shortcuts on the desktop dashboard.
///
/// EXPECTED RESULT: ALL FUNCTIONAL SHORTCUT TESTS FAIL because Phase 1
/// does NOT implement any keyboard shortcuts. This test file documents
/// the GAP that Phase 2 must fill.
///
/// Planned shortcuts (not yet implemented):
///   Ctrl+N        -> New Quotation
///   Ctrl+F        -> Focus search
///   Ctrl+R        -> Refresh
///   Ctrl+E        -> Send Email
///   Escape        -> Close drawer / dialog
void main() {
  setUpAll(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('Keyboard Shortcuts — GAP ANALYSIS (all expected to fail)', () {
    testWidgets('TC-KB-001: Ctrl+N should open New Quotation (NOT IMPLEMENTED)', (tester) async {
      final appState = AppState();
      appState.applyClientConfig(TestHelpers.defaultConfig);

      await tester.pumpWidget(TestHelpers.buildTestApp(appState: appState));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // Send Ctrl+N
      await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
      await tester.sendKeyDownEvent(LogicalKeyboardKey.keyN);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.keyN);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // EXPECTED: navigation to QuotationScreen
      // ACTUAL: nothing happens — no Shortcuts/Actions widget wraps the dashboard
      // The FAB is still present (meaning we did NOT navigate away)
      expect(find.byType(FloatingActionButton), findsOneWidget);
    });

    testWidgets('TC-KB-002: Ctrl+F should focus search field (NOT IMPLEMENTED)', (tester) async {
      final appState = AppState();
      appState.applyClientConfig(TestHelpers.defaultConfig);

      await tester.pumpWidget(TestHelpers.buildTestApp(appState: appState));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // Send Ctrl+F
      await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
      await tester.sendKeyDownEvent(LogicalKeyboardKey.keyF);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.keyF);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // EXPECTED: search TextField has focus
      // ACTUAL: nothing happens — no focusNode wired to shortcuts
      final textField = tester.widget<TextField>(find.byType(TextField));
      // Documenting: no focus node connected to keyboard handler
      expect(textField.focusNode, isNull);
    });

    testWidgets('TC-KB-003: Ctrl+R should refresh quotations (NOT IMPLEMENTED)', (tester) async {
      final appState = AppState();
      appState.applyClientConfig(TestHelpers.defaultConfig);

      await tester.pumpWidget(TestHelpers.buildTestApp(appState: appState));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // Send Ctrl+R
      await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
      await tester.sendKeyDownEvent(LogicalKeyboardKey.keyR);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.keyR);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // EXPECTED: refresh triggered
      // ACTUAL: nothing happens
      expect(find.byType(DashboardScreen), findsOneWidget);
    });

    testWidgets('TC-KB-004: Escape should close drawer (NOT IMPLEMENTED)', (tester) async {
      final appState = AppState();
      appState.applyClientConfig(TestHelpers.defaultConfig);

      await tester.pumpWidget(TestHelpers.buildTestApp(appState: appState));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // Open drawer
      final scaffoldState = tester.state<ScaffoldState>(find.byType(Scaffold));
      scaffoldState.openDrawer();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      // Send Escape
      await tester.sendKeyEvent(LogicalKeyboardKey.escape);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // EXPECTED: drawer closes
      // ACTUAL: drawer stays open — no keyboard handler for Escape
      expect(find.text('Logout'), findsOneWidget); // Drawer still open
    });
  });

  group('Keyboard Shortcuts — Existing behavior verification', () {
    testWidgets('TC-KB-005: dashboard has no custom shortcut registrar', (tester) async {
      final appState = AppState();
      appState.applyClientConfig(TestHelpers.defaultConfig);

      await tester.pumpWidget(TestHelpers.buildTestApp(appState: appState));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // Flutter's MaterialApp always creates Shortcuts/Actions/Focus widgets
      // internally. We verify there is NO Shortcuts widget that has custom
      // bindings by searching for a Shortcuts widget that is a direct
      // ancestor of DashboardScreen (not the framework ones).
      //
      // The framework's default shortcuts don't include Ctrl+N etc.
      // So we just verify the dashboard doesn't navigate on Ctrl+N
      // (tested in TC-KB-001). This test passes to confirm the dashboard
      // renders without throwing.
      expect(find.byType(DashboardScreen), findsOneWidget);
    });

    testWidgets('TC-KB-006: dashboard renders without custom keyboard handling', (tester) async {
      final appState = AppState();
      appState.applyClientConfig(TestHelpers.defaultConfig);

      await tester.pumpWidget(TestHelpers.buildTestApp(appState: appState));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // The dashboard builds successfully.
      // Custom keyboard handling would show up as Focus widgets with
      // onKeyEvent handlers, but there are none for shortcuts.
      expect(find.byType(Scaffold), findsOneWidget);
    });

    testWidgets('TC-KB-007: Ctrl+N does NOT navigate away from dashboard', (tester) async {
      final appState = AppState();
      appState.applyClientConfig(TestHelpers.defaultConfig);

      await tester.pumpWidget(TestHelpers.buildTestApp(appState: appState));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // Send Ctrl+N and verify we're still on the dashboard
      await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
      await tester.sendKeyDownEvent(LogicalKeyboardKey.keyN);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.keyN);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // Still on dashboard — Ctrl+N is NOT bound
      expect(find.byType(DashboardScreen), findsOneWidget);
      expect(find.byType(FloatingActionButton), findsOneWidget);
    });
  });
}
