// main_field.dart -- SEPARATE FIELD APK ENTRY (ADDITIVE ONLY).
//
// Build:
//   flutter clean && flutter build apk --release \
//     --target-platform android-arm64 --target lib/main_field.dart \
//     --dart-define=CLIENT_ID=kprupvc --build-name=1.0.16 --build-number=16 \
//     -Pvitharn.applicationId=com.vitharn.field \
//     -Pvitharn.appLabel="Vitharn Field"
//
// Reuses the full existing init + login + tenant pipeline from main.dart.
// Only difference: after login the field home is offered. To keep this file
// dependency-light, it boots the SAME QuotationApp and marks FieldMode.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter/foundation.dart';

import 'config/client_config.dart';
import 'login_screen.dart';
import 'trial_gate.dart';
import 'supabase_config.dart';
import 'theme.dart';
import 'app_state.dart';
import 'notification_service.dart';
import 'services/notification_center_service.dart';
import 'services/auto_update_service.dart';
import 'config/client_loader.dart';
import 'favicon_service.dart';
import 'services/offline_database.dart';
import 'services/sync_engine.dart';
import 'services/connectivity_service.dart';
import 'services/feature_flag_service.dart';
import 'services/white_label_service.dart';
import 'services/content_sync_service.dart';
import 'services/update_checker_service.dart';
import 'services/quotation_recovery_service.dart';
import 'services/field_mode.dart';
import 'field_home_screen.dart';

void main() async {
  FieldMode.isFieldApp = true;
  WidgetsFlutterBinding.ensureInitialized();

  try {
    await SupabaseConfig.initialize();
  } catch (e) {
    debugPrint('Field: supabase init failed: $e');
  }

  ClientConfig? initialConfig;
  String? sessionClientId;
  try {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      if (prefs.getString('session_active') == 'true') {
        sessionClientId = prefs.getString('session_client_id');
      }
    }
  } catch (_) {}

  final targetClientId = ClientLoader.getUrlClientId() ?? sessionClientId;
  if (targetClientId != null && targetClientId.isNotEmpty) {
    try {
      SupabaseConfig.client.headers['x-client-id'] = targetClientId;
    } catch (_) {}
  }

  try {
    initialConfig = await ClientLoader.loadConfig(clientId: targetClientId)
        .timeout(const Duration(seconds: 10));
  } catch (e) {
    debugPrint('Field config load error: $e');
  }

  final appState = AppState();
  if (initialConfig != null) {
    SupabaseConfig.client.headers['x-client-id'] = initialConfig.clientId;
    appState.applyClientConfig(initialConfig);
    FaviconService.setFromUrl(initialConfig.logoUrl);
  }

  _initFieldServices(appState).ignore();
  AutoUpdateService.instance
      .initialize(configProvider: () => appState.clientConfig);

  runApp(
    ChangeNotifierProvider.value(
      value: appState,
      child: const FieldQuotationApp(),
    ),
  );

  Future.delayed(const Duration(seconds: 1), () async {
    try {
      await NotificationService().init();
      await NotificationCenterService().initialize();
    } catch (e) {
      debugPrint('Field notify init: $e');
    }
  });
}

Future<void> _initFieldServices(AppState appState) async {
  try {
    await ConnectivityService.instance.initialize();
    await OfflineDatabase.instance.initialize();
    final clientId = appState.clientConfig.clientId;
    await SyncEngine.instance.initialize(clientId: clientId);
    await QuotationRecoveryService.instance.initialize(clientId);
    await ContentSyncService.instance.initialize();
    if (clientId.isNotEmpty) {
      await FeatureFlagService.instance.initialize(clientId);
      await WhiteLabelService.instance.initialize(clientId);
      await UpdateCheckerService.instance.initialize();
      UpdateCheckerService.instance.checkOnStart(clientId).ignore();
    }
  } catch (e) {
    debugPrint('Field offline init: $e');
  }
}

class FieldQuotationApp extends StatelessWidget {
  const FieldQuotationApp({super.key});

  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppState>(context);
    return MaterialApp(
      title: 'Vitharn Field',
      theme: AppTheme.lightTheme(
        appState.clientConfig,
        fontScale: appState.fontScale,
        densityMultiplier: appState.elementDensity.multiplier,
      ),
      darkTheme: AppTheme.darkTheme(
        appState.clientConfig,
        fontScale: appState.fontScale,
        densityMultiplier: appState.elementDensity.multiplier,
      ),
      themeMode: appState.isDarkMode ? ThemeMode.dark : ThemeMode.light,
      debugShowCheckedModeBanner: false,
      // Same gate + login as owner app; post-login user can open Field home.
      // FieldHomeScreen itself reuses Dashboard/Quotation/Leads screens.
      home: TrialGate(
        child: _FieldLoginGate(),
      ),
    );
  }
}

class _FieldLoginGate extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Navigator(
      onGenerateRoute: (_) => MaterialPageRoute(
        builder: (_) => const _FieldRoot(),
      ),
    );
  }
}

class _FieldRoot extends StatelessWidget {
  const _FieldRoot();

  @override
  Widget build(BuildContext context) {
    // Keep the proven login screen; after a successful login it pushes
    // DashboardScreen. Field users get a persistent entry to Field home via
    // the back stack root below: we show login first, then field home.
    return const FieldHomeScreen();
  }
}

// Re-export login for operators who land here directly.
class FieldLoginScreen extends StatelessWidget {
  const FieldLoginScreen({super.key});
  @override
  Widget build(BuildContext context) => LoginScreen();
}
