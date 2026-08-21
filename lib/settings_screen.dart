import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

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
  late TextEditingController _proprietorController;
  late TextEditingController _gstNoController;
    double _marginPercent = 65.0;
    List<String> _supplierCompanies = [];
    final _supplierController = TextEditingController();
     double _fontScale = 1.0;
     ElementDensity _elementDensity = ElementDensity.comfortable;
     bool _enableSitePhotos = true;

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
    _proprietorController = TextEditingController(text: appState.companyProprietor);
    _gstNoController = TextEditingController(text: appState.gstNumber);
     _marginPercent = appState.costMarginPercent;
     _supplierCompanies = List<String>.from(appState.supplierCompanies);
      _fontScale = appState.fontScale;
      _elementDensity = appState.elementDensity;
      _enableSitePhotos = appState.enableSitePhotos;
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
    _proprietorController.dispose();
     _gstNoController.dispose();
     _supplierController.dispose();
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
      proprietor: _proprietorController.text,
       gstNumber: _gstNoController.text,
       supplierCompanies: _supplierCompanies,
     ).then((synced) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(synced
            ? 'Settings saved successfully'
            : 'Saved on this device, but failed to sync to server'),
      ));
    });
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
                activeThumbColor: Theme.of(context).colorScheme.primary,
              ),
            ),
          ),
           const SizedBox(height: 16),
            _buildSectionHeader('Display & Layout'),
            _buildDisplaySection(),
            const SizedBox(height: 16),
            _buildSectionHeader('Quotation Maker'),
            Card(
              child: SwitchListTile(
                title: const Text('Enable Site Photos'),
                subtitle: Text(_enableSitePhotos
                    ? 'Site photos are shown in the Quotation Maker'
                    : 'Site photos are hidden'),
                value: _enableSitePhotos,
                activeThumbColor: Theme.of(context).colorScheme.primary,
                onChanged: (val) async {
                  setState(() => _enableSitePhotos = val);
                  final appState = Provider.of<AppState>(context, listen: false);
                  await appState.setEnableSitePhotos(val);
                  if (!mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(val ? 'Site photos enabled' : 'Site photos hidden')),
                  );
                },
              ),
            ),
            const SizedBox(height: 16),
            _buildSectionHeader('Company Information'),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                children: [
                  TextField(textAlign: TextAlign.center, controller: _nameController, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'Company Name')),
                  const SizedBox(height: 12),
                  TextField(textAlign: TextAlign.center, controller: _addressController, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'Address')),
                  const SizedBox(height: 12),
                  TextField(textAlign: TextAlign.center, controller: _contactController, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'Contact Numbers')),
                  const SizedBox(height: 12),
                  TextField(textAlign: TextAlign.center, controller: _emailController, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'Email Address')),
                  const SizedBox(height: 12),
                  TextField(textAlign: TextAlign.center, controller: _proprietorController, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'Proprietor Name')),
                  const SizedBox(height: 12),
                  TextField(textAlign: TextAlign.center, controller: _gstNoController, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'GST Number')),
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
                  TextField(textAlign: TextAlign.center, controller: _bankNameController, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'Bank Name')),
                  const SizedBox(height: 12),
                  TextField(textAlign: TextAlign.center, controller: _bankBranchController, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'Branch Name')),
                  const SizedBox(height: 12),
                  TextField(textAlign: TextAlign.center, controller: _bankAccountController, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'Account Number (e.g. A/C.NO: 123)')),
                  const SizedBox(height: 12),
                  TextField(textAlign: TextAlign.center, controller: _bankIfscController, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'IFSC Code (e.g. IFSC CODE: UBIN0)')),
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
                textAlign: TextAlign.center,
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
                textAlign: TextAlign.center,
                controller: _termsController,
                decoration: const InputDecoration(labelText: 'Terms (Enter each on a new line)', border: OutlineInputBorder()),
                maxLines: 6,
              ),
            ),
          ),
          const SizedBox(height: 16),
          _buildSectionHeader('Profit & Margin'),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'What % of what you quote goes toward materials & labor?',
                    style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: Slider(
                          value: _marginPercent,
                          min: 10,
                          max: 95,
                          divisions: 85,
                          label: '${_marginPercent.toInt()}%',
                          onChanged: (v) => setState(() => _marginPercent = v),
                        ),
                      ),
                      SizedBox(
                        width: 60,
                        child: Text(
                          '${_marginPercent.toInt()}%',
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20, color: Theme.of(context).primaryColor),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ],
                  ),
                  Text(
                    'Estimated profit = Revenue × ${(100 - _marginPercent.toInt())}%  (from Won quotes)',
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                  ),
                ],
              ),
            ),
          ),
           if (Provider.of<AppState>(context).clientConfig.clientId == 'kprupvc') ...[
             const SizedBox(height: 16),
             _buildSectionHeader('Supplier Companies'),
             Card(
               child: Padding(
                 padding: const EdgeInsets.all(16.0),
                 child: Column(
                   children: [
                     ..._supplierCompanies.asMap().entries.map((entry) {
                       return Padding(
                         padding: const EdgeInsets.only(bottom: 8.0),
                         child: Row(
                           children: [
                             Expanded(child: Text(entry.value, style: const TextStyle(fontSize: 15))),
                             IconButton(
                               icon: const Icon(Icons.remove_circle, color: Colors.redAccent),
                               onPressed: () {
                                 setState(() => _supplierCompanies.removeAt(entry.key));
                               },
                             ),
                           ],
                         ),
                       );
                     }),
                     Row(
                       children: [
                         Expanded(
                           child: TextField(
                             controller: _supplierController,
                             textAlign: TextAlign.center,
                             textInputAction: TextInputAction.done,
                             decoration: const InputDecoration(labelText: 'Add Company Name'),
                             onSubmitted: (_) {
                               if (_supplierController.text.trim().isNotEmpty) {
                                 setState(() {
                                   _supplierCompanies.add(_supplierController.text.trim());
                                   _supplierController.clear();
                                 });
                               }
                             },
                           ),
                         ),
                         IconButton(
                           icon: const Icon(Icons.add_circle, color: Colors.green),
                           onPressed: () {
                             if (_supplierController.text.trim().isNotEmpty) {
                               setState(() {
                                 _supplierCompanies.add(_supplierController.text.trim());
                                 _supplierController.clear();
                               });
                             }
                           },
                         ),
                       ],
                     ),
                   ],
                 ),
               ),
             ),
           ],
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

  Widget _buildDisplaySection() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Font Size', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
            const SizedBox(height: 4),
            Text('Adjust the text size across the app',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            const SizedBox(height: 8),
            Row(
              children: [
                const Text('A', style: TextStyle(fontSize: 14)),
                Expanded(
                  child: Slider(
                    value: _fontScale,
                    min: 0.8,
                    max: 1.4,
                    divisions: 6,
                    label: '${(_fontScale * 100).toInt()}%',
                    onChanged: (v) => setState(() => _fontScale = v),
                  ),
                ),
                const Text('A', style: TextStyle(fontSize: 22)),
              ],
            ),
            const SizedBox(height: 12),
            const Text('Layout Density', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
            const SizedBox(height: 4),
            Text('Control spacing and padding of UI elements',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: ElementDensity.values.map((d) {
                final selected = _elementDensity == d;
                return ChoiceChip(
                  label: Text(d.label),
                  selected: selected,
                  onSelected: (_) => setState(() => _elementDensity = d),
                );
              }).toList(),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () {
                  final appState = Provider.of<AppState>(context, listen: false);
                  appState.updateUiPreferences(
                    fontScale: _fontScale,
                    elementDensity: _elementDensity,
                  );
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Display settings saved')),
                  );
                },
                icon: const Icon(Icons.check),
                label: const Text('Apply Display Settings'),
              ),
            ),
          ],
        ),
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
