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
import 'config/client_loader.dart';
import 'favicon_service.dart';

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
    } catch (e) {
      debugPrint('Error initializing notifications: $e');
    }
  });
}

class QuotationApp extends StatelessWidget {
  const QuotationApp({super.key});

  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppState>(context);

    return MaterialApp(
      title: appState.appName,
      theme: AppTheme.lightTheme(appState.clientConfig),
      darkTheme: AppTheme.darkTheme(appState.clientConfig),
      themeMode: appState.isDarkMode ? ThemeMode.dark : ThemeMode.light,
      debugShowCheckedModeBanner: false,
      home: TrialGate(child: LoginScreen()),
    );
  }
}
