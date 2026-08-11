/// OFFLINE TIER — FIRST-LAUNCH SELF-BRANDING WIZARD.
///
/// This screen IS the Rs.10,000 tier's differentiator: instead of us building a
/// bespoke APK per client, the client installs one generic APK and brands it
/// themselves in under two minutes. Everything here is optimised for that
/// number — one mandatory field, every other step skippable, live previews so
/// the user can see the result instead of imagining it.
///
/// Routing is deliberately NOT done here: the shell owns it and we only call
/// [BrandWizardScreen.onComplete] once the config is safely persisted.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';

import 'brand_fields.dart';
import 'brand_service.dart';

class BrandWizardScreen extends StatefulWidget {
  const BrandWizardScreen({super.key, required this.onComplete});

  /// Invoked only after a successful save with `setupComplete: true`.
  final VoidCallback onComplete;

  @override
  State<BrandWizardScreen> createState() => _BrandWizardScreenState();
}

class _BrandWizardScreenState extends State<BrandWizardScreen> {
  static const int _stepCount = 5;
  static const List<String> _titles = <String>[
    'Your Business',
    'Your Logo',
    'Bank & Payment',
    'Quotation Setup',
    'Terms & Review',
  ];
  static const List<String> _subtitles = <String>[
    'This appears at the top of every quotation you send.',
    'Optional, but a logo makes your quotation look far more professional.',
    'Shown on the quotation so customers know where to pay. You can skip this.',
    'How your quotation numbers are generated.',
    'Check everything, then you are done.',
  ];

  final PageController _pager = PageController();
  final BrandService _service = BrandService.instance;

  late final BrandFieldControllers _f;

  int _step = 0;
  bool _saving = false;

  /// Animations run once per step ENTRY, not on every rebuild — keying the
  /// animated subtree on this counter is what stops a keystroke from
  /// re-triggering a fade and dropping frames while typing.
  int _animationEpoch = 0;

  @override
  void initState() {
    super.initState();
    _f = BrandFieldControllers(_service.config);
    // A returning user (wizard re-run after a reset) may already have a prefix
    // they typed; don't clobber it from the company name.
    _f.prefixAutoDerived = _service.config.quotePrefix.trim().isEmpty ||
        _service.config.quotePrefix.trim() == 'QT';
  }

  @override
  void dispose() {
    _pager.dispose();
    _f.dispose();
    super.dispose();
  }

  bool get _canLeaveStep1 => _f.companyName.text.trim().isNotEmpty;

  // Per-field validation for the bank step. Computed on demand (not stored)
  // so the message updates as the user types rather than only on Next.
  String? get _accountNoError => validateAccountNumber(_f.bankAccountNo.text);
  String? get _ifscError => validateIfsc(_f.bankIfsc.text);
  String? get _upiError => validateUpiVpa(_f.upiId.text);

  /// The bank step blocks on a MALFORMED value, never on an empty one.
  ///
  /// Empty is a legitimate choice ("I'll add it later"), and the Skip button
  /// stays live for exactly that. But a half-typed IFSC or a VPA missing its
  /// handle is a money-loss bug the moment the PDF is sent, and there is no
  /// legitimate malformed IFSC — it is a fixed-format RBI code.
  bool get _bankStepValid => bankAndUpiFieldsAreValid(_f);

  void _goTo(int index) {
    if (index < 0 || index >= _stepCount) return;
    setState(() {
      _step = index;
      _animationEpoch++;
    });
    // Dismiss the keyboard on page change, otherwise the next step's fields are
    // hidden behind it and the wizard feels cramped.
    FocusScope.of(context).unfocus();
    _pager.animateToPage(
      index,
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutCubic,
    );
  }

  /// Gate shared by Next AND Skip.
  ///
  /// Skip must be gated too: skipping the bank step does not clear the fields,
  /// it just moves on — so an unguarded Skip is a way to walk a malformed IFSC
  /// straight into the saved config.
  bool _validateStep(int step) {
    if (step == 0 && !_canLeaveStep1) {
      _toast('Please enter your company name to continue');
      return false;
    }
    if (step == 2 && !_bankStepValid) {
      // setState so the per-field errorText appears; the toast only says WHERE
      // to look, the field itself says what is wrong.
      setState(() {});
      _toast('Please correct the highlighted payment details');
      return false;
    }
    return true;
  }

  void _next() {
    if (!_validateStep(_step)) return;
    if (_step == _stepCount - 1) {
      _finish();
      return;
    }
    // Derive the prefix the moment we know the company name, so step 4 opens
    // pre-filled rather than empty.
    if (_step == 0 && _f.prefixAutoDerived) {
      _f.quotePrefix.text = deriveQuotePrefix(_f.companyName.text);
    }
    _goTo(_step + 1);
  }

  void _back() => _goTo(_step - 1);

  void _toast(String message) {
    ScaffoldMessenger.of(context)
      ..clearSnackBars()
      ..showSnackBar(
        SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
      );
  }

  Future<void> _finish() async {
    if (_saving) return;

    // Re-validate EVERY gated step, not just the current one. The user can
    // reach Review by pressing Skip repeatedly, and Review shows the bank
    // values read-only — so a bad IFSC would otherwise be committed from a
    // screen that has no field to flag.
    if (!_canLeaveStep1) {
      _goTo(0);
      _toast('Please enter your company name to continue');
      return;
    }
    if (!_bankStepValid) {
      _goTo(2);
      _toast('Please correct the highlighted payment details');
      return;
    }

    setState(() => _saving = true);
    // logoPath is intentionally read from the service, not the form: the logo
    // step writes it straight to disk + prefs, so the service is authoritative.
    final cfg = _f.applyTo(_service.config).copyWith(
          setupComplete: true,
          brandedAt: DateTime.now(),
        );
    final saved = await _service.save(cfg);
    if (!mounted) return;
    setState(() => _saving = false);

    // ⚠️ DO NOT call onComplete on a failed write.
    //
    // `needsSetup` is derived from the PERSISTED config. If the prefs write
    // failed (storage full, platform channel dead) the in-memory config still
    // says setupComplete, so the shell would happily show the dashboard — and
    // the client's entire setup would evaporate on the next cold start, most
    // likely mid-demo. Keeping them in the wizard with a retry is the honest
    // failure: nothing is lost and Finish can simply be pressed again.
    if (!saved) {
      _toast(
        'Could not save your details to this device. Please free up some '
        'storage and press Finish Setup again.',
      );
      return;
    }

    widget.onComplete();
  }

  Future<void> _confirmExit() async {
    final leave = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(24)),
        ),
        title: const Text('Leave setup?'),
        content: const Text(
          'You need to set up your business details before you can create '
          'quotations. Nothing you have typed will be saved.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Keep setting up'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Leave', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    if (leave == true && mounted) SystemNavigator.pop();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return PopScope(
      // Back must page BACKWARDS, never exit mid-wizard — losing four steps of
      // typing to a stray back-swipe is exactly how a client abandons the app.
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        if (_step > 0) {
          _back();
        } else {
          _confirmExit();
        }
      },
      child: Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              _header(theme),
              Expanded(
                child: PageView(
                  controller: _pager,
                  // Paging is driven by the buttons so step 1's required field
                  // cannot be swiped past.
                  physics: const NeverScrollableScrollPhysics(),
                  children: [
                    _stepBody(_stepBusiness()),
                    _stepBody(_stepLogo()),
                    _stepBody(_stepBank()),
                    _stepBody(_stepQuotation()),
                    _stepBody(_stepReview()),
                  ],
                ),
              ),
              _footer(theme),
            ],
          ),
        ),
      ),
    );
  }

  // ------------------------------------------------------------------ chrome

  Widget _header(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                'Step ${_step + 1} of $_stepCount',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.1,
                  color: theme.primaryColor,
                ),
              ),
              const Spacer(),
              if (_step > 0 && _step < _stepCount - 1)
                TextButton(
                  // Skip goes through the same gate as Next — see [_validateStep].
                  // Skipping means "leave these blank", not "accept them broken".
                  onPressed: _saving
                      ? null
                      : () {
                          if (!_validateStep(_step)) return;
                          _goTo(_step + 1);
                        },
                  child: const Text('Skip'),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: List.generate(_stepCount, (i) {
              final done = i <= _step;
              return Expanded(
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 240),
                  height: 6,
                  margin: EdgeInsets.only(right: i == _stepCount - 1 ? 0 : 6),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(3),
                    color: done
                        ? theme.primaryColor
                        : theme.primaryColor.withValues(alpha: 0.15),
                  ),
                ),
              );
            }),
          ),
          const SizedBox(height: 16),
          Text(
            _titles[_step],
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 4),
          Text(
            _subtitles[_step],
            style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
          ),
        ],
      ),
    );
  }

  /// Wraps a step in scrolling + a single entry animation.
  Widget _stepBody(Widget child) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      child: KeyedSubtree(
        key: ValueKey('step-$_step-$_animationEpoch'),
        child: child,
      )
          .animate()
          .fadeIn(duration: 220.ms)
          .slideY(begin: 0.06, end: 0, duration: 260.ms, curve: Curves.easeOut),
    );
  }

  Widget _footer(ThemeData theme) {
    final isLast = _step == _stepCount - 1;
    final nextEnabled = !_saving && (_step != 0 || _canLeaveStep1);

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
      decoration: BoxDecoration(
        color: theme.scaffoldBackgroundColor,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 12,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: Row(
        children: [
          if (_step > 0) ...[
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _saving ? null : _back,
                icon: const Icon(Icons.arrow_back),
                label: const Text('Back'),
              ),
            ),
            const SizedBox(width: 12),
          ],
          Expanded(
            flex: _step > 0 ? 2 : 1,
            child: SizedBox(
              height: 52,
              child: ElevatedButton.icon(
                onPressed: nextEnabled ? _next : null,
                icon: _saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Icon(isLast ? Icons.check_circle_outline : Icons.arrow_forward),
                label: Text(isLast ? 'Finish Setup' : 'Next'),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ------------------------------------------------------------------- steps

  Widget _stepBusiness() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        BrandTextField(
          controller: _f.companyName,
          label: 'Company name *',
          hint: 'e.g. Sri Venkateshwara UPVC',
          icon: Icons.storefront_outlined,
          autofocus: true,
          // Rebuilds the footer so "Next" unlocks on the first character.
          onChanged: (_) => setState(() {}),
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
          helper: 'Leave blank if you are not GST registered.',
          icon: Icons.receipt_long_outlined,
          textCapitalization: TextCapitalization.characters,
          inputFormatters: const [UpperCaseTextFormatter(stripSpaces: true)],
        ),
      ],
    );
  }

  Widget _stepLogo() {
    return LogoPickerCard(onChanged: () => setState(() {}));
  }

  Widget _stepBank() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
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
          // Digits-only at the keyboard as well as at validation: on a phone
          // the number is usually copied from a passbook photo and pasted, and
          // a paste bypasses the numeric keyboard entirely.
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
          inputFormatters: const [UpperCaseTextFormatter(stripSpaces: true)],
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
        // Explains WHY these three are blocking, so a user staring at a red
        // field understands it is protecting them rather than nagging.
        // Leaving them blank is always allowed; typing them wrong is not.
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.lock_outline, size: 16, color: Colors.grey.shade600),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'Leave any of these blank if you prefer — but they must be '
                'correct if filled in. A wrong IFSC or UPI ID means your '
                'customer\'s payment never reaches you.',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _stepQuotation() {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        BrandTextField(
          controller: _f.quotePrefix,
          label: 'Quotation prefix',
          helper: 'Short code that starts every quotation number.',
          icon: Icons.tag,
          textCapitalization: TextCapitalization.characters,
          inputFormatters: const [UpperCaseTextFormatter(stripSpaces: true)],
          onChanged: (_) => setState(() => _f.prefixAutoDerived = false),
        ),
        BrandTextField(
          controller: _f.quoteStartNumber,
          label: 'Starting number',
          helper:
              'Already have a quotation series? If your last Excel quote was '
              '347, start at 348 and the app will continue from there.',
          icon: Icons.format_list_numbered,
          keyboardType: TextInputType.number,
          textCapitalization: TextCapitalization.none,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          onChanged: (_) => setState(() {}),
        ),
        // Live preview: seeing "SVU-0348" removes all doubt about what the two
        // fields above actually do.
        Container(
          margin: const EdgeInsets.only(bottom: 18),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
          decoration: BoxDecoration(
            color: theme.primaryColor.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            children: [
              Icon(Icons.visibility_outlined, color: theme.primaryColor),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Your first quotation will be',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey.shade700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      previewQuoteNumber(_f.effectivePrefix, _f.startNumber),
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.2,
                        color: theme.primaryColor,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        BrandTextField(
          controller: _f.gstPercentage,
          label: 'Default GST %',
          icon: Icons.percent,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          textCapitalization: TextCapitalization.none,
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
          ],
        ),
        Card(
          margin: EdgeInsets.zero,
          child: SwitchListTile.adaptive(
            value: _f.includeGstByDefault,
            onChanged: (v) => setState(() => _f.includeGstByDefault = v),
            title: const Text('Include GST by default'),
            subtitle: const Text(
              'You can still turn GST on or off for each quotation.',
            ),
            shape: const RoundedRectangleBorder(
              borderRadius: BorderRadius.all(Radius.circular(24)),
            ),
          ),
        ),
      ],
    );
  }

  Widget _stepReview() {
    final logoSet = _service.config.hasLogo;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        BrandSectionCard(
          title: 'Terms & Conditions',
          subtitle: 'These print at the bottom of every quotation.',
          icon: Icons.gavel_outlined,
          children: [
            TermsEditor(
              initial: _f.terms,
              // setState so the "N terms" line in the review card below stays
              // truthful while the user edits the list on the same screen.
              onChanged: (terms) => setState(() => _f.terms = terms),
            ),
          ],
        ),
        BrandSectionCard(
          title: 'Review',
          icon: Icons.fact_check_outlined,
          children: [
            BrandSummaryRow(
              label: 'Company',
              value: _f.companyName.text.trim(),
            ),
            BrandSummaryRow(
              label: 'Proprietor',
              value: _f.proprietorName.text.trim(),
            ),
            BrandSummaryRow(label: 'Address', value: _f.address.text.trim()),
            BrandSummaryRow(label: 'Phone', value: _f.phone.text.trim()),
            BrandSummaryRow(label: 'Email', value: _f.email.text.trim()),
            BrandSummaryRow(label: 'GSTIN', value: _f.gstin.text.trim()),
            BrandSummaryRow(
              label: 'Logo',
              value: logoSet ? 'Added' : '',
              emptyPlaceholder: 'No logo',
            ),
            BrandSummaryRow(label: 'Bank', value: _f.bankName.text.trim()),
            BrandSummaryRow(
              label: 'Account no.',
              value: _f.bankAccountNo.text.trim(),
            ),
            BrandSummaryRow(label: 'IFSC', value: _f.bankIfsc.text.trim()),
            BrandSummaryRow(label: 'UPI', value: _f.upiId.text.trim()),
            BrandSummaryRow(
              label: 'First quote no.',
              value: previewQuoteNumber(_f.effectivePrefix, _f.startNumber),
            ),
            BrandSummaryRow(
              label: 'GST',
              value: _f.includeGstByDefault
                  ? '${_f.gstValue}% (on by default)'
                  : '${_f.gstValue}% (off by default)',
            ),
            BrandSummaryRow(
              label: 'Terms',
              value: '${_f.terms.length} '
                  '${_f.terms.length == 1 ? 'term' : 'terms'}',
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          'Everything here can be changed later from Settings.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
        ),
      ],
    );
  }
}
