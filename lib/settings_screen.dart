import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';

class SettingsScreen extends StatefulWidget {
  @override
  _SettingsScreenState createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late TextEditingController _nameController;
  late TextEditingController _addressController;
  late TextEditingController _contactController;
  late TextEditingController _emailController;
  late TextEditingController _bankNameController;
  late TextEditingController _bankBranchController;
  late TextEditingController _bankAccountController;
  late TextEditingController _bankIfscController;
  late TextEditingController _termsController;
  late TextEditingController _gstPercentageController;

  @override
  void initState() {
    super.initState();
    final appState = Provider.of<AppState>(context, listen: false);
    _nameController = TextEditingController(text: appState.companyName);
    _addressController = TextEditingController(text: appState.companyAddress);
    _contactController = TextEditingController(text: appState.companyContact);
    _emailController = TextEditingController(text: appState.companyEmail);
    _bankNameController = TextEditingController(text: appState.bankName);
    _bankBranchController = TextEditingController(text: appState.bankBranch);
    _bankAccountController = TextEditingController(text: appState.bankAccountNo);
    _bankIfscController = TextEditingController(text: appState.bankIfsc);
    _termsController = TextEditingController(text: appState.termsAndConditions);
    _gstPercentageController = TextEditingController(text: appState.defaultGstPercentage.toString());
  }

  @override
  void dispose() {
    _nameController.dispose();
    _addressController.dispose();
    _contactController.dispose();
    _emailController.dispose();
    _bankNameController.dispose();
    _bankBranchController.dispose();
    _bankAccountController.dispose();
    _bankIfscController.dispose();
    _termsController.dispose();
    _gstPercentageController.dispose();
    super.dispose();
  }

  void _saveSettings() {
    final appState = Provider.of<AppState>(context, listen: false);
    appState.updateSettings(
      name: _nameController.text,
      address: _addressController.text,
      contact: _contactController.text,
      email: _emailController.text,
      bankName: _bankNameController.text,
      bankBranch: _bankBranchController.text,
      accountNo: _bankAccountController.text,
      ifsc: _bankIfscController.text,
      terms: _termsController.text,
      gstPercentage: double.tryParse(_gstPercentageController.text) ?? 18.0,
    );
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Settings saved successfully')));
  }

  @override
  Widget build(BuildContext context) {
    final appState = Provider.of<AppState>(context);
    final isDark = appState.isDarkMode;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
        actions: [
          IconButton(
            icon: const Icon(Icons.save),
            onPressed: _saveSettings,
            tooltip: 'Save Settings',
          )
        ],
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
          _buildSectionHeader('Company Information'),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                children: [
                  TextField(controller: _nameController, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'Company Name')),
                  const SizedBox(height: 12),
                  TextField(controller: _addressController, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'Address')),
                  const SizedBox(height: 12),
                  TextField(controller: _contactController, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'Contact Numbers')),
                  const SizedBox(height: 12),
                  TextField(controller: _emailController, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'Email Address')),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          _buildSectionHeader('Bank Details'),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                children: [
                  TextField(controller: _bankNameController, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'Bank Name')),
                  const SizedBox(height: 12),
                  TextField(controller: _bankBranchController, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'Branch Name')),
                  const SizedBox(height: 12),
                  TextField(controller: _bankAccountController, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'Account Number (e.g. A/C.NO: 123)')),
                  const SizedBox(height: 12),
                  TextField(controller: _bankIfscController, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'IFSC Code (e.g. IFSC CODE: UBIN0)')),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          _buildSectionHeader('Tax Settings'),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: TextField(
                controller: _gstPercentageController,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(labelText: 'Default GST Percentage (%)'),
              ),
            ),
          ),
          const SizedBox(height: 16),
          _buildSectionHeader('Terms & Conditions'),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: TextField(
                controller: _termsController,
                decoration: const InputDecoration(labelText: 'Terms (Enter each on a new line)', border: OutlineInputBorder()),
                maxLines: 6,
              ),
            ),
          ),
          const SizedBox(height: 32),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton.icon(
              onPressed: _saveSettings,
              icon: const Icon(Icons.save),
              label: const Text('Save Settings', style: TextStyle(fontSize: 16)),
            ),
          ),
          const SizedBox(height: 40),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0, horizontal: 4.0),
      child: Text(title, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Theme.of(context).primaryColor)),
    );
  }
}
