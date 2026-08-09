import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/upi_service.dart';

/// UPI QR Code Generator — a free tool that builds a scannable UPI payment QR
/// entirely offline. No network, no plugin: the `qr` package (already in the
/// lockfile as a transitive dep of `barcode`) renders the module matrix, and
/// the NPCI `upi://pay?...` URI is understood by every Indian UPI app.
///
/// Reuses [UpiService] for URI construction + validation and [UpiQrView] for
/// the actual QR rendering — single source of truth, no duplicated logic.
class UpiQrGenerator extends StatefulWidget {
  const UpiQrGenerator({super.key});

  @override
  State<UpiQrGenerator> createState() => _UpiQrGeneratorState();
}

class _UpiQrGeneratorState extends State<UpiQrGenerator> {
  final _formKey = GlobalKey<FormState>();
  final _upiIdController = TextEditingController();
  final _payeeController = TextEditingController();
  final _amountController = TextEditingController();
  final _noteController = TextEditingController();

  String _upiUri = '';
  bool _showQr = false;

  @override
  void dispose() {
    _upiIdController.dispose();
    _payeeController.dispose();
    _amountController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // Generate
  // ---------------------------------------------------------------------------

  void _generate() {
    if (!_formKey.currentState!.validate()) return;

    final uri = UpiService.buildUri(
      vpa: _upiIdController.text.trim(),
      payeeName: _payeeController.text.trim(),
      amount: double.tryParse(_amountController.text.trim()),
      note: _noteController.text.trim(),
    );

    if (uri.isEmpty) {
      _showToast('Could not build UPI link. Please check the UPI ID.');
      return;
    }

    setState(() {
      _upiUri = uri;
      _showQr = true;
    });

    // Light haptic so the user feels the QR "lock in" without a noisy dialog.
    HapticFeedback.lightImpact();
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  void _copyUpiId() {
    Clipboard.setData(ClipboardData(text: _upiIdController.text.trim()));
    _showToast('UPI ID copied');
  }

  void _copyUri() {
    Clipboard.setData(ClipboardData(text: _upiUri));
    _showToast('UPI link copied');
  }

  void _share() {
    final amount = double.tryParse(_amountController.text.trim());
    final buffer = StringBuffer()
      ..writeln('Payment to: ${_payeeController.text.trim()}')
      ..writeln('UPI ID: ${_upiIdController.text.trim()}');
    if (amount != null && amount > 0) {
      buffer.writeln('Amount: ₹${amount.toStringAsFixed(2)}');
    }
    if (_noteController.text.trim().isNotEmpty) {
      buffer.writeln('Note: ${_noteController.text.trim()}');
    }
    buffer
      ..writeln()
      ..writeln(_upiUri);

    Share.share(
      buffer.toString(),
      subject: 'UPI Payment — ${_payeeController.text.trim()}',
    );
  }

  // ---------------------------------------------------------------------------
  // Payment-app deep links
  // ---------------------------------------------------------------------------

  Future<void> _openGooglePay() async {
    // gpay:// handles the UPI intent on devices with GPay installed.
    final gpayUri = 'gpay://upi/pay?${_upiUri.replaceFirst('upi://pay?', '')}';
    await _launch(gpayUri, fallback: 'https://gpay.app.goo.gl/');
  }

  Future<void> _openPhonePe() async {
    final phonePeUri = 'phonepe://pay?${_upiUri.replaceFirst('upi://pay?', '')}';
    await _launch(phonePeUri, fallback: 'https://phonepe.com/');
  }

  Future<void> _openPaytm() async {
    final paytmUri = 'paytmmp://pay?${_upiUri.replaceFirst('upi://pay?', '')}';
    await _launch(paytmUri, fallback: 'https://paytm.com/');
  }

  Future<void> _launch(String uri, {String? fallback}) async {
    try {
      final url = Uri.parse(uri);
      if (await canLaunchUrl(url)) {
        await launchUrl(url, mode: LaunchMode.externalApplication);
        return;
      }
    } catch (_) {/* fall through */}
    if (fallback != null) {
      try {
        await launchUrl(Uri.parse(fallback), mode: LaunchMode.externalApplication);
      } catch (_) {
        _showToast('Could not open the app.');
      }
    } else {
      _showToast('Could not open the app.');
    }
  }

  // ---------------------------------------------------------------------------
  // Toast helper — uses SnackBar so we don't pull in toastification for a tool
  // screen that may be opened from routes that don't have the provider above.
  // ---------------------------------------------------------------------------

  void _showToast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..clearSnackBars()
      ..showSnackBar(SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
      ));
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.primaryColor;

    return Scaffold(
      appBar: AppBar(
        title: const Text('UPI QR Generator'),
        centerTitle: true,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // ---- Header card ------------------------------------------------
              _HeaderCard(primary: primary),
              const SizedBox(height: 20),

              // ---- Input fields ----------------------------------------------
              _LabeledField(
                controller: _upiIdController,
                label: 'UPI ID',
                hint: 'name@upi, number@paytm',
                icon: Icons.account_balance_wallet_outlined,
                validator: (v) {
                  if (v == null || v.trim().isEmpty) {
                    return 'UPI ID is required';
                  }
                  if (!UpiService.isValidVpa(v.trim())) {
                    return 'Enter a valid UPI ID (e.g. name@upi)';
                  }
                  return null;
                },
                suffix: IconButton(
                  icon: const Icon(Icons.copy, size: 20),
                  tooltip: 'Copy UPI ID',
                  onPressed: _upiIdController.text.trim().isEmpty
                      ? null
                      : _copyUpiId,
                ),
              ),
              const SizedBox(height: 14),
              _LabeledField(
                controller: _payeeController,
                label: 'Payee Name',
                hint: 'Your name / business name',
                icon: Icons.person_outline,
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Payee name is required' : null,
              ),
              const SizedBox(height: 14),
              _LabeledField(
                controller: _amountController,
                label: 'Amount (₹)',
                hint: 'Leave empty for open amount',
                icon: Icons.currency_rupee,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return null; // optional
                  final parsed = double.tryParse(v.trim());
                  if (parsed == null || parsed < 0) {
                    return 'Enter a valid amount';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 14),
              _LabeledField(
                controller: _noteController,
                label: 'Transaction Note',
                hint: 'Optional (e.g. Invoice #102)',
                icon: Icons.note_alt_outlined,
                maxLength: 50,
              ),
              const SizedBox(height: 22),

              // ---- Generate button -------------------------------------------
              ElevatedButton.icon(
                onPressed: _generate,
                icon: const Icon(Icons.qr_code_2),
                label: const Text('Generate QR Code'),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  backgroundColor: primary,
                  foregroundColor: Colors.white,
                ),
              ),
              const SizedBox(height: 24),

              // ---- QR display -------------------------------------------------
              if (_showQr) ...[
                _QrDisplayCard(
                  upiUri: _upiUri,
                  onCopyUri: _copyUri,
                  onShare: _share,
                ),
                const SizedBox(height: 20),
                _PaymentAppRow(
                  onGooglePay: _openGooglePay,
                  onPhonePe: _openPhonePe,
                  onPaytm: _openPaytm,
                ),
              ],

              // ---- Bottom spacing -------------------------------------------
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// Header
// =============================================================================

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.primary});

  final Color primary;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 8,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 18),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: LinearGradient(
            colors: [primary, primary.withValues(alpha: 0.7)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Center(
                child: Text(
                  'UPI',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                    letterSpacing: 1.2,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 14),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'QR Code Generator',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Works offline · Scans with any UPI app',
                    style: TextStyle(color: Colors.white70, fontSize: 13),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// =============================================================================
// Labeled input field
// =============================================================================

class _LabeledField extends StatelessWidget {
  const _LabeledField({
    required this.controller,
    required this.label,
    required this.hint,
    required this.icon,
    this.keyboardType,
    this.validator,
    this.maxLength,
    this.suffix,
  });

  final TextEditingController controller;
  final String label;
  final String hint;
  final IconData icon;
  final TextInputType? keyboardType;
  final String? Function(String?)? validator;
  final int? maxLength;
  final Widget? suffix;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 6),
          child: Text(
            label,
            style: TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 13,
              color: Theme.of(context).primaryColor,
            ),
          ),
        ),
        TextFormField(
          controller: controller,
          keyboardType: keyboardType,
          validator: validator,
          maxLength: maxLength,
          inputFormatters: maxLength != null
              ? [LengthLimitingTextInputFormatter(maxLength)]
              : null,
          decoration: InputDecoration(
            hintText: hint,
            prefixIcon: Icon(icon),
            counterText: '',
            suffixIcon: suffix,
          ),
        ),
      ],
    );
  }
}

// =============================================================================
// QR display card
// =============================================================================

class _QrDisplayCard extends StatelessWidget {
  const _QrDisplayCard({
    required this.upiUri,
    required this.onCopyUri,
    required this.onShare,
  });

  final String upiUri;
  final VoidCallback onCopyUri;
  final VoidCallback onShare;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 12,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            // QR
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: UpiQrView(
                  upiUri: upiUri,
                  size: 260,
                  backgroundColor: Colors.white,
                  moduleColor: Colors.black,
                ),
              ),
            ),
            const SizedBox(height: 16),

            // URI text
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(12),
              ),
              child: SelectableText(
                upiUri,
                style: const TextStyle(
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: Color(0xFF475569),
                ),
                textAlign: TextAlign.center,
              ),
            ),
            const SizedBox(height: 8),

            // Copy link button
            TextButton.icon(
              onPressed: onCopyUri,
              icon: const Icon(Icons.link, size: 18),
              label: const Text('Copy UPI Link'),
            ),
            const SizedBox(height: 16),

            // Share button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: onShare,
                icon: const Icon(Icons.share),
                label: const Text('Share Payment Link'),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// =============================================================================
// Payment app quick links
// =============================================================================

class _PaymentAppRow extends StatelessWidget {
  const _PaymentAppRow({
    required this.onGooglePay,
    required this.onPhonePe,
    required this.onPaytm,
  });

  final VoidCallback onGooglePay;
  final VoidCallback onPhonePe;
  final VoidCallback onPaytm;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 6,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          children: [
            Text(
              'Open in Payment App',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 15,
                color: Theme.of(context).primaryColor,
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _AppButton(
                    label: 'Google Pay',
                    color: const Color(0xFF4285F4),
                    icon: Icons.account_balance_wallet,
                    onTap: onGooglePay,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _AppButton(
                    label: 'PhonePe',
                    color: const Color(0xFF5F259F),
                    icon: Icons.phone_android,
                    onTap: onPhonePe,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _AppButton(
                    label: 'Paytm',
                    color: const Color(0xFF00BAF2),
                    icon: Icons.account_balance,
                    onTap: onPaytm,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _AppButton extends StatelessWidget {
  const _AppButton({
    required this.label,
    required this.color,
    required this.icon,
    required this.onTap,
  });

  final String label;
  final Color color;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
          child: Column(
            children: [
              Icon(icon, color: color, size: 26),
              const SizedBox(height: 6),
              Text(
                label,
                style: TextStyle(
                  color: color,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
