import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'app_state.dart';
import 'config/client_config.dart';
import 'crafted_widget.dart';

class TrialGate extends StatelessWidget {
  final Widget child;

  const TrialGate({super.key, required this.child});

  bool _isTrialExpired(ClientConfig config) {
    if (!config.isActive) return true;
    if (config.trialExpiresAt == null) return false;
    return DateTime.now().isAfter(config.trialExpiresAt!);
  }

  @override
  Widget build(BuildContext context) {
    final config = Provider.of<AppState>(context).clientConfig;
    final expired = _isTrialExpired(config);
    final theme = Theme.of(context);

    if (!expired) return child;

    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.orange.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.lock_outline, size: 64, color: Colors.orange),
              ).animate().scale(curve: Curves.easeOutBack),
              const SizedBox(height: 24),
              Text(
                'Trial Expired',
                style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold),
              ).animate().fade(delay: 200.ms).slideY(begin: 0.2),
              const SizedBox(height: 16),
              Text(
                config.appName,
                style: TextStyle(color: Colors.grey.shade600, fontSize: 16),
              ).animate().fade(delay: 300.ms),
              const SizedBox(height: 24),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    children: [
                      const Icon(Icons.info_outline, color: Colors.blueGrey, size: 32),
                      const SizedBox(height: 16),
                      const Text(
                        'Your trial period has ended. Please contact the developer to purchase a license and continue using the app.',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 14, height: 1.5),
                      ),
                      const SizedBox(height: 24),
                      SizedBox(
                        width: double.infinity,
                        height: 50,
                        child: ElevatedButton.icon(
                          onPressed: () {},
                          icon: const Icon(Icons.mail_outline),
                          label: const Text('Contact Developer'),
                        ),
                      ),
                    ],
                  ),
                ),
              ).animate().fade(delay: 400.ms).slideY(begin: 0.1),
              const SizedBox(height: 40),
              CraftedWithLoveWidget(),
            ],
          ),
        ),
      ),
    );
  }
}
