/// OFFLINE TIER — shared branding form widgets.
///
/// The first-launch wizard and the later "fix a typo" settings screen collect
/// EXACTLY the same fields. Duplicating them would guarantee drift: a
/// validation rule fixed in one place and left broken in the other (that is
/// literally how the WhatsApp token bug survived for weeks, 09-08-2026). So
/// every input, the logo picker, the terms editor and the controller bundle
/// live here once and are consumed by both screens.
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../core/brand_config.dart';
import 'brand_service.dart';

// ===========================================================================
// PAYMENT-FIELD VALIDATORS
//
// ⚠️ DELIBERATE DUPLICATION. `UpiService.isValidVpa` in `lib/services/upi_service.dart`
// does the same job, and this is NOT an oversight — the Low tier's import
// firewall (`test/offline_no_network_test.dart`) bans every import of
// `lib/services/**` from `lib/offline/**`, because that directory is the online
// sync layer and one relative hop into it is how a network call sneaks back
// into an APK sold on a zero-network contract. Copying ~10 lines of regex is
// cheaper than weakening the firewall.
//
// If you change the VPA rule here, change it in `upi_service.dart` too.
//
// WHY THESE ARE HARD ERRORS AND NOT SOFT WARNINGS
// -----------------------------------------------
// A typo'd VPA renders a QR that a customer will actually scan; the payment
// either fails at the PSP or, worse, reaches somebody else's handle. A typo'd
// IFSC means the NEFT never arrives and the client blames the app. Neither is
// recoverable after the PDF has been sent, so both are blocked at entry.
// ===========================================================================

/// Validates a UPI VPA (`handle@psp`).
///
/// Returns null when acceptable, otherwise a message for the field's
/// `errorText`. An EMPTY value is acceptable — UPI is optional and the PDF
/// simply omits every UPI surface (`BrandConfig.hasUpi`).
///
/// Mirrors `UpiService.isValidVpa` (see the firewall note above) and adds a
/// character-set check: PSP handles are `[A-Za-z0-9.\-_]` and the whole VPA is
/// ASCII, so a smart-quote pasted from WhatsApp is caught here instead of
/// producing a QR that no PSP app will parse.
String? validateUpiVpa(String raw) {
  final v = raw.trim();
  if (v.isEmpty) return null; // optional

  if (!v.contains('@')) {
    return 'A UPI ID must contain @, like yourname@okaxis';
  }
  if (v.contains(' ')) {
    return 'A UPI ID cannot contain spaces';
  }
  final parts = v.split('@');
  if (parts.length != 2) {
    return 'A UPI ID must have exactly one @, like yourname@okaxis';
  }
  final handle = parts[0];
  final psp = parts[1];
  if (handle.isEmpty) return 'Add your name or number before the @';
  if (psp.isEmpty) return 'Add your bank handle after the @, like @okaxis';
  if (!RegExp(r'^[A-Za-z0-9.\-_]+$').hasMatch(handle)) {
    return 'The part before @ can only use letters, numbers, . - and _';
  }
  // A PSP handle is always alphabetic-ish; `@ok axis`, `@ok.axis1` are fine,
  // `@ok!` is not. Kept permissive on purpose — new PSPs appear constantly and
  // rejecting a valid new handle would be worse than accepting an odd one.
  if (!RegExp(r'^[A-Za-z0-9.\-_]+$').hasMatch(psp)) {
    return 'The bank handle after @ can only use letters, numbers, . - and _';
  }
  return null;
}

/// Validates an Indian IFSC: 4 letters + `0` + 6 alphanumerics, uppercase.
///
/// Blocking (not warning) on a malformed value is a deliberate product
/// decision: IFSC is a FIXED-WIDTH RBI-assigned code, so unlike a phone number
/// or an address there is no such thing as a legitimately unusual one. If it
/// does not match this shape it is a typo, full stop, and letting it through
/// prints bank details on an invoice that cannot receive money.
///
/// Empty is acceptable — bank details as a whole are optional.
String? validateIfsc(String raw) {
  final v = raw.trim().toUpperCase();
  if (v.isEmpty) return null; // optional

  if (v.length != 11) {
    return 'An IFSC code is exactly 11 characters (you typed ${v.length})';
  }
  if (!RegExp(r'^[A-Z]{4}').hasMatch(v)) {
    return 'The first 4 characters of an IFSC must be letters, like SBIN';
  }
  if (v[4] != '0') {
    return 'The 5th character of an IFSC is always 0 (zero)';
  }
  if (!RegExp(r'^[A-Z0-9]{6}$').hasMatch(v.substring(5))) {
    return 'The last 6 characters of an IFSC must be letters or numbers';
  }
  return null;
}

/// Validates a bank account number: digits only, 5-20 long.
///
/// Indian account numbers vary from 9 to 18 digits across banks, so the bounds
/// are generous; the real catch is a user typing their IFSC, a hyphenated
/// number or a space-grouped one into this box.
String? validateAccountNumber(String raw) {
  final v = raw.trim();
  if (v.isEmpty) return null; // optional

  if (!RegExp(r'^[0-9]+$').hasMatch(v)) {
    return 'An account number can only contain digits — no spaces or dashes';
  }
  if (v.length < 5) return 'That account number looks too short';
  if (v.length > 20) return 'That account number looks too long';
  return null;
}

/// True when every payment field is either empty or well-formed. Used by both
/// screens to decide whether the user may leave the bank step / press save.
bool bankAndUpiFieldsAreValid(BrandFieldControllers f) =>
    validateAccountNumber(f.bankAccountNo.text) == null &&
    validateIfsc(f.bankIfsc.text) == null &&
    validateUpiVpa(f.upiId.text) == null;

/// `SVU-0001` style preview. The real counter lives in `QuoteNumberService`
/// (owned elsewhere); this is display-only so the client can SEE the effect of
/// the prefix/start-number before committing to it.
String previewQuoteNumber(String prefix, int start) {
  final p = prefix.trim().isEmpty ? 'QT' : prefix.trim();
  return '$p-${start.toString().padLeft(4, '0')}';
}

/// "Sri Venkateshwara UPVC" -> "SVU". A sensible default beats an empty box:
/// most clients accept the suggestion and skip the step entirely.
String deriveQuotePrefix(String companyName) {
  final words = companyName
      .toUpperCase()
      .split(RegExp(r'[^A-Z0-9]+'))
      .where((w) => w.isNotEmpty)
      .toList();
  if (words.isEmpty) return 'QT';
  if (words.length == 1) {
    final w = words.first;
    return w.length <= 4 ? w : w.substring(0, 4);
  }
  final initials = words.map((w) => w[0]).join();
  return initials.length <= 6 ? initials : initials.substring(0, 6);
}

/// Uppercases as the user types. Used for IFSC and the quote prefix, where a
/// lowercase value is always wrong and silently fixing it at save time would
/// make the live quote-number preview lie.
class UpperCaseTextFormatter extends TextInputFormatter {
  const UpperCaseTextFormatter({this.stripSpaces = false});

  final bool stripSpaces;

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    var text = newValue.text.toUpperCase();
    if (stripSpaces) text = text.replaceAll(RegExp(r'\s+'), '');
    // Selection is clamped because stripping characters can leave the caret
    // beyond the end of the new string, which throws in the text editor.
    final offset = newValue.selection.baseOffset.clamp(0, text.length);
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: offset),
      composing: TextRange.empty,
    );
  }
}

/// Every text input the branding forms need, created and disposed in one
/// place so a new field can never be added without a matching dispose.
class BrandFieldControllers {
  BrandFieldControllers(BrandConfig c)
      : companyName = TextEditingController(text: c.companyName),
        proprietorName = TextEditingController(text: c.proprietorName),
        address = TextEditingController(text: c.address),
        phone = TextEditingController(text: c.phone),
        email = TextEditingController(text: c.email),
        gstin = TextEditingController(text: c.gstin),
        bankName = TextEditingController(text: c.bankName),
        bankBranch = TextEditingController(text: c.bankBranch),
        bankAccountName = TextEditingController(text: c.bankAccountName),
        bankAccountNo = TextEditingController(text: c.bankAccountNo),
        bankIfsc = TextEditingController(text: c.bankIfsc),
        upiId = TextEditingController(text: c.upiId),
        quotePrefix = TextEditingController(text: c.quotePrefix),
        quoteStartNumber =
            TextEditingController(text: c.quoteStartNumber.toString()),
        gstPercentage = TextEditingController(
          text: _trimZeros(c.defaultGstPercentage),
        ),
        includeGstByDefault = c.includeGstByDefault,
        terms = List<String>.from(c.termsAndConditions);

  final TextEditingController companyName;
  final TextEditingController proprietorName;
  final TextEditingController address;
  final TextEditingController phone;
  final TextEditingController email;
  final TextEditingController gstin;
  final TextEditingController bankName;
  final TextEditingController bankBranch;
  final TextEditingController bankAccountName;
  final TextEditingController bankAccountNo;
  final TextEditingController bankIfsc;
  final TextEditingController upiId;
  final TextEditingController quotePrefix;
  final TextEditingController quoteStartNumber;
  final TextEditingController gstPercentage;

  bool includeGstByDefault;
  List<String> terms;

  /// True while the user has not hand-edited the prefix, so we may keep
  /// re-deriving it from the company name. Once they type their own, we stop
  /// overwriting it — silently replacing a typed value feels broken.
  bool prefixAutoDerived = true;

  static String _trimZeros(double v) =>
      v == v.roundToDouble() ? v.toInt().toString() : v.toString();

  int get startNumber {
    final n = int.tryParse(quoteStartNumber.text.trim());
    return (n == null || n < 1) ? 1 : n;
  }

  double get gstValue {
    final v = double.tryParse(gstPercentage.text.trim());
    if (v == null || v < 0 || v > 100) return 18.0;
    return v;
  }

  String get effectivePrefix {
    final typed = quotePrefix.text.trim();
    return typed.isEmpty ? 'QT' : typed;
  }

  /// Folds the live form state onto [base], preserving fields this form does
  /// not own (logoPath, colours, brandedAt, setupComplete).
  BrandConfig applyTo(BrandConfig base) => base.copyWith(
        companyName: companyName.text.trim(),
        proprietorName: proprietorName.text.trim(),
        address: address.text.trim(),
        phone: phone.text.trim(),
        email: email.text.trim(),
        gstin: gstin.text.trim(),
        bankName: bankName.text.trim(),
        bankBranch: bankBranch.text.trim(),
        bankAccountName: bankAccountName.text.trim(),
        bankAccountNo: bankAccountNo.text.trim(),
        bankIfsc: bankIfsc.text.trim().toUpperCase(),
        upiId: upiId.text.trim(),
        quotePrefix: effectivePrefix,
        quoteStartNumber: startNumber,
        defaultGstPercentage: gstValue,
        includeGstByDefault: includeGstByDefault,
        termsAndConditions:
            terms.where((t) => t.trim().isNotEmpty).toList(growable: false),
      );

  void dispose() {
    companyName.dispose();
    proprietorName.dispose();
    address.dispose();
    phone.dispose();
    email.dispose();
    gstin.dispose();
    bankName.dispose();
    bankBranch.dispose();
    bankAccountName.dispose();
    bankAccountNo.dispose();
    bankIfsc.dispose();
    upiId.dispose();
    quotePrefix.dispose();
    quoteStartNumber.dispose();
    gstPercentage.dispose();
  }
}

/// The one text input used everywhere in branding — prefix icon + rounded
/// filled box, matching the app's existing `InputDecorationTheme`.
class BrandTextField extends StatelessWidget {
  const BrandTextField({
    super.key,
    required this.controller,
    required this.label,
    required this.icon,
    this.hint,
    this.helper,
    this.errorText,
    this.keyboardType,
    this.maxLines = 1,
    this.inputFormatters,
    this.onChanged,
    this.textCapitalization = TextCapitalization.words,
    this.autofocus = false,
  });

  final TextEditingController controller;
  final String label;
  final IconData icon;
  final String? hint;
  final String? helper;

  /// Per-field validation message, rendered inline under THIS field.
  ///
  /// Deliberately per-field rather than one snackbar at save time: a single
  /// "please check your details" toast on a 14-field form makes the user hunt
  /// for the mistake, and on the bank step the mistake is invisible (an IFSC
  /// with a letter where the zero belongs looks perfectly fine).
  final String? errorText;
  final TextInputType? keyboardType;
  final int maxLines;
  final List<TextInputFormatter>? inputFormatters;
  final ValueChanged<String>? onChanged;
  final TextCapitalization textCapitalization;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextField(
        controller: controller,
        keyboardType: keyboardType,
        maxLines: maxLines,
        minLines: 1,
        autofocus: autofocus,
        textCapitalization: textCapitalization,
        inputFormatters: inputFormatters,
        onChanged: onChanged,
        textInputAction:
            maxLines > 1 ? TextInputAction.newline : TextInputAction.next,
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          helperText: helper,
          helperMaxLines: 3,
          errorText: errorText,
          errorMaxLines: 3,
          prefixIcon: Icon(icon),
        ),
      ),
    );
  }
}

/// Sectioned card used by the settings screen and by the wizard's review step.
class BrandSectionCard extends StatelessWidget {
  const BrandSectionCard({
    super.key,
    required this.title,
    required this.icon,
    required this.children,
    this.subtitle,
  });

  final String title;
  final String? subtitle;
  final IconData icon;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 20, color: theme.primaryColor),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                      color: theme.primaryColor,
                    ),
                  ),
                ),
              ],
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 4),
              Text(
                subtitle!,
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
              ),
            ],
            const SizedBox(height: 14),
            ...children,
          ],
        ),
      ),
    );
  }
}

/// Tappable dashed drop zone with a live preview of the chosen logo.
///
/// Talks to [BrandService] directly (it owns the file, the size guard and the
/// error message) so both host screens get identical behaviour for free.
class LogoPickerCard extends StatefulWidget {
  const LogoPickerCard({super.key, this.onChanged});

  /// Fired after a successful import or a removal, so the host can refresh a
  /// summary/review panel.
  final VoidCallback? onChanged;

  @override
  State<LogoPickerCard> createState() => _LogoPickerCardState();
}

class _LogoPickerCardState extends State<LogoPickerCard> {
  final BrandService _service = BrandService.instance;
  bool _busy = false;
  String? _error;

  /// Resolved ONCE per change instead of `File(path).existsSync()` inside
  /// `build()`. Two reasons:
  ///   1. a synchronous disk stat on every frame is a real jank source on the
  ///      low-end phones this tier is sold to;
  ///   2. `existsSync` on the STORED path reports "no logo" when the app
  ///      container simply moved (iOS reinstall / Android restore), which would
  ///      scare the user into re-uploading a logo we can still find.
  ///      `BrandService.resolveLogoPath()` handles the relocation.
  String? _resolvedPath;

  @override
  void initState() {
    super.initState();
    _refreshResolvedPath();
  }

  Future<void> _refreshResolvedPath() async {
    final path = await _service.resolveLogoPath();
    if (!mounted) return;
    if (path == _resolvedPath) return;
    setState(() => _resolvedPath = path);
  }

  Future<void> _pick(ImageSource source) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final path = await _service.pickAndImportLogo(source);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = _service.lastLogoError;
      _resolvedPath = path ?? _resolvedPath;
    });
    if (path != null) widget.onChanged?.call();
  }

  Future<void> _remove() async {
    await _service.clearLogo();
    if (!mounted) return;
    setState(() {
      _error = null;
      _resolvedPath = null;
    });
    widget.onChanged?.call();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final path = _resolvedPath ?? '';
    final hasLogo = path.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Gallery is the realistic path (the logo is almost always already a
        // file), so the whole zone opens the gallery on tap.
        InkWell(
          borderRadius: BorderRadius.circular(24),
          onTap: _busy ? null : () => _pick(ImageSource.gallery),
          child: CustomPaint(
            painter: _DashedBorderPainter(
              color: hasLogo
                  ? theme.colorScheme.secondary
                  : theme.primaryColor.withValues(alpha: 0.45),
            ),
            child: SizedBox(
              height: 200,
              child: Center(
                child: _busy
                    ? const CircularProgressIndicator()
                    : hasLogo
                        ? Padding(
                            padding: const EdgeInsets.all(16),
                            child: Image.file(
                              File(path),
                              key: ValueKey(path),
                              fit: BoxFit.contain,
                              errorBuilder: (_, __, ___) => const Text(
                                'Could not display this image',
                              ),
                            ),
                          )
                        : Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.add_photo_alternate_outlined,
                                size: 46,
                                color: theme.primaryColor,
                              ),
                              const SizedBox(height: 10),
                              const Text(
                                'Tap to add your logo',
                                style: TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 15,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'PNG or JPEG • square works best',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.grey.shade600,
                                ),
                              ),
                            ],
                          ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _busy ? null : () => _pick(ImageSource.camera),
                icon: const Icon(Icons.photo_camera_outlined),
                label: const Text('Camera'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: ElevatedButton.icon(
                onPressed: _busy ? null : () => _pick(ImageSource.gallery),
                icon: const Icon(Icons.photo_library_outlined),
                label: const Text('Gallery'),
              ),
            ),
          ],
        ),
        if (hasLogo)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: _busy ? null : _remove,
              icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
              label: const Text(
                'Remove logo',
                style: TextStyle(color: Colors.redAccent),
              ),
            ),
          ),
        // Configured but unreadable. Says so HERE rather than letting the user
        // discover it when the PDF comes out with no letterhead.
        if (!hasLogo && _service.config.hasLogo && _error == null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.warning_amber_rounded,
                    size: 18, color: Colors.orange),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Your saved logo file is missing from this device. '
                    'Quotations will print your company name instead — '
                    'add the logo again to restore it.',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.orange.shade800,
                    ),
                  ),
                ),
              ],
            ),
          ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.error_outline,
                    size: 18, color: Colors.redAccent),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _error!,
                    style: const TextStyle(
                      color: Colors.redAccent,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _DashedBorderPainter extends CustomPainter {
  const _DashedBorderPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;

    final rrect = RRect.fromRectAndRadius(
      Offset.zero & size,
      const Radius.circular(24),
    );
    final path = Path()..addRRect(rrect);

    const dash = 8.0;
    const gap = 6.0;
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        final next = (distance + dash).clamp(0.0, metric.length);
        canvas.drawPath(metric.extractPath(distance, next), paint);
        distance = next + gap;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter oldDelegate) =>
      oldDelegate.color != color;
}

/// Editable terms list: each row is a live text field with a remove button,
/// plus an add box at the bottom.
///
/// Owns its own controllers (one per term) and reports the full list upward on
/// every edit. It deliberately does NOT re-sync from [initial] on rebuild —
/// that would fight the user's keystrokes. Pass a new [Key] to force a reset.
class TermsEditor extends StatefulWidget {
  const TermsEditor({
    super.key,
    required this.initial,
    required this.onChanged,
  });

  final List<String> initial;
  final ValueChanged<List<String>> onChanged;

  @override
  State<TermsEditor> createState() => _TermsEditorState();
}

class _TermsEditorState extends State<TermsEditor> {
  late final List<TextEditingController> _controllers;
  final TextEditingController _addController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _controllers = widget.initial
        .map((t) => TextEditingController(text: t))
        .toList(growable: true);
  }

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    _addController.dispose();
    super.dispose();
  }

  void _emit() => widget.onChanged(
        _controllers
            .map((c) => c.text.trim())
            .where((t) => t.isNotEmpty)
            .toList(growable: false),
      );

  void _add() {
    final text = _addController.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _controllers.add(TextEditingController(text: text));
      _addController.clear();
    });
    _emit();
  }

  void _removeAt(int index) {
    final removed = _controllers.removeAt(index);
    removed.dispose();
    setState(() {});
    _emit();
  }

  void _restoreDefaults() {
    for (final c in _controllers) {
      c.dispose();
    }
    _controllers
      ..clear()
      ..addAll(
        BrandConfig.defaultTerms.map((t) => TextEditingController(text: t)),
      );
    setState(() {});
    _emit();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < _controllers.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(top: 16, right: 8),
                  child: Text(
                    '${i + 1}.',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                Expanded(
                  child: TextField(
                    controller: _controllers[i],
                    maxLines: null,
                    textCapitalization: TextCapitalization.sentences,
                    onChanged: (_) => _emit(),
                    decoration: const InputDecoration(isDense: true),
                  ),
                ),
                IconButton(
                  tooltip: 'Remove',
                  icon: const Icon(Icons.remove_circle_outline,
                      color: Colors.redAccent),
                  onPressed: () => _removeAt(i),
                ),
              ],
            ),
          ),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _addController,
                textCapitalization: TextCapitalization.sentences,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _add(),
                decoration: const InputDecoration(
                  labelText: 'Add a term',
                  prefixIcon: Icon(Icons.playlist_add),
                ),
              ),
            ),
            IconButton(
              tooltip: 'Add',
              icon: const Icon(Icons.add_circle, color: Colors.green),
              onPressed: _add,
            ),
          ],
        ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: _restoreDefaults,
            icon: const Icon(Icons.restore, size: 18),
            label: const Text('Restore standard terms'),
          ),
        ),
      ],
    );
  }
}

/// One `Label: value` row for the review/summary card.
class BrandSummaryRow extends StatelessWidget {
  const BrandSummaryRow({
    super.key,
    required this.label,
    required this.value,
    this.emptyPlaceholder = 'Not set',
  });

  final String label;
  final String value;
  final String emptyPlaceholder;

  @override
  Widget build(BuildContext context) {
    final empty = value.trim().isEmpty;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 118,
            child: Text(
              label,
              style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
            ),
          ),
          Expanded(
            child: Text(
              empty ? emptyPlaceholder : value,
              style: TextStyle(
                fontSize: 14,
                fontWeight: empty ? FontWeight.normal : FontWeight.w600,
                color: empty ? Colors.grey.shade500 : null,
                fontStyle: empty ? FontStyle.italic : FontStyle.normal,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
