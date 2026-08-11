/// OFFLINE TIER — BRANDING SETTINGS (the "I typed my phone number wrong" screen).
///
/// Same data as the first-launch wizard, but as a flat sectioned form: once the
/// app is set up, forcing the user back through five paged steps to fix one
/// character would be hostile. Every field widget is imported from
/// `brand_fields.dart` so the two screens can never drift apart.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'brand_fields.dart';
import 'brand_service.dart';

class BrandSettingsScreen extends StatefulWidget {
  const BrandSettingsScreen({super.key, this.onReset});

  /// Called after "Reset all branding" succeeds, so the shell can send the user
  /// back to the wizard. Routing is never done from inside this screen.
  final VoidCallback? onReset;

  @override
  State<BrandSettingsScreen> createState() => _BrandSettingsScreenState();
}

class _BrandSettingsScreenState extends State<BrandSettingsScreen> {
  final BrandService _service = BrandService.instance;
  late final BrandFieldControllers _f;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _f = BrandFieldControllers(_service.config);
  }

  @override
  void dispose() {
    _f.dispose();
    super.dispose();
  }

  void _toast(String message, {bool error = false}) {
    ScaffoldMessenger.of(context)
      ..clearSnackBars()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          behavior: SnackBarBehavior.floating,
          backgroundColor: error ? Colors.redAccent : null,
        ),
      );
  }

  // Same validators as the wizard, imported from brand_fields.dart rather than
  // re-implemented — see the header note: a rule fixed on one screen and left
  // broken on the other is the failure mode this file exists to avoid.
  String? get _accountNoError => validateAccountNumber(_f.bankAccountNo.text);
  String? get _ifscError => validateIfsc(_f.bankIfsc.text);
  String? get _upiError => validateUpiVpa(_f.upiId.text);

  Future<void> _save() async {
    if (_saving) return;
    if (_f.companyName.text.trim().isEmpty) {
      _toast('Company name cannot be empty', error: true);
      return;
    }
    // Blocking here as well as in the wizard: Settings is where a client
    // actually types their bank details (the wizard step is usually skipped),
    // so this is the path that most needs the guard.
    if (!bankAndUpiFieldsAreValid(_f)) {
      setState(() {}); // surface the per-field errorText
      _toast('Please correct the highlighted payment details', error: true);
      return;
    }
    setState(() => _saving = true);
    // setupComplete is preserved from the existing config — editing details
    // must never demote a branded app back into the wizard.
    final saved = await _service.save(_f.applyTo(_service.config));
    if (!mounted) return;
    setState(() => _saving = false);
    _toast(
      saved
          ? 'Branding saved'
          : 'Could not save to this device. Please free up storage and retry.',
      error: !saved,
    );
  }

  Future<void> _confirmReset() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(24)),
        ),
        title: const Text('Reset all branding?'),
        content: const Text(
          'This clears your company details, logo, bank details, quotation '
          'numbering and terms, and restarts the setup wizard.\n\n'
          'Your saved quotations are NOT deleted.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text(
              'Reset everything',
              style: TextStyle(color: Colors.red),
            ),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await _service.resetBranding();
    if (!mounted) return;
    _toast('Branding reset');
    widget.onReset?.call();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Branding')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
        children: [
          BrandSectionCard(
            title: 'Business Details',
            subtitle: 'Printed at the top of every quotation.',
            icon: Icons.storefront_outlined,
            children: [
              BrandTextField(
                controller: _f.companyName,
                label: 'Company name *',
                icon: Icons.storefront_outlined,
              ),
              BrandTextField(
                controller: _f.proprietorName,
                label: 'Proprietor name',
                icon: Icons.person_outline,
              ),
              BrandTextField(
                controller: _f.address,
                label: 'Address',
                icon: Icons.location_on_outlined,
                maxLines: 3,
                textCapitalization: TextCapitalization.sentences,
              ),
              BrandTextField(
                controller: _f.phone,
                label: 'Phone',
                icon: Icons.phone_outlined,
                keyboardType: TextInputType.phone,
                textCapitalization: TextCapitalization.none,
              ),
              BrandTextField(
                controller: _f.email,
                label: 'Email',
                icon: Icons.email_outlined,
                keyboardType: TextInputType.emailAddress,
                textCapitalization: TextCapitalization.none,
              ),
              BrandTextField(
                controller: _f.gstin,
                label: 'GSTIN',
                icon: Icons.receipt_long_outlined,
                textCapitalization: TextCapitalization.characters,
                inputFormatters: const [
                  UpperCaseTextFormatter(stripSpaces: true),
                ],
              ),
            ],
          ),
          BrandSectionCard(
            title: 'Logo',
            subtitle: 'PNG or JPEG, under 300 KB. Large logos slow the PDF down.',
            icon: Icons.image_outlined,
            children: [
              LogoPickerCard(onChanged: () => setState(() {})),
              const SizedBox(height: 8),
            ],
          ),
          BrandSectionCard(
            title: 'Bank & Payment',
            subtitle: 'Shown on the quotation so customers know where to pay.',
            icon: Icons.account_balance_outlined,
            children: [
              BrandTextField(
                controller: _f.bankName,
                label: 'Bank name',
                icon: Icons.account_balance_outlined,
              ),
              BrandTextField(
                controller: _f.bankBranch,
                label: 'Branch',
                icon: Icons.location_city_outlined,
              ),
              BrandTextField(
                controller: _f.bankAccountName,
                label: 'Account holder name',
                icon: Icons.badge_outlined,
              ),
              BrandTextField(
                controller: _f.bankAccountNo,
                label: 'Account number',
                icon: Icons.numbers,
                keyboardType: TextInputType.number,
                textCapitalization: TextCapitalization.none,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                errorText: _accountNoError,
                onChanged: (_) => setState(() {}),
              ),
              BrandTextField(
                controller: _f.bankIfsc,
                label: 'IFSC code',
                hint: 'e.g. SBIN0001234',
                helper: '4 letters, then 0, then 6 letters or numbers.',
                icon: Icons.qr_code_2_outlined,
                textCapitalization: TextCapitalization.characters,
                inputFormatters: const [
                  UpperCaseTextFormatter(stripSpaces: true),
                ],
                errorText: _ifscError,
                onChanged: (_) => setState(() {}),
              ),
              BrandTextField(
                controller: _f.upiId,
                label: 'UPI ID',
                hint: 'yourname@okaxis',
                helper: 'Printed as a QR code your customer can scan to pay you.',
                icon: Icons.currency_rupee,
                textCapitalization: TextCapitalization.none,
                errorText: _upiError,
                onChanged: (_) => setState(() {}),
              ),
            ],
          ),
          BrandSectionCard(
            title: 'Quotation Setup',
            icon: Icons.tag,
            children: [
              BrandTextField(
                controller: _f.quotePrefix,
                label: 'Quotation prefix',
                icon: Icons.tag,
                textCapitalization: TextCapitalization.characters,
                inputFormatters: const [
                  UpperCaseTextFormatter(stripSpaces: true),
                ],
                onChanged: (_) => setState(() {}),
              ),
              BrandTextField(
                controller: _f.quoteStartNumber,
                label: 'Next quotation number',
                helper:
                    'Changing this only affects quotations created from now on.',
                icon: Icons.format_list_numbered,
                keyboardType: TextInputType.number,
                textCapitalization: TextCapitalization.none,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                onChanged: (_) => setState(() {}),
              ),
              Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Row(
                  children: [
                    Icon(Icons.visibility_outlined,
                        size: 18, color: theme.primaryColor),
                    const SizedBox(width: 8),
                    Text(
                      'Preview: '
                      '${previewQuoteNumber(_f.effectivePrefix, _f.startNumber)}',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: theme.primaryColor,
                      ),
                    ),
                  ],
                ),
              ),
              BrandTextField(
                controller: _f.gstPercentage,
                label: 'Default GST %',
                icon: Icons.percent,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                textCapitalization: TextCapitalization.none,
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                ],
              ),
              SwitchListTile.adaptive(
                contentPadding: EdgeInsets.zero,
                value: _f.includeGstByDefault,
                onChanged: (v) => setState(() => _f.includeGstByDefault = v),
                title: const Text('Include GST by default'),
              ),
            ],
          ),
          BrandSectionCard(
            title: 'Terms & Conditions',
            subtitle: 'These print at the bottom of every quotation.',
            icon: Icons.gavel_outlined,
            children: [
              TermsEditor(
                initial: _f.terms,
                onChanged: (terms) => _f.terms = terms,
              ),
            ],
          ),
          SizedBox(
            height: 52,
            child: ElevatedButton.icon(
              onPressed: _saving ? null : _save,
              icon: _saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.save),
              label: const Text('Save Branding'),
            ),
          ),
          const SizedBox(height: 24),
          Card(
            color: Colors.red.withValues(alpha: 0.06),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(24),
              side: BorderSide(color: Colors.red.withValues(alpha: 0.25)),
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.warning_amber_rounded, color: Colors.redAccent),
                      SizedBox(width: 8),
                      Text(
                        'Danger zone',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Colors.redAccent,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Start over with a blank setup. Saved quotations are kept.',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade700,
                    ),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: _confirmReset,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.redAccent,
                      side: const BorderSide(color: Colors.redAccent),
                    ),
                    icon: const Icon(Icons.restart_alt),
                    label: const Text('Reset all branding'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
