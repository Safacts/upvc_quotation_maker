import 'dart:async';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';
import 'client_logo.dart';

class AboutScreen extends StatefulWidget {
  const AboutScreen({super.key});

  @override
  State<AboutScreen> createState() => _AboutScreenState();
}

class _AboutScreenState extends State<AboutScreen> {
  /// The ACTUAL version baked into this install (via --build-name/--build-number).
  /// NEVER hardcode this string again — a stale literal made every client see
  /// "Version 1.0.6" forever, which read as "the updater doesn't work".
  Future<PackageInfo>? _packageInfo;

  @override
  void initState() {
    super.initState();
    _packageInfo = PackageInfo.fromPlatform();
  }

  Future<void> _launchLinkedIn() async {
    final Uri url = Uri.parse('https://www.linkedin.com/in/aadisheshu-konga/');
    if (!await launchUrl(url)) {
      debugPrint('Could not launch $url');
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    return Scaffold(
      appBar: AppBar(
        title: const Text('About'),
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                  boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 10)],
                ),
                child: ClipOval(
                  child: ClientLogo(config: Provider.of<AppState>(context).clientConfig, width: 80, height: 80, fit: BoxFit.cover),
                ),
              ).animate().scale(delay: 200.ms, curve: Curves.easeOutBack),
              
              const SizedBox(height: 24),
              Text(
                Provider.of<AppState>(context).companyName,
                style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
              ).animate().fade(delay: 300.ms).slideY(begin: 0.2),
              
              const SizedBox(height: 8),
              Text(
                Provider.of<AppState>(context).appName,
                style: TextStyle(color: Colors.grey.shade500),
              ).animate().fade(delay: 400.ms),

              const SizedBox(height: 8),
              FutureBuilder<PackageInfo>(
                future: _packageInfo,
                builder: (context, snapshot) {
                  final info = snapshot.data;
                  final label = (info == null || info.version.isEmpty)
                      ? 'Version'
                      // e.g. "Version 1.0.14 (14)" — build number included so a
                      // rebuilt same-semver APK is still visibly different.
                      : 'Version ${info.version} (${info.buildNumber})';
                  return Text(
                    label,
                    style: const TextStyle(color: Colors.grey, fontSize: 12),
                  );
                },
              ).animate().fade(delay: 450.ms),

              const SizedBox(height: 40),
              const Divider(),
              const SizedBox(height: 20),
              
              const SizedBox(height: 30),
              InkWell(
                onTap: _launchLinkedIn,
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 24),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: theme.colorScheme.primary.withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('Crafted with ', style: TextStyle(color: theme.textTheme.bodyLarge?.color, fontSize: 14)),
                      const Icon(Icons.favorite, color: Colors.redAccent, size: 18)
                          .animate(onPlay: (controller) => controller.repeat(reverse: true))
                          .scale(begin: const Offset(1, 1), end: const Offset(1.2, 1.2), duration: 600.ms),
                      Text(' by Aadi', style: TextStyle(color: theme.colorScheme.primary, fontWeight: FontWeight.bold, fontSize: 14)),
                    ],
                  ),
                ),
              ).animate().fade(delay: 500.ms).slideY(begin: 0.2),
            ],
          ),
        ),
      ),
    );
  }
}
