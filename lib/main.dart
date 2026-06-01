import 'package:flutter/material.dart';
import 'login_screen.dart';
import 'supabase_config.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SupabaseConfig.initialize();

  runApp(MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'UPVC Quotation Maker',
    theme: ThemeData(primarySwatch: Colors.blue),
    home: LoginScreen(),
  ));
}
