import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_animate/flutter_animate.dart';

class CraftedWithLoveWidget extends StatelessWidget {
  Future<void> _launchLinkedIn() async {
    final Uri url = Uri.parse('https://www.linkedin.com/in/aadisheshu-konga/');
    if (!await launchUrl(url, mode: LaunchMode.externalApplication)) {
      debugPrint('Could not launch $url');
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16.0),
      child: Center(
        child: InkWell(
          onTap: _launchLinkedIn,
          borderRadius: BorderRadius.circular(8),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Crafted with ', style: TextStyle(color: theme.textTheme.bodySmall?.color, fontSize: 12)),
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
