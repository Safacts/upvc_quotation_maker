import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'app_state.dart';
import 'config/client_config.dart';
import 'config/client_loader.dart';
import 'supabase_config.dart';
import 'dashboard_screen.dart';
import 'login_screen.dart';
import 'package:provider/provider.dart';

// Venkateshwara Client-Specific App
// All features unlocked (Final Tier - ₹55,000 plan)

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Supabase
  await SupabaseConfig.initialize();

  // Load Venkateshwara client config
  ClientConfig? initialConfig;
  try {
    initialConfig = await ClientLoader.loadConfig(
      clientId: 'venkateshwara',
    ).timeout(const Duration(seconds: 10));
  } catch (e) {
    debugPrint('Config load error: $e');
    // Fallback: create default config for Venkateshwara
    initialConfig = ClientConfig(
      clientId: 'venkateshwara',
      appName: 'Venkateshwara UPVC Quote',
      companyName: 'Venkateshwara UPVC Windows & Doors',
      companyAddress:
          'Plot No: 95, Road No: 2, Near Omkar Nagar Bus Stop, LB NAGAR, HYDERABAD – 500074',
      companyContact: '9246588692, 9441888131',
      companyEmail: 'jvenkateshupvc@gmail.com',
      companyProprietor: 'J.Venkateshwarlu',
      gstNumber: '36AKDPJ7245B2ZF',
      logoUrl:
          'https://gumpmnbjdtzajhysnn.supabase.co/storage/v1/object/public/assets/logos/venkateshwara.png',
    );
  }

  final appState = AppState();
  SupabaseConfig.client.headers['x-client-id'] = initialConfig.clientId;
  appState.applyClientConfig(initialConfig);

  runApp(
    ChangeNotifierProvider.value(
      value: appState,
      child: const VenkateshwaraApp(),
    ),
  );
}

class VenkateshwaraApp extends StatelessWidget {
  const VenkateshwaraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<AppState>(
      builder: (context, appState, _) {
        return MaterialApp(
          title: 'Venkateshwara UPVC Quote',
          theme: ThemeData(
            primaryColor: const Color(0xFFEA580C),
            colorScheme: ColorScheme.fromSeed(
              seedColor: const Color(0xFFEA580C),
              brightness: Brightness.light,
            ),
            useMaterial3: true,
          ),
          darkTheme: ThemeData(
            primaryColor: const Color(0xFFEA580C),
            colorScheme: ColorScheme.fromSeed(
              seedColor: const Color(0xFFEA580C),
              brightness: Brightness.dark,
            ),
            useMaterial3: true,
          ),
          themeMode: appState.isDarkMode ? ThemeMode.dark : ThemeMode.light,
          home: const AuthGate(),
          debugShowCheckedModeBanner: false,
        );
      },
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<AuthState>(
      stream: Supabase.instance.client.auth.onAuthStateChange,
      builder: (context, snapshot) {
        final session = Supabase.instance.client.auth.currentSession;
        if (session == null) {
          return const LoginScreen();
        }
        return const DashboardScreen();
      },
    );
  }
}
