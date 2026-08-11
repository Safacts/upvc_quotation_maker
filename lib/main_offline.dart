/// OFFLINE ENTRYPOINT — Vitharn ERP Rs.10,000 "Low" tier.
///
/// WHY A SEPARATE ENTRYPOINT
/// -------------------------
/// The default `lib/main.dart` initialises Supabase, the sync engine, realtime
/// feature flags and push notifications. None of that may exist in the Low tier:
/// the product is sold on a contractual promise of ZERO network calls, which
/// Bugsy verifies by packet capture (MEETING-003, blocking test #5).
///
/// Rather than bolt an "offline mode" flag onto the online app — where one
/// forgotten `await supabase...` silently breaks the promise — this tier gets
/// its own `main()`. It is built with:
///
///   flutter build apk --debug --target=lib/main_offline.dart
///
/// The online app is completely untouched, so shipping this cannot regress the
/// paying Base / Next / Next+ / Final clients.
///
/// THE IMPORT FIREWALL
/// -------------------
/// Nothing reachable from this file may import `supabase_flutter`,
/// `lib/supabase_config.dart`, `package:http/http.dart`, or anything under
/// `lib/services/`. `test/offline_no_network_test.dart` enforces this by static
/// scan and fails the build on violation. Keep that test passing.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'offline/branding/brand_service.dart';
import 'offline/branding/brand_wizard_screen.dart';
import 'offline/core/brand_config.dart';
import 'offline/ui/dashboard_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Portrait-only: the quotation editor is a dense form and its sticky totals
  // bar has no sensible landscape layout on a phone.
  await SystemChrome.setPreferredOrientations(
    const [DeviceOrientation.portraitUp, DeviceOrientation.portraitDown],
  );

  // Load branding BEFORE the first frame so a returning user never sees the
  // setup wizard flash before their own company name appears. `load()` is
  // documented never to throw, but a failure here must not block launch —
  // an unbranded start is recoverable, a crash loop is not.
  try {
    await BrandService.instance.load();
  } catch (e) {
    debugPrint('Branding load failed, starting unbranded: $e');
  }

  runApp(
    ChangeNotifierProvider<BrandService>.value(
      value: BrandService.instance,
      child: const OfflineApp(),
    ),
  );
}

class OfflineApp extends StatelessWidget {
  const OfflineApp({super.key});

  @override
  Widget build(BuildContext context) {
    // Rebuilds on every branding change so the app name, seed colour and theme
    // update the instant the wizard finishes — no restart required.
    final brand = context.watch<BrandService>();
    final config = brand.config;

    return MaterialApp(
      title: config.companyName.isNotEmpty
          ? config.companyName
          : 'UPVC Quotation Maker',
      debugShowCheckedModeBanner: false,
      theme: _buildTheme(config, Brightness.light),
      darkTheme: _buildTheme(config, Brightness.dark),
      home: const _OfflineRoot(),
    );
  }
}

/// Decides between the first-launch wizard and the dashboard.
///
/// Kept as its own widget so that completing the wizard swaps the tree via
/// `BrandService`'s notification rather than an imperative `Navigator` call.
/// A pushed-then-popped wizard would leave the dashboard sitting underneath it
/// during setup, rendering with an empty company name.
class _OfflineRoot extends StatelessWidget {
  const _OfflineRoot();

  @override
  Widget build(BuildContext context) {
    final brand = context.watch<BrandService>();

    // SharedPreferences has not answered yet. Showing the wizard here would
    // mean a branded user briefly sees "Welcome, let's set up your business".
    if (!brand.isLoaded) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (brand.needsSetup) {
      // The wizard persists the config itself; `onComplete` only needs to nudge
      // this widget to re-evaluate. The ChangeNotifier already did that, so the
      // callback is intentionally a no-op beyond satisfying the contract.
      return BrandWizardScreen(onComplete: () {});
    }

    return const OfflineDashboardScreen();
  }
}

/// Builds a theme seeded from the client's own brand colour.
///
/// Deliberately NOT reusing `lib/theme.dart` — that `AppTheme` takes a
/// `ClientConfig`, which is the online/server-driven config object. Depending on
/// it here would drag server concepts into the offline tier and blur the import
/// firewall this entrypoint exists to enforce.
ThemeData _buildTheme(BrandConfig config, Brightness brightness) {
  // Brand colours are persisted as ARGB ints. A value saved without an alpha
  // channel would render fully transparent, so force opacity on.
  final seed = Color(config.primaryColorValue | 0xFF000000);

  final scheme = ColorScheme.fromSeed(
    seedColor: seed,
    brightness: brightness,
  );

  final base = ThemeData(colorScheme: scheme, useMaterial3: true);

  return base.copyWith(
    // NOTE: deliberately NOT using `google_fonts` here, unlike `lib/theme.dart`.
    // No font files are bundled under `assets/`, so `GoogleFonts.*` resolves by
    // downloading the TTF from fonts.gstatic.com on first use. That is a real
    // network call on app launch and would break the Low tier's zero-network
    // guarantee under Bugsy's packet-capture test. The platform default font
    // (Roboto on Android) is bundled with the OS and costs nothing.
    scaffoldBackgroundColor: scheme.surface,
    appBarTheme: AppBarTheme(
      backgroundColor: scheme.surface,
      foregroundColor: scheme.onSurface,
      elevation: 0,
      scrolledUnderElevation: 2,
      centerTitle: false,
    ),
    cardTheme: CardThemeData(
      elevation: 1,
      clipBehavior: Clip.antiAlias,
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      isDense: true,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: scheme.outlineVariant),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: scheme.outlineVariant),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: scheme.primary, width: 2),
      ),
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        elevation: 1,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    ),
    chipTheme: base.chipTheme.copyWith(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
    dividerTheme: DividerThemeData(color: scheme.outlineVariant, space: 1),
  );
}
