import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:provider/provider.dart';
import 'login_screen.dart';
import 'supabase_config.dart';
import 'theme.dart';
import 'app_state.dart';
import 'notification_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Load environment variables
  try {
    await dotenv.load(fileName: ".env");
  } catch (e) {
    debugPrint("Could not load .env file: $e");
  }

  // Initialize Supabase
  try {
    await SupabaseConfig.initialize();
  } catch (e) {
    debugPrint("Could not initialize Supabase: $e");
  }

  runApp(
    ChangeNotifierProvider(
      create: (_) => AppState(),
      child: const QuotationApp(),
    ),
  );

  // Initialize Notifications and Request permissions after the UI is rendered to avoid freezing the splash screen
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
      title: 'UPVC Quotation Maker',
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: appState.isDarkMode ? ThemeMode.dark : ThemeMode.light,
      debugShowCheckedModeBanner: false,
      home: LoginScreen(),
    );
  }
}
