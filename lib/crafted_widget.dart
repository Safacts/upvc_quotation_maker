import 'dart:async';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'secret_panel_screen.dart';

class CraftedWithLoveWidget extends StatefulWidget {
  @override
  State<CraftedWithLoveWidget> createState() => _CraftedWithLoveWidgetState();
}

class _CraftedWithLoveWidgetState extends State<CraftedWithLoveWidget> {
  int _clickCount = 0;
  Timer? _timer;

  Future<void> _launchLinkedIn() async {
    final Uri url = Uri.parse('https://www.linkedin.com/in/aadisheshu-konga/');
    if (!await launchUrl(url, mode: LaunchMode.platformDefault)) {
      debugPrint('Could not launch $url');
    }
  }

  void _handleTap() {
    _clickCount++;
    _timer?.cancel();

    if (_clickCount >= 7) {
      _clickCount = 0;
      _showSecretDialog();
    } else {
      _timer = Timer(const Duration(milliseconds: 400), () {
        if (_clickCount == 1) {
          _launchLinkedIn();
        }
        _clickCount = 0;
      });
    }
  }

  void _showSecretDialog() {
    final codeController = TextEditingController();
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Developer Access'),
          content: TextField(
            controller: codeController,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'Enter Secret Code'),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                final val = codeController.text.trim();
                final expected = (0x82552).toString();
                if (val == expected) {
                  Navigator.pop(context);
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (context) => SecretPanelScreen()),
                  );
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Invalid developer code')),
                  );
                  Navigator.pop(context);
                }
              },
              child: const Text('Submit'),
            ),
          ],
        );
      },
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4.0),
      child: Center(
        child: InkWell(
          onTap: _handleTap,
          borderRadius: BorderRadius.circular(8),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Crafted with ', style: TextStyle(color: theme.textTheme.bodySmall?.color ?? Colors.grey, fontSize: 12)),
                const Icon(Icons.favorite, color: Colors.redAccent, size: 14)
                    .animate(onPlay: (controller) => controller.repeat(reverse: true))
                    .scale(begin: const Offset(1, 1), end: const Offset(1.3, 1.3), duration: 800.ms),
                Text(' by Aadi', style: TextStyle(color: theme.colorScheme.primary, fontWeight: FontWeight.bold, fontSize: 12)),
              ],
            ),
          ),
        ),
      ).animate().fade(delay: 600.ms),
    );
  }
}
