import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_animate/flutter_animate.dart';

class AboutScreen extends StatelessWidget {
  Future<void> _launchLinkedIn() async {
    final Uri url = Uri.parse('https://www.linkedin.com/in/aadisheshu-konga/');
    if (!await launchUrl(url, mode: LaunchMode.externalApplication)) {
      debugPrint('Could not launch $url');
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    return Scaffold(
      appBar: AppBar(
        title: const Text('About & Developer'),
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                  boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 10)],
                ),
                child: Image.asset('assets/logo.png', width: 80, height: 80),
              ).animate().scale(delay: 200.ms, curve: Curves.easeOutBack),
              
              const SizedBox(height: 24),
              Text(
                'Venkateshwara UPVC',
                style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
              ).animate().fade(delay: 300.ms).slideY(begin: 0.2),
              
              const SizedBox(height: 8),
              Text(
                'Quotation Maker v2.0',
                style: TextStyle(color: Colors.grey.shade500),
              ).animate().fade(delay: 400.ms),
              
              const SizedBox(height: 40),
              const Divider(),
              const SizedBox(height: 20),
              
              Text('Developer Details', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)).animate().fade(delay: 500.ms),
              const SizedBox(height: 16),
              
              Card(
                child: ListTile(
                  leading: const Icon(Icons.person, color: Colors.blueAccent),
                  title: const Text('Konga Aadisheshu'),
                  subtitle: const Text('Software Developer'),
                ),
              ).animate().fade(delay: 600.ms).slideX(begin: -0.1),
              
              const SizedBox(height: 12),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.email, color: Colors.redAccent),
                  title: const Text('kongaaadisheshu@gmail.com'),
                  onTap: () => launchUrl(Uri.parse('mailto:kongaaadisheshu@gmail.com')),
                ),
              ).animate().fade(delay: 700.ms).slideX(begin: -0.1),
              
              const SizedBox(height: 12),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.phone, color: Colors.green),
                  title: const Text('6304562779'),
                  onTap: () => launchUrl(Uri.parse('tel:6304562779')),
                ),
              ).animate().fade(delay: 800.ms).slideX(begin: -0.1),
              
              const SizedBox(height: 30),
              InkWell(
                onTap: _launchLinkedIn,
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 24),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: theme.colorScheme.primary.withOpacity(0.3)),
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
              ).animate().fade(delay: 900.ms).slideY(begin: 0.2),
            ],
          ),
        ),
      ),
    );
  }
}
