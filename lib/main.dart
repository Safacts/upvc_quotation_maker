import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:upvc_quotation_maker/config/client_config.dart';
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

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Supabase
  try {
    await SupabaseConfig.initialize();
  } catch (e) {
    debugPrint("Could not initialize Supabase: $e");
  }

  // Load client config
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

  try {
    initialConfig = await ClientLoader.loadConfig(clientId: sessionClientId);
  } catch (e) {
    debugPrint('Config load error: $e');
  }

  final appState = AppState();
  // Database-level tenant isolation: every data request is scoped by this header,
  // enforced by Postgres Row Level Security on quotations/items/sent_emails.
  if (initialConfig != null) {
    SupabaseConfig.client.headers['x-client-id'] = initialConfig.clientId;
    appState.applyClientConfig(initialConfig);
    FaviconService.setFromUrl(initialConfig.logoUrl ?? '');
  }

  // Initialize offline-first services (non-blocking — must not delay first paint)
  _initializeOfflineServices(appState).ignore();

  // In-app APK updater (Android only — no-op on web). The config provider is
  // a closure over AppState so it always sees the LOGGED-IN client's config,
  // even after a login switches clients. The first check is deferred to the
  // dashboard initState so it runs after login with the right tenant.
  AutoUpdateService.instance.initialize(
    configProvider: () => appState.clientConfig,
  );

  runApp(
    ChangeNotifierProvider.value(
      value: appState,
      child: const QuotationApp(),
    ),
  );

  // Initialize Notifications after the UI is rendered
  Future.delayed(const Duration(seconds: 1), () async {
    try {
      final notificationService = NotificationService();
      await notificationService.init();
      await notificationService.requestPermissions();

      // Initialize Notification Center (realtime) after client config is set
      final notificationCenter = NotificationCenterService();
      await notificationCenter.initialize();
    } catch (e) {
      debugPrint('Error initializing notifications: $e');
    }
  });
}

/// Initialize offline-first services.
Future<void> _initializeOfflineServices(AppState appState) async {
  try {
    // Initialize connectivity service first
    await ConnectivityService.instance.initialize();

    // Initialize offline database
    await OfflineDatabase.instance.initialize();

    final clientId = appState.clientConfig.clientId;

    // Initialize sync engine. Pass the client id explicitly so the active
    // tenant is set BEFORE the tenant-scoped services below read from it.
    await SyncEngine.instance.initialize(clientId: clientId);

    // Initialize content sync service
    await ContentSyncService.instance.initialize();

    // Initialize feature flags if client config is available
    if (clientId.isNotEmpty) {
      await FeatureFlagService.instance.initialize(clientId);
      await WhiteLabelService.instance.initialize(clientId);

      // Content update checker — throttled to 15 min. Kicked off without
      // awaiting so a slow manifest fetch can never delay first paint.
      await UpdateCheckerService.instance.initialize();
      UpdateCheckerService.instance.checkOnStart(clientId).ignore();
    }

    debugPrint('Offline-first services initialized');
  } catch (e) {
    debugPrint('Error initializing offline services: $e');
    // Don't block app startup if offline services fail
  }
}

class QuotationApp extends StatelessWidget {
  const QuotationApp({super.key});

  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppState>(context);

    return MaterialApp(
      title: appState.appName,
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
      home: TrialGate(child: LoginScreen()),
    );
  }
}
