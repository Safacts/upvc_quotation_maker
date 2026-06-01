import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class AboutScreen extends StatelessWidget {
  Future<void> _launchLinkedIn() async {
    final Uri url = Uri.parse('https://www.linkedin.com/in/aadisheshu-konga/');
    if (!await launchUrl(url, mode: LaunchMode.externalApplication)) {
      debugPrint('Could not launch $url');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('About'),
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.business, size: 100, color: Colors.blueGrey),
            const SizedBox(height: 20),
            const Text(
              'Venkateshwara UPVC',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 10),
            const Text('Quotation Maker App v2.0'),
            const SizedBox(height: 40),
            ElevatedButton.icon(
              icon: const Icon(Icons.link),
              label: const Text('Developer Profile'),
              onPressed: _launchLinkedIn,
            ),
          ],
        ),
      ),
    );
  }
}
