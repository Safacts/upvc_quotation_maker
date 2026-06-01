import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';

class SettingsScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppState>(context);
    final isDark = appState.isDarkMode;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              leading: Icon(isDark ? Icons.dark_mode : Icons.light_mode, color: Theme.of(context).primaryColor),
              title: const Text('Theme Appearance'),
              subtitle: Text(isDark ? 'Dark Mode' : 'Light Mode'),
              trailing: Switch(
                value: isDark,
                onChanged: (val) => appState.toggleTheme(),
                activeColor: Theme.of(context).colorScheme.primary,
              ),
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: ListTile(
              leading: Icon(Icons.security, color: Theme.of(context).primaryColor),
              title: const Text('Security'),
              subtitle: const Text('Change Password'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                // Implement change password if needed while logged in
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Use Forgot Password on Login Screen')));
              },
            ),
          ),
        ],
      ),
    );
  }
}
