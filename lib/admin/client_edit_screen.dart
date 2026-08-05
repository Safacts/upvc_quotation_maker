import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../supabase_config.dart';

class ClientEditScreen extends StatefulWidget {
  final Map<String, dynamic>? clientData;

  const ClientEditScreen({super.key, this.clientData});

  @override
  State<ClientEditScreen> createState() => _ClientEditScreenState();
}

class _ClientEditScreenState extends State<ClientEditScreen> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _idController;
  late TextEditingController _appNameController;
  late TextEditingController _companyNameController;
  late TextEditingController _companyAddressController;
  late TextEditingController _companyContactController;
  late TextEditingController _companyEmailController;
  late TextEditingController _proprietorController;
  late TextEditingController _gstController;
  late TextEditingController _bankNameController;
  late TextEditingController _bankBranchController;
  late TextEditingController _bankAccountController;
  late TextEditingController _bankIfscController;
  late TextEditingController _quotePrefixController;
  late TextEditingController _gstPercentController;
  late TextEditingController _trialDaysController;
  bool _isActive = true;
  bool _isSaving = false;
  bool _isEditing = false;

  @override
  void initState() {
    super.initState();
    _isEditing = widget.clientData != null;
    final config = (widget.clientData?['config'] as Map<String, dynamic>?) ?? {};

    _idController = TextEditingController(text: widget.clientData?['id'] as String? ?? '');
    _appNameController = TextEditingController(text: config['appName'] as String? ?? '');
    _companyNameController = TextEditingController(text: config['companyName'] as String? ?? '');
    _companyAddressController = TextEditingController(text: config['companyAddress'] as String? ?? '');
    _companyContactController = TextEditingController(text: config['companyContact'] as String? ?? '');
    _companyEmailController = TextEditingController(text: config['companyEmail'] as String? ?? '');
    _proprietorController = TextEditingController(text: config['companyProprietor'] as String? ?? '');
    _gstController = TextEditingController(text: config['gstNumber'] as String? ?? '');
    _bankNameController = TextEditingController(text: config['bankName'] as String? ?? '');
    _bankBranchController = TextEditingController(text: config['bankBranch'] as String? ?? '');
    _bankAccountController = TextEditingController(text: config['bankAccountNo'] as String? ?? '');
    _bankIfscController = TextEditingController(text: config['bankIfsc'] as String? ?? '');
    _quotePrefixController = TextEditingController(text: config['quotePrefix'] as String? ?? '');
    _gstPercentController = TextEditingController(text: (config['defaultGstPercentage'] ?? 18.0).toString());
    _isActive = widget.clientData?['is_active'] as bool? ?? true;

    final trialExpiresAt = widget.clientData?['trial_expires_at'] as String?;
    if (trialExpiresAt != null) {
      final trialDate = DateTime.tryParse(trialExpiresAt);
      if (trialDate != null) {
        _trialDaysController = TextEditingController(text: trialDate.difference(DateTime.now()).inDays.toString());
      } else {
        _trialDaysController = TextEditingController(text: '14');
      }
    } else {
      _trialDaysController = TextEditingController(text: '14');
    }
  }

  @override
  void dispose() {
    _idController.dispose();
    _appNameController.dispose();
    _companyNameController.dispose();
    _companyAddressController.dispose();
    _companyContactController.dispose();
    _companyEmailController.dispose();
    _proprietorController.dispose();
    _gstController.dispose();
    _bankNameController.dispose();
    _bankBranchController.dispose();
    _bankAccountController.dispose();
    _bankIfscController.dispose();
    _quotePrefixController.dispose();
    _gstPercentController.dispose();
    _trialDaysController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSaving = true);

    final config = {
      'appName': _appNameController.text,
      'companyName': _companyNameController.text,
      'companyAddress': _companyAddressController.text,
      'companyContact': _companyContactController.text,
      'companyEmail': _companyEmailController.text,
      'companyProprietor': _proprietorController.text,
      'gstNumber': _gstController.text,
      'bankName': _bankNameController.text,
      'bankBranch': _bankBranchController.text,
      'bankAccountNo': _bankAccountController.text,
      'bankIfsc': _bankIfscController.text,
      'quotePrefix': _quotePrefixController.text,
      'defaultGstPercentage': double.tryParse(_gstPercentController.text) ?? 18.0,
      'termsAndConditions': ['Term 1', 'Term 2', 'Term 3'],
      'primaryColor': 6513505,
      'accentColor': 15508377,
      'adminEmails': [_companyEmailController.text],
    };

    final trialDays = int.tryParse(_trialDaysController.text) ?? 14;
    final trialExpiresAt = trialDays > 0
        ? DateTime.now().add(Duration(days: trialDays)).toIso8601String()
        : null;

    try {
      final data = {
        'id': _idController.text.trim(),
        'config': jsonEncode(config),
        'is_active': _isActive,
        if (trialExpiresAt != null) 'trial_expires_at': trialExpiresAt,
      };

      if (_isEditing) {
        await SupabaseConfig.client.from('clients').update(data).eq('id', widget.clientData!['id']);
      } else {
        await SupabaseConfig.client.from('clients').insert(data);
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Client saved successfully')),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save: $e')),
        );
      }
    } finally {
      setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_isEditing ? 'Edit Client' : 'New Client'),
        actions: [
          IconButton(
            icon: _isSaving
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.save),
            onPressed: _isSaving ? null : _save,
          ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _idController,
              decoration: const InputDecoration(labelText: 'Client ID (e.g. client_a)'),
              validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null,
              enabled: !_isEditing,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _companyNameController,
              decoration: const InputDecoration(labelText: 'Company Name'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _appNameController,
              decoration: const InputDecoration(labelText: 'App Name'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _companyAddressController,
              decoration: const InputDecoration(labelText: 'Address'),
              maxLines: 2,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _companyContactController,
              decoration: const InputDecoration(labelText: 'Contact Numbers'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _companyEmailController,
              decoration: const InputDecoration(labelText: 'Company Email'),
              keyboardType: TextInputType.emailAddress,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _proprietorController,
              decoration: const InputDecoration(labelText: 'Proprietor Name'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _gstController,
              decoration: const InputDecoration(labelText: 'GST Number'),
            ),
            const SizedBox(height: 16),
            const Text('Bank Details', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            TextFormField(
              controller: _bankNameController,
              decoration: const InputDecoration(labelText: 'Bank Name'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _bankBranchController,
              decoration: const InputDecoration(labelText: 'Branch'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _bankAccountController,
              decoration: const InputDecoration(labelText: 'Account No'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _bankIfscController,
              decoration: const InputDecoration(labelText: 'IFSC Code'),
            ),
            const SizedBox(height: 16),
            const Text('Settings', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            TextFormField(
              controller: _quotePrefixController,
              decoration: const InputDecoration(labelText: 'Quote Prefix (e.g. JVUPVC)'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _gstPercentController,
              decoration: const InputDecoration(labelText: 'Default GST %'),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _trialDaysController,
              decoration: const InputDecoration(labelText: 'Trial Days (0 = no trial)'),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 16),
            SwitchListTile(
              title: const Text('Active'),
              subtitle: Text(_isActive ? 'Client can access the app' : 'Client access blocked'),
              value: _isActive,
              onChanged: (v) => setState(() => _isActive = v),
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton.icon(
                onPressed: _isSaving ? null : _save,
                icon: const Icon(Icons.save),
                label: Text(_isEditing ? 'Update Client' : 'Create Client'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
