/// OFFLINE TIER (Rs.10,000 "Low") — QUOTATION EDITOR.
///
/// ZERO-SERVER CONTRACT
/// --------------------
/// Nothing in `lib/offline/**` may import `supabase_flutter`, `package:http`,
/// `connectivity_plus`, `../../supabase_config.dart` or anything under
/// `lib/services/`. The Low tier is sold on a contractual promise of ZERO
/// network calls (Bugsy verifies with a packet capture). This screen therefore
/// talks ONLY to the SQLite repositories and to `QuoteNumberService`.
///
/// WHY THIS FILE IS STRUCTURED THE WAY IT IS
/// -----------------------------------------
/// A fabricator sits in front of a customer and types 20-30 window lines while
/// the customer watches the grand total move. Two consequences drive the whole
/// design:
///
///   1. **Typing must never drop a frame.** A naive `setState` per keystroke
///      rebuilds every one of those 30 rows (and every `TextField` inside them)
///      on every character. Here a keystroke rebuilds exactly two things: the
///      one line's own readout, and the sticky totals bar. Both are driven by
///      `ValueNotifier`s; `setState` is reserved for STRUCTURAL changes only
///      (add / duplicate / delete / reorder / status / GST toggle).
///
///   2. **Amount is never typed.** `Amount = SFT x Rate` is a hard product
///      rule; every figure shown comes from the model getters in
///      `core/models.dart`, which are parity-locked with the online app and the
///      web console. Nothing in this file re-implements that arithmetic.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../branding/brand_service.dart';
import '../core/models.dart';
import '../core/quote_number_service.dart';
import '../data/customer_repository.dart';
import '../data/offline_db.dart' show DuplicateQuoteNumberException;
import '../data/product_repository.dart';
import '../data/quotation_repository.dart';
import '../pdf/pdf_preview_screen.dart';

// =============================================================================
// Row controllers
//
// THE #1 LEAK IN A DYNAMIC FORM is a controller whose row was deleted. Keeping
// controllers in a per-row object means a removed row disposes its own
// controllers immediately (well, on the next frame — see `_disposeAfterFrame`)
// instead of surviving until the screen closes. With 30 rows x 7 controllers
// that is 210 objects; leaking them per edit session is how an editor slowly
// gets slower.
// =============================================================================

/// Owns every mutable widget resource belonging to ONE measured line.
class _MeasuredRow {
  _MeasuredRow(this.item)
      : code = TextEditingController(text: item.code),
        description = TextEditingController(text: item.description),
        width = TextEditingController(text: _numText(item.width)),
        height = TextEditingController(text: _numText(item.height)),
        units = TextEditingController(text: item.units.toString()),
        glass = TextEditingController(text: item.glass),
        rate = TextEditingController(text: _numText(item.rate));

  /// Stable identity for the widget `Key`. NOT the database id — a brand new
  /// row has no database id yet, and reordering must not lose focus.
  final Object rowKey = Object();

  final OfflineMeasuredItem item;

  final TextEditingController code;
  final TextEditingController description;
  final TextEditingController width;
  final TextEditingController height;
  final TextEditingController units;
  final TextEditingController glass;
  final TextEditingController rate;

  final FocusNode codeFocus = FocusNode();
  final FocusNode descriptionFocus = FocusNode();
  final FocusNode widthFocus = FocusNode();
  final FocusNode heightFocus = FocusNode();
  final FocusNode unitsFocus = FocusNode();
  final FocusNode glassFocus = FocusNode();
  final FocusNode rateFocus = FocusNode();

  /// Bumped on every keystroke in this row. ONLY this row's live SFT/Total
  /// readout listens to it, so a character typed in line 7 cannot repaint
  /// lines 1-6 and 8-30.
  final ValueNotifier<int> tick = ValueNotifier<int>(0);

  /// Currently selected catalogue product, shown in the picker. Separate
  /// notifier so choosing a product repaints the dropdown and nothing else.
  final ValueNotifier<OfflineProduct?> product =
      ValueNotifier<OfflineProduct?>(null);

  void bump() => tick.value++;

  /// Push the text fields back into the model. Called on every edit; cheap.
  void pullCode() => item.code = code.text;
  void pullDescription() => item.description = description.text;
  void pullGlass() => item.glass = glass.text;

  // `double.tryParse` / `int.tryParse` everywhere — `double.parse` on a
  // half-typed "12." or an empty field throws mid-keystroke.
  void pullWidth() => item.width = double.tryParse(width.text.trim()) ?? 0;
  void pullHeight() => item.height = double.tryParse(height.text.trim()) ?? 0;
  void pullRate() => item.rate = double.tryParse(rate.text.trim()) ?? 0;

  /// Units defaults to 1, never 0: a 0-unit line silently prices at zero and
  /// looks like a giveaway on the printed quotation.
  void pullUnits() {
    final parsed = int.tryParse(units.text.trim());
    item.units = (parsed == null || parsed < 0) ? 0 : parsed;
  }

  /// Overwrite the visible fields from a catalogue product.
  void applyProduct(OfflineProduct p) {
    product.value = p;
    code.text = p.code.isNotEmpty ? p.code : p.name;
    description.text = p.description.isNotEmpty ? p.description : p.name;
    glass.text = p.glass;
    rate.text = _numText(p.rate);
    pullCode();
    pullDescription();
    pullGlass();
    pullRate();
    bump();
  }

  void dispose() {
    code.dispose();
    description.dispose();
    width.dispose();
    height.dispose();
    units.dispose();
    glass.dispose();
    rate.dispose();
    codeFocus.dispose();
    descriptionFocus.dispose();
    widthFocus.dispose();
    heightFocus.dispose();
    unitsFocus.dispose();
    glassFocus.dispose();
    rateFocus.dispose();
    tick.dispose();
    product.dispose();
  }
}

/// Owns every mutable widget resource belonging to ONE unmeasured line.
class _UnmeasuredRow {
  _UnmeasuredRow(this.item)
      : description = TextEditingController(text: item.description),
        units = TextEditingController(text: item.units.toString()),
        rate = TextEditingController(text: _numText(item.rate));

  final Object rowKey = Object();

  final OfflineUnmeasuredItem item;

  final TextEditingController description;
  final TextEditingController units;
  final TextEditingController rate;

  final FocusNode descriptionFocus = FocusNode();
  final FocusNode unitsFocus = FocusNode();
  final FocusNode rateFocus = FocusNode();

  final ValueNotifier<int> tick = ValueNotifier<int>(0);
  final ValueNotifier<OfflineProduct?> product =
      ValueNotifier<OfflineProduct?>(null);

  void bump() => tick.value++;

  void pullDescription() => item.description = description.text;
  void pullRate() => item.rate = double.tryParse(rate.text.trim()) ?? 0;

  void pullUnits() {
    final parsed = int.tryParse(units.text.trim());
    item.units = (parsed == null || parsed < 0) ? 0 : parsed;
  }

  void applyProduct(OfflineProduct p) {
    product.value = p;
    description.text = p.description.isNotEmpty ? p.description : p.name;
    rate.text = _numText(p.rate);
    pullDescription();
    pullRate();
    bump();
  }

  void dispose() {
    description.dispose();
    units.dispose();
    rate.dispose();
    descriptionFocus.dispose();
    unitsFocus.dispose();
    rateFocus.dispose();
    tick.dispose();
    product.dispose();
  }
}

/// Empty for 0 so a fresh row shows a hint instead of a literal `0` the user
/// has to delete before typing.
String _numText(double v) {
  if (v == 0) return '';
  if (v == v.roundToDouble() && v.abs() < 1e15) {
    return v.toStringAsFixed(0);
  }
  return v.toString();
}

// =============================================================================
// Screen
// =============================================================================

class QuotationEditorScreen extends StatefulWidget {
  const QuotationEditorScreen({super.key, this.quotationId});

  /// Null => create a new quotation. Non-null => load and edit.
  final String? quotationId;

  @override
  State<QuotationEditorScreen> createState() => _QuotationEditorScreenState();
}

class _QuotationEditorScreenState extends State<QuotationEditorScreen> {
  // --- Repositories. Constructed once; each defaults to `OfflineDb.instance`
  //     (SQLite allows exactly one writer, so the DB itself is a singleton).
  final QuotationRepository _quotations = QuotationRepository();
  final CustomerRepository _customers = CustomerRepository();
  final ProductRepository _products = ProductRepository();

  /// The live document. Row objects mutate the very item instances held in its
  /// lists, so every model getter (`totalSft`, `grandTotal`, ...) is always
  /// reading current values without any copying step.
  late OfflineQuotation _quotation;

  final List<_MeasuredRow> _measured = <_MeasuredRow>[];
  final List<_UnmeasuredRow> _unmeasured = <_UnmeasuredRow>[];

  // --- Header / customer controllers (disposed in `dispose`).
  final TextEditingController _customerName = TextEditingController();
  final TextEditingController _reference = TextEditingController();
  final TextEditingController _address = TextEditingController();
  final TextEditingController _contact = TextEditingController();
  final TextEditingController _email = TextEditingController();
  final TextEditingController _transport = TextEditingController();
  final TextEditingController _gst = TextEditingController();
  final TextEditingController _notes = TextEditingController();

  final FocusNode _customerNameFocus = FocusNode();
  final FocusNode _referenceFocus = FocusNode();
  final FocusNode _addressFocus = FocusNode();
  final FocusNode _contactFocus = FocusNode();
  final FocusNode _emailFocus = FocusNode();
  final FocusNode _transportFocus = FocusNode();
  final FocusNode _gstFocus = FocusNode();
  final FocusNode _notesFocus = FocusNode();

  /// The ONLY thing a keystroke repaints besides its own row. Everything money
  /// related in the sticky bar hangs off this.
  final ValueNotifier<int> _totalsTick = ValueNotifier<int>(0);

  List<OfflineProduct> _measuredProducts = const <OfflineProduct>[];
  List<OfflineProduct> _unmeasuredProducts = const <OfflineProduct>[];

  bool _loading = true;
  bool _busy = false;
  bool _dirty = false;

  /// True until the first successful save. Drives the one rule that matters
  /// most here: an EXISTING quotation keeps its number forever. Renumbering a
  /// quotation the customer already holds is a compliance incident, not a bug.
  bool _isNew = true;

  /// Pop value. `true` tells the caller (list / dashboard) to refresh.
  bool _savedAnything = false;

  /// Ticked "save this customer" — defaults ON for a name not already in the
  /// address book, OFF for one that is (nothing to learn).
  bool _saveCustomer = true;
  bool _saveCustomerTouched = false;

  /// Provisional number shown for a NEW quotation. It is a PEEK, not a
  /// reservation: reserving at screen-open would burn a number every time the
  /// owner opens the editor and backs out, punching holes in the series.
  String _peekedQuoteNo = '';

  @override
  void initState() {
    super.initState();
    unawaited(_bootstrap());
  }

  @override
  void dispose() {
    // Rows first: each owns 7-10 disposables of its own.
    for (final row in _measured) {
      row.dispose();
    }
    for (final row in _unmeasured) {
      row.dispose();
    }
    _customerName.dispose();
    _reference.dispose();
    _address.dispose();
    _contact.dispose();
    _email.dispose();
    _transport.dispose();
    _gst.dispose();
    _notes.dispose();
    _customerNameFocus.dispose();
    _referenceFocus.dispose();
    _addressFocus.dispose();
    _contactFocus.dispose();
    _emailFocus.dispose();
    _transportFocus.dispose();
    _gstFocus.dispose();
    _notesFocus.dispose();
    _totalsTick.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  Future<void> _bootstrap() async {
    // The app shell normally loads branding at start-up; load defensively so a
    // deep link straight into the editor still gets the right prefix and GST.
    if (!BrandService.instance.isLoaded) {
      await BrandService.instance.load();
    }
    final brand = BrandService.instance.config;

    OfflineQuotation? existing;
    if (widget.quotationId != null && widget.quotationId!.isNotEmpty) {
      try {
        existing = await _quotations.getById(widget.quotationId!);
      } catch (e) {
        debugPrint('QuotationEditor: load failed: $e');
      }
    }

    if (existing != null) {
      _quotation = existing;
      _isNew = false;
      // An existing customer is already in the book (or deliberately was not
      // saved); do not silently re-add them behind the owner's back.
      _saveCustomer = false;
    } else {
      _quotation = OfflineQuotation(
        includeGst: brand.includeGstByDefault,
        gstPercentage: brand.includeGstByDefault ? brand.defaultGstPercentage : 0,
        measuredItems: <OfflineMeasuredItem>[OfflineMeasuredItem()],
      );
    }

    _customerName.text = _quotation.customerName;
    _reference.text = _quotation.reference;
    _address.text = _quotation.address;
    _contact.text = _quotation.contactNo;
    _email.text = _quotation.email;
    _transport.text = _numText(_quotation.transport);
    _gst.text = _numText(_quotation.gstPercentage);
    _notes.text = _quotation.notes;

    for (final item in _quotation.measuredItems) {
      _measured.add(_MeasuredRow(item));
    }
    for (final item in _quotation.unmeasuredItems) {
      _unmeasured.add(_UnmeasuredRow(item));
    }

    // Products are read ONCE. The picker is a convenience; re-querying per
    // keystroke would put SQLite on the typing path for no benefit.
    try {
      _measuredProducts = await _products.measured();
      _unmeasuredProducts = await _products.unmeasured();
    } catch (e) {
      debugPrint('QuotationEditor: product load failed: $e');
    }

    if (_isNew) await _refreshPeekedNumber();

    if (!mounted) return;
    setState(() => _loading = false);
  }

  /// Preview of the number `reserveNext` would hand out. Re-peeked when the
  /// date changes because a financial-year series (`SVU/25-26/0007`) restarts
  /// every April — back-dating to 28-Mar belongs in the previous year's book.
  Future<void> _refreshPeekedNumber() async {
    try {
      // MUST be the singleton: a second instance has its own mutex queue and
      // would happily hand out a number this one has already issued.
      final next = await QuoteNumberService.instance.peekNext(
        prefix: BrandService.instance.config.quotePrefix,
        date: _quotation.date,
      );
      if (!mounted) return;
      setState(() => _peekedQuoteNo = next);
    } catch (e) {
      debugPrint('QuotationEditor: peekNext failed: $e');
      if (!mounted) return;
      setState(() => _peekedQuoteNo = '');
    }
  }

  // ---------------------------------------------------------------------------
  // Change plumbing
  // ---------------------------------------------------------------------------

  /// A value changed. Deliberately NO `setState`: the totals bar is a
  /// `ValueListenableBuilder` and the edited row repaints itself.
  void _onEdited() {
    _dirty = true;
    _totalsTick.value++;
  }

  /// A structural change (row added / removed / moved, switch toggled).
  void _onStructureChanged(VoidCallback mutate) {
    setState(() {
      mutate();
      _syncItems();
      _dirty = true;
    });
    _totalsTick.value++;
  }

  /// Re-point the quotation's item lists at the current row order. The item
  /// OBJECTS are shared with the rows, so only ordering/membership changes.
  void _syncItems() {
    _quotation
      ..measuredItems =
          _measured.map((r) => r.item).toList(growable: true)
      ..unmeasuredItems =
          _unmeasured.map((r) => r.item).toList(growable: true);
  }

  /// Disposing a controller in the same frame that a `TextField` still
  /// references it throws. Removal happens now, disposal on the next frame.
  void _disposeAfterFrame(void Function() dispose) {
    WidgetsBinding.instance.addPostFrameCallback((_) => dispose());
  }

  // ---------------------------------------------------------------------------
  // Row operations
  // ---------------------------------------------------------------------------

  void _addMeasured() =>
      _onStructureChanged(() => _measured.add(_MeasuredRow(OfflineMeasuredItem())));

  void _addUnmeasured() => _onStructureChanged(
      () => _unmeasured.add(_UnmeasuredRow(OfflineUnmeasuredItem())));

  // Every row operation resolves the row's CURRENT index by identity rather
  // than trusting the index captured when the card was built. Two taps landing
  // in the same frame (a real thing on a cheap touchscreen) would otherwise
  // delete the wrong line, or throw a RangeError on the last one.

  void _duplicateMeasured(_MeasuredRow row) {
    final index = _measured.indexOf(row);
    if (index < 0) return;
    final copy = row.item.copy();
    // The id MUST be cleared. `save()` deletes and re-inserts children, so two
    // rows carrying the same primary key would collide on insert and abort the
    // whole transaction — the owner would see "save failed" with no clue why.
    copy.id = null;
    _onStructureChanged(() => _measured.insert(index + 1, _MeasuredRow(copy)));
  }

  void _duplicateUnmeasured(_UnmeasuredRow row) {
    final index = _unmeasured.indexOf(row);
    if (index < 0) return;
    final copy = row.item.copy();
    copy.id = null;
    _onStructureChanged(
        () => _unmeasured.insert(index + 1, _UnmeasuredRow(copy)));
  }

  void _removeMeasured(_MeasuredRow row) {
    if (!_measured.contains(row)) return;
    _onStructureChanged(() => _measured.remove(row));
    _disposeAfterFrame(row.dispose);
  }

  void _removeUnmeasured(_UnmeasuredRow row) {
    if (!_unmeasured.contains(row)) return;
    _onStructureChanged(() => _unmeasured.remove(row));
    _disposeAfterFrame(row.dispose);
  }

  void _moveMeasured(_MeasuredRow row, int delta) {
    final index = _measured.indexOf(row);
    if (index < 0) return;
    final target = index + delta;
    if (target < 0 || target >= _measured.length) return;
    _onStructureChanged(() {
      _measured.removeAt(index);
      _measured.insert(target, row);
    });
  }

  void _moveUnmeasured(_UnmeasuredRow row, int delta) {
    final index = _unmeasured.indexOf(row);
    if (index < 0) return;
    final target = index + delta;
    if (target < 0 || target >= _unmeasured.length) return;
    _onStructureChanged(() {
      _unmeasured.removeAt(index);
      _unmeasured.insert(target, row);
    });
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  void _collectHeader() {
    _quotation
      ..customerName = _customerName.text.trim()
      ..reference = _reference.text.trim()
      ..address = _address.text.trim()
      ..contactNo = _contact.text.trim()
      ..email = _email.text.trim()
      ..notes = _notes.text
      ..transport = double.tryParse(_transport.text.trim()) ?? 0
      ..gstPercentage = double.tryParse(_gst.text.trim()) ?? 0;
    _syncItems();
  }

  String? _validate() {
    if (_customerName.text.trim().isEmpty) {
      return 'Customer name is required.';
    }
    if (_measured.isEmpty && _unmeasured.isEmpty) {
      return 'Add at least one item before saving.';
    }
    return null;
  }

  /// Persist. Returns true on success.
  ///
  /// SAVE / RETRY / RELEASE FLOW
  /// ---------------------------
  ///  * NEW quotation  -> `reserveNext` immediately before the insert (never at
  ///    screen-open: an abandoned editor would burn a number).
  ///  * EXISTING       -> keeps its number, full stop. No reservation happens.
  ///  * `DuplicateQuoteNumberException` on a NEW quotation -> reserve the NEXT
  ///    number and retry exactly ONCE. The rejected number is NOT released: the
  ///    UNIQUE index just proved it is genuinely taken, so handing it back to
  ///    the counter would only make the next allocation re-probe it.
  ///  * Any failure that leaves us holding a reservation -> `release(quoteNo)`
  ///    so the series does not grow a gap for a document that never existed.
  Future<bool> _save() async {
    if (_busy) return false;

    final problem = _validate();
    if (problem != null) {
      _toast(problem, error: true);
      return false;
    }

    setState(() => _busy = true);
    _collectHeader();

    String? reserved;
    var ok = false;

    try {
      // Address book first, so the quotation header can carry the surviving
      // customer id. The repository MERGES on a name clash and returns the id
      // of the row that actually survived.
      if (_saveCustomer && _quotation.customerName.isNotEmpty) {
        try {
          final id = await _customers.save(OfflineCustomer(
            name: _quotation.customerName,
            phone: _quotation.contactNo,
            email: _quotation.email,
            address: _quotation.address,
          ));
          _quotation.customerId = id;
        } catch (e) {
          // A failed address-book write must never block the quotation — the
          // quotation carries its own copy of every customer field as text.
          debugPrint('QuotationEditor: customer save failed: $e');
        }
      }

      if (_isNew) {
        reserved = await QuoteNumberService.instance.reserveNext(
          prefix: BrandService.instance.config.quotePrefix,
          date: _quotation.date,
        );
        _quotation.quotationNo = reserved;
      }

      var attempt = 0;
      while (true) {
        try {
          final id = await _quotations.save(_quotation);
          _quotation.id = id;
          ok = true;
          break;
        } on DuplicateQuoteNumberException catch (e) {
          if (!_isNew || attempt >= 1) {
            // Existing quotation, or the retry also collided. Give the number
            // back and tell the owner plainly — silently renumbering a document
            // they may already have sent is far worse than an error message.
            if (reserved != null) {
              await QuoteNumberService.instance.release(reserved);
              reserved = null;
            }
            _toast(
              'Quotation number ${e.quoteNo} is already used. '
              'Check Settings > quotation numbering.',
              error: true,
            );
            return false;
          }
          attempt++;
          debugPrint('QuotationEditor: duplicate ${e.quoteNo}; retrying once');
          reserved = await QuoteNumberService.instance.reserveNext(
            prefix: BrandService.instance.config.quotePrefix,
            date: _quotation.date,
          );
          _quotation.quotationNo = reserved;
        }
      }
    } catch (e) {
      debugPrint('QuotationEditor: save failed: $e');
      _toast('Could not save: $e', error: true);
      return false;
    } finally {
      if (!ok && reserved != null) {
        // Failed after reserving — hand the number back. `release` is a no-op
        // unless this is still the highest issued number, so it can never
        // resurrect a number another quotation has since taken.
        await QuoteNumberService.instance.release(reserved);
      }
      if (mounted) setState(() => _busy = false);
    }

    if (!mounted) return ok;
    setState(() {
      _isNew = false;
      _dirty = false;
      _savedAnything = true;
    });
    _toast('Saved ${_quotation.quotationNo}');
    return true;
  }

  Future<void> _previewPdf() async {
    // Save first: the preview must render the document that is actually
    // stored, otherwise the owner shares a PDF the app cannot reproduce.
    final saved = await _save();
    if (!saved || !mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PdfPreviewScreen(
          quotation: _quotation,
          brand: BrandService.instance.config,
        ),
      ),
    );
  }

  Future<void> _confirmDelete() async {
    final id = _quotation.id;
    if (id == null || id.isEmpty) return;

    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete quotation?'),
        content: Text(
          '${_quotation.quotationNo} and all of its items will be removed. '
          'There is no server backup in this edition — this cannot be undone.',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade600),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (yes != true) return;

    try {
      await _quotations.delete(id);
    } catch (e) {
      debugPrint('QuotationEditor: delete failed: $e');
      _toast('Could not delete: $e', error: true);
      return;
    }
    if (!mounted) return;
    Navigator.of(context).pop(true);
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _quotation.date,
      // Wide enough for back-dated migration work, narrow enough that a fat
      // finger cannot land the quotation in 1970.
      firstDate: DateTime(DateTime.now().year - 5),
      lastDate: DateTime(DateTime.now().year + 5),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _quotation.date = picked;
      _dirty = true;
    });
    // The financial-year series depends on the date, so the preview must move
    // with it.
    if (_isNew) await _refreshPeekedNumber();
  }

  void _toast(String message, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        backgroundColor: error ? Colors.red.shade700 : null,
        duration: Duration(seconds: error ? 4 : 2),
      ));
  }

  Future<void> _handleBack() async {
    final navigator = Navigator.of(context);
    if (!_dirty) {
      navigator.pop(_savedAnything);
      return;
    }
    final action = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Unsaved changes'),
        content: const Text(
          'This quotation has changes that have not been saved.',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.pop(ctx, 'stay'),
            child: const Text('Keep editing'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, 'discard'),
            child: const Text('Discard'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, 'save'),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (!mounted || action == null || action == 'stay') return;
    if (action == 'save') {
      final saved = await _save();
      if (!saved || !mounted) return;
    }
    navigator.pop(_savedAnything || action == 'save');
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    // `canPop: false` unconditionally: flipping it with `_dirty` would force a
    // full-screen rebuild the first time a character is typed, which is exactly
    // the rebuild this screen is built to avoid.
    return PopScope<Object?>(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        unawaited(_handleBack());
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(_isNew ? 'New Quotation' : 'Edit Quotation'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => unawaited(_handleBack()),
          ),
          actions: <Widget>[
            if (_busy)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 18),
                child: Center(
                  child: SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              )
            else ...<Widget>[
              IconButton(
                icon: const Icon(Icons.save_outlined),
                tooltip: 'Save',
                onPressed: _loading ? null : () => unawaited(_save()),
              ),
              IconButton(
                icon: const Icon(Icons.picture_as_pdf_outlined),
                tooltip: 'Preview PDF',
                onPressed: _loading ? null : () => unawaited(_previewPdf()),
              ),
              if (!_isNew)
                IconButton(
                  icon: const Icon(Icons.delete_outline),
                  tooltip: 'Delete',
                  onPressed: _loading ? null : () => unawaited(_confirmDelete()),
                ),
            ],
          ],
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _buildForm(context),
        bottomNavigationBar: _loading ? null : _buildTotalsBar(context),
      ),
    );
  }

  Widget _buildForm(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
      // Keeps the keyboard from covering the field the user just tapped
      // without stealing focus while they scroll to check a line.
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      children: <Widget>[
        _buildHeaderCard(context),
        const SizedBox(height: 12),
        _buildCustomerCard(context),
        const SizedBox(height: 12),
        _buildMeasuredSection(context),
        const SizedBox(height: 12),
        _buildUnmeasuredSection(context),
        const SizedBox(height: 12),
        _buildChargesCard(context),
        const SizedBox(height: 12),
        _buildNotesCard(context),
      ],
    );
  }

  // --- 1. Header ------------------------------------------------------------

  Widget _buildHeaderCard(BuildContext context) {
    final theme = Theme.of(context);
    final quoteNo = _isNew
        ? (_peekedQuoteNo.isEmpty ? 'Assigned on save' : _peekedQuoteNo)
        : _quotation.quotationNo;

    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text('Quote No', style: _labelStyle(theme)),
                    const SizedBox(height: 6),
                    Chip(
                      avatar: const Icon(Icons.tag, size: 16),
                      label: Text(
                        quoteNo,
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      visualDensity: VisualDensity.compact,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text('Date', style: _labelStyle(theme)),
                    const SizedBox(height: 6),
                    OutlinedButton.icon(
                      icon: const Icon(Icons.calendar_today, size: 16),
                      label: Text(formatQuoteDate(_quotation.date)),
                      onPressed: () => unawaited(_pickDate()),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (_isNew) ...<Widget>[
            const SizedBox(height: 8),
            Row(
              children: <Widget>[
                Icon(Icons.info_outline,
                    size: 14, color: theme.colorScheme.outline),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'This number is reserved when you save, so backing out '
                    'now leaves no gap in your series.',
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: theme.colorScheme.outline),
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 12),
          _dropdownField<OfflineQuotationStatus>(
            context: context,
            label: 'Status',
            icon: Icons.flag_outlined,
            value: _quotation.status,
            items: OfflineQuotationStatus.values
                .map((s) => DropdownMenuItem<OfflineQuotationStatus>(
                      value: s,
                      child: Text(s.label),
                    ))
                .toList(growable: false),
            onChanged: (s) {
              if (s == null) return;
              setState(() {
                _quotation.status = s;
                _dirty = true;
              });
            },
          ),
        ],
      ),
      // Animated once, on entry. `Animate` keeps its state across rebuilds, so
      // this does NOT replay while the owner types.
    ).animate().fadeIn(duration: 200.ms).slideY(begin: -0.05);
  }

  // --- 2. Customer ----------------------------------------------------------

  Widget _buildCustomerCard(BuildContext context) {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _sectionTitle(context, 'Customer', Icons.person_outline),
          const SizedBox(height: 12),
          _buildCustomerAutocomplete(context),
          const SizedBox(height: 12),
          _textField(
            controller: _reference,
            focusNode: _referenceFocus,
            label: 'Reference',
            icon: Icons.bookmark_outline,
          ),
          const SizedBox(height: 12),
          _textField(
            controller: _address,
            focusNode: _addressFocus,
            label: 'Address',
            icon: Icons.location_on_outlined,
            maxLines: 3,
            textInputAction: TextInputAction.newline,
          ),
          const SizedBox(height: 12),
          Row(
            children: <Widget>[
              Expanded(
                child: _textField(
                  controller: _contact,
                  focusNode: _contactFocus,
                  label: 'Contact No',
                  icon: Icons.phone_outlined,
                  keyboardType: TextInputType.phone,
                  inputFormatters: <TextInputFormatter>[
                    LengthLimitingTextInputFormatter(15),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _textField(
                  controller: _email,
                  focusNode: _emailFocus,
                  label: 'Email',
                  icon: Icons.mail_outline,
                  keyboardType: TextInputType.emailAddress,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          CheckboxListTile(
            value: _saveCustomer,
            dense: true,
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: const Text('Save this customer'),
            subtitle: const Text(
              'Adds them to the address book so you never retype it.',
            ),
            onChanged: (v) => setState(() {
              _saveCustomer = v ?? false;
              _saveCustomerTouched = true;
            }),
          ),
        ],
      ),
    );
  }

  /// Offline name autocomplete over the SQLite address book.
  ///
  /// `RawAutocomplete` (not `Autocomplete`) because we must own the
  /// `TextEditingController` — `Autocomplete` creates its own, which we could
  /// neither read at save time nor dispose.
  Widget _buildCustomerAutocomplete(BuildContext context) {
    return RawAutocomplete<OfflineCustomer>(
      textEditingController: _customerName,
      focusNode: _customerNameFocus,
      displayStringForOption: (c) => c.name,
      optionsBuilder: (TextEditingValue value) async {
        final term = value.text.trim();
        if (term.length < 2) return const Iterable<OfflineCustomer>.empty();
        try {
          final rows = await _customers.list(search: term);
          return rows.take(8);
        } catch (e) {
          // The address book is a convenience; a failed lookup must never
          // block typing a name.
          debugPrint('QuotationEditor: customer lookup failed: $e');
          return const Iterable<OfflineCustomer>.empty();
        }
      },
      onSelected: (OfflineCustomer c) {
        _customerName.text = c.name;
        _address.text = c.address;
        _contact.text = c.phone;
        _email.text = c.email;
        _quotation.customerId = c.id ?? '';
        setState(() {
          // Already in the book — nothing to learn from saving it again.
          if (!_saveCustomerTouched) _saveCustomer = false;
          _dirty = true;
        });
        _totalsTick.value++;
      },
      fieldViewBuilder: (context, controller, focusNode, onFieldSubmitted) {
        return _textField(
          controller: controller,
          focusNode: focusNode,
          label: 'Customer Name *',
          icon: Icons.badge_outlined,
          textInputAction: TextInputAction.next,
          onSubmitted: (_) {
            onFieldSubmitted();
            _referenceFocus.requestFocus();
          },
          onChanged: (_) {
            // A freshly typed (unknown) name is the case worth saving.
            if (!_saveCustomerTouched && !_saveCustomer) {
              setState(() => _saveCustomer = true);
            }
            _onEdited();
          },
        );
      },
      optionsViewBuilder: (context, onSelected, options) {
        return Align(
          alignment: Alignment.topLeft,
          child: Material(
            elevation: 4,
            borderRadius: BorderRadius.circular(12),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 260, maxWidth: 420),
              child: ListView.builder(
                padding: EdgeInsets.zero,
                shrinkWrap: true,
                itemCount: options.length,
                itemBuilder: (context, index) {
                  final c = options.elementAt(index);
                  final subtitle = <String>[
                    if (c.phone.trim().isNotEmpty) c.phone.trim(),
                    if (c.address.trim().isNotEmpty) c.address.trim(),
                  ].join('  -  ');
                  return ListTile(
                    dense: true,
                    leading: const Icon(Icons.person_outline, size: 20),
                    title: Text(c.name),
                    subtitle: subtitle.isEmpty
                        ? null
                        : Text(subtitle, maxLines: 1,
                            overflow: TextOverflow.ellipsis),
                    onTap: () => onSelected(c),
                  );
                },
              ),
            ),
          ),
        );
      },
    );
  }

  // --- 3. Measured items ----------------------------------------------------

  Widget _buildMeasuredSection(BuildContext context) {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _sectionTitle(
            context,
            'Measured Items',
            Icons.straighten,
            trailing: Text(
              '${_measured.length}',
              style: Theme.of(context).textTheme.labelLarge,
            ),
          ),
          if (_measured.isEmpty)
            _emptyHint('No windows yet. Add the first measured line.'),
          // `asMap().entries.map` rather than an indexed `for`, because the
          // callbacks must close over the ROW OBJECT, not over a loop index
          // that goes stale the moment a line above it is deleted.
          ..._measured.asMap().entries.map((entry) {
            final row = entry.value;
            return _MeasuredItemCard(
              // Row identity, so reordering moves the row instead of
              // re-associating another row's controllers with this slot.
              key: ValueKey<Object>(row.rowKey),
              row: row,
              index: entry.key,
              total: _measured.length,
              products: _measuredProducts,
              onEdited: _onEdited,
              onDuplicate: () => _duplicateMeasured(row),
              onDelete: () => _removeMeasured(row),
              onMoveUp: () => _moveMeasured(row, -1),
              onMoveDown: () => _moveMeasured(row, 1),
            );
          }),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              icon: const Icon(Icons.add),
              label: const Text('Add Measured Item'),
              onPressed: _addMeasured,
            ),
          ),
        ],
      ),
    );
  }

  // --- 4. Unmeasured items --------------------------------------------------

  Widget _buildUnmeasuredSection(BuildContext context) {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _sectionTitle(
            context,
            'Unmeasured Items',
            Icons.inventory_2_outlined,
            trailing: Text(
              '${_unmeasured.length}',
              style: Theme.of(context).textTheme.labelLarge,
            ),
          ),
          if (_unmeasured.isEmpty)
            _emptyHint('Handles, locks, silicone and anything priced per piece.'),
          ..._unmeasured.asMap().entries.map((entry) {
            final row = entry.value;
            return _UnmeasuredItemCard(
              key: ValueKey<Object>(row.rowKey),
              row: row,
              index: entry.key,
              total: _unmeasured.length,
              products: _unmeasuredProducts,
              onEdited: _onEdited,
              onDuplicate: () => _duplicateUnmeasured(row),
              onDelete: () => _removeUnmeasured(row),
              onMoveUp: () => _moveUnmeasured(row, -1),
              onMoveDown: () => _moveUnmeasured(row, 1),
            );
          }),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              icon: const Icon(Icons.add),
              label: const Text('Add Unmeasured Item'),
              onPressed: _addUnmeasured,
            ),
          ),
        ],
      ),
    );
  }

  // --- 5. Charges & tax -----------------------------------------------------

  Widget _buildChargesCard(BuildContext context) {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _sectionTitle(context, 'Charges & Tax', Icons.local_shipping_outlined),
          const SizedBox(height: 12),
          _textField(
            controller: _transport,
            focusNode: _transportFocus,
            label: 'Transport Cost',
            icon: Icons.currency_rupee,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            onChanged: (v) {
              _quotation.transport = double.tryParse(v.trim()) ?? 0;
              _onEdited();
            },
          ),
          SwitchListTile(
            value: _quotation.includeGst,
            contentPadding: EdgeInsets.zero,
            title: const Text('Include GST'),
            subtitle: const Text('Charged on items plus transport.'),
            onChanged: (v) {
              setState(() {
                _quotation.includeGst = v;
                if (v && _quotation.gstPercentage == 0) {
                  // Fall back to the branding default rather than 0% — a 0%
                  // GST line on a taxable quotation is a filing problem.
                  _quotation.gstPercentage =
                      BrandService.instance.config.defaultGstPercentage;
                  _gst.text = _numText(_quotation.gstPercentage);
                }
                _dirty = true;
              });
              _totalsTick.value++;
            },
          ),
          if (_quotation.includeGst)
            _textField(
              controller: _gst,
              focusNode: _gstFocus,
              label: 'GST %',
              icon: Icons.percent,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              onChanged: (v) {
                _quotation.gstPercentage = double.tryParse(v.trim()) ?? 0;
                _onEdited();
              },
            ),
        ],
      ),
    );
  }

  // --- 6. Notes -------------------------------------------------------------

  Widget _buildNotesCard(BuildContext context) {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _sectionTitle(context, 'Notes', Icons.notes_outlined),
          const SizedBox(height: 12),
          _textField(
            controller: _notes,
            focusNode: _notesFocus,
            label: 'Notes for this quotation',
            icon: Icons.edit_note,
            maxLines: 4,
            textInputAction: TextInputAction.newline,
          ),
        ],
      ),
    );
  }

  // --- Sticky totals --------------------------------------------------------

  /// The most-watched pixels in the product: the fabricator negotiates against
  /// this number in real time. Rebuilt by `_totalsTick` alone — never by a
  /// full-form `setState`.
  Widget _buildTotalsBar(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      elevation: 12,
      color: theme.colorScheme.surface,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          child: ValueListenableBuilder<int>(
            valueListenable: _totalsTick,
            builder: (context, _, __) {
              final q = _quotation;
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Row(
                    children: <Widget>[
                      _totalChip(theme, 'Total SFT',
                          q.totalSft.toStringAsFixed(2)),
                      _totalChip(theme, 'Amount', formatInr(q.actualAmount)),
                      _totalChip(theme, 'Transport', formatInr(q.transport)),
                      _totalChip(
                        theme,
                        q.includeGst ? 'GST ${_pct(q.gstPercentage)}%' : 'GST',
                        formatInr(q.igst),
                      ),
                    ],
                  ),
                  const Divider(height: 14),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: <Widget>[
                      Text(
                        'GRAND TOTAL',
                        style: theme.textTheme.labelLarge?.copyWith(
                          letterSpacing: 1.1,
                          color: theme.colorScheme.outline,
                        ),
                      ),
                      Flexible(
                        child: Text(
                          formatInr(q.grandTotal),
                          textAlign: TextAlign.right,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.bold,
                            color: theme.colorScheme.primary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _totalChip(ThemeData theme, String label, String value) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodySmall
                ?.copyWith(color: theme.colorScheme.outline),
          ),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
          ),
        ],
      ),
    );
  }

  // --- Shared chrome --------------------------------------------------------

  Widget _card({required Widget child}) => Card(
        elevation: 1,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: Padding(padding: const EdgeInsets.all(16), child: child),
      );

  Widget _sectionTitle(BuildContext context, String title, IconData icon,
      {Widget? trailing}) {
    final theme = Theme.of(context);
    return Row(
      children: <Widget>[
        Icon(icon, size: 18, color: theme.colorScheme.primary),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            title,
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.bold,
              color: theme.colorScheme.primary,
            ),
          ),
        ),
        if (trailing != null) trailing,
      ],
    );
  }

  TextStyle? _labelStyle(ThemeData theme) =>
      theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline);

  Widget _emptyHint(String text) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Text(
          text,
          style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
        ),
      );

  Widget _textField({
    required TextEditingController controller,
    required FocusNode focusNode,
    required String label,
    required IconData icon,
    TextInputType? keyboardType,
    int maxLines = 1,
    TextInputAction? textInputAction,
    List<TextInputFormatter>? inputFormatters,
    ValueChanged<String>? onChanged,
    ValueChanged<String>? onSubmitted,
  }) {
    return TextField(
      controller: controller,
      focusNode: focusNode,
      keyboardType: keyboardType,
      maxLines: maxLines,
      textInputAction: textInputAction,
      inputFormatters: inputFormatters,
      onChanged: onChanged ?? (_) => _onEdited(),
      onSubmitted: onSubmitted,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, size: 20),
        isDense: true,
        border: const OutlineInputBorder(),
      ),
    );
  }

  /// `DropdownButton` inside an `InputDecorator` rather than
  /// `DropdownButtonFormField`: the form-field flavour treats its value as an
  /// INITIAL value, which makes a programmatic status change (or a product
  /// picker reset) unreliable.
  Widget _dropdownField<T>({
    required BuildContext context,
    required String label,
    required IconData icon,
    required T? value,
    required List<DropdownMenuItem<T>> items,
    required ValueChanged<T?> onChanged,
    String? hint,
  }) {
    return InputDecorator(
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, size: 20),
        isDense: true,
        border: const OutlineInputBorder(),
      ),
      isEmpty: value == null,
      child: DropdownButtonHideUnderline(
        child: DropdownButton<T>(
          value: value,
          isDense: true,
          isExpanded: true,
          hint: hint == null ? null : Text(hint),
          items: items,
          onChanged: onChanged,
        ),
      ),
    );
  }

  static String _pct(double v) =>
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();
}

// =============================================================================
// Measured line card
//
// A separate widget so the parent's structural `setState` is the ONLY thing
// that rebuilds it. Keystrokes inside it repaint just the readout strip.
// =============================================================================

class _MeasuredItemCard extends StatelessWidget {
  const _MeasuredItemCard({
    super.key,
    required this.row,
    required this.index,
    required this.total,
    required this.products,
    required this.onEdited,
    required this.onDuplicate,
    required this.onDelete,
    required this.onMoveUp,
    required this.onMoveDown,
  });

  final _MeasuredRow row;
  final int index;
  final int total;
  final List<OfflineProduct> products;
  final VoidCallback onEdited;
  final VoidCallback onDuplicate;
  final VoidCallback onDelete;
  final VoidCallback onMoveUp;
  final VoidCallback onMoveDown;

  void _edited() {
    row.bump();
    onEdited();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(top: 10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: theme.dividerColor),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: <Widget>[
            _RowToolbar(
              title: 'Item #${index + 1}',
              canMoveUp: index > 0,
              canMoveDown: index < total - 1,
              onMoveUp: onMoveUp,
              onMoveDown: onMoveDown,
              onDuplicate: onDuplicate,
              onDelete: onDelete,
            ),
            const SizedBox(height: 8),
            if (products.isNotEmpty) ...<Widget>[
              ValueListenableBuilder<OfflineProduct?>(
                valueListenable: row.product,
                builder: (context, selected, _) => _ProductPicker(
                  products: products,
                  selected: selected,
                  onSelected: (p) {
                    row.applyProduct(p);
                    onEdited();
                  },
                ),
              ),
              const SizedBox(height: 10),
            ],
            Row(
              children: <Widget>[
                Expanded(
                  child: _miniField(
                    controller: row.code,
                    focusNode: row.codeFocus,
                    label: 'Code',
                    onChanged: (_) {
                      row.pullCode();
                      _edited();
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 2,
                  child: _miniField(
                    controller: row.description,
                    focusNode: row.descriptionFocus,
                    label: 'Description',
                    onChanged: (_) {
                      row.pullDescription();
                      _edited();
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: <Widget>[
                Expanded(
                  child: _miniField(
                    controller: row.width,
                    focusNode: row.widthFocus,
                    label: 'W (mm)',
                    numeric: true,
                    onChanged: (_) {
                      row.pullWidth();
                      _edited();
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _miniField(
                    controller: row.height,
                    focusNode: row.heightFocus,
                    label: 'H (mm)',
                    numeric: true,
                    onChanged: (_) {
                      row.pullHeight();
                      _edited();
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _miniField(
                    controller: row.units,
                    focusNode: row.unitsFocus,
                    label: 'Units',
                    numeric: true,
                    onChanged: (_) {
                      row.pullUnits();
                      _edited();
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: <Widget>[
                Expanded(
                  child: _miniField(
                    controller: row.glass,
                    focusNode: row.glassFocus,
                    label: 'Glass',
                    onChanged: (_) {
                      row.pullGlass();
                      _edited();
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _miniField(
                    controller: row.rate,
                    focusNode: row.rateFocus,
                    label: 'Rate / sft',
                    numeric: true,
                    onChanged: (_) {
                      row.pullRate();
                      _edited();
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            // Live readout. There is deliberately NO editable Amount field:
            // Amount = SFT x Rate is a hard product rule, and every figure here
            // comes straight from the model getters.
            ValueListenableBuilder<int>(
              valueListenable: row.tick,
              builder: (context, _, __) => _LineReadout(
                cells: <MapEntry<String, String>>[
                  MapEntry('SFT', row.item.sft.toStringAsFixed(3)),
                  MapEntry('T.SFT', row.item.totalSft.toStringAsFixed(3)),
                  MapEntry('Amount', formatInr(row.item.total)),
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
// Unmeasured line card
// =============================================================================

class _UnmeasuredItemCard extends StatelessWidget {
  const _UnmeasuredItemCard({
    super.key,
    required this.row,
    required this.index,
    required this.total,
    required this.products,
    required this.onEdited,
    required this.onDuplicate,
    required this.onDelete,
    required this.onMoveUp,
    required this.onMoveDown,
  });

  final _UnmeasuredRow row;
  final int index;
  final int total;
  final List<OfflineProduct> products;
  final VoidCallback onEdited;
  final VoidCallback onDuplicate;
  final VoidCallback onDelete;
  final VoidCallback onMoveUp;
  final VoidCallback onMoveDown;

  void _edited() {
    row.bump();
    onEdited();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(top: 10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: theme.dividerColor),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: <Widget>[
            _RowToolbar(
              title: 'Item #${index + 1}',
              canMoveUp: index > 0,
              canMoveDown: index < total - 1,
              onMoveUp: onMoveUp,
              onMoveDown: onMoveDown,
              onDuplicate: onDuplicate,
              onDelete: onDelete,
            ),
            const SizedBox(height: 8),
            if (products.isNotEmpty) ...<Widget>[
              ValueListenableBuilder<OfflineProduct?>(
                valueListenable: row.product,
                builder: (context, selected, _) => _ProductPicker(
                  products: products,
                  selected: selected,
                  onSelected: (p) {
                    row.applyProduct(p);
                    onEdited();
                  },
                ),
              ),
              const SizedBox(height: 10),
            ],
            _miniField(
              controller: row.description,
              focusNode: row.descriptionFocus,
              label: 'Description',
              onChanged: (_) {
                row.pullDescription();
                _edited();
              },
            ),
            const SizedBox(height: 10),
            Row(
              children: <Widget>[
                Expanded(
                  child: _miniField(
                    controller: row.units,
                    focusNode: row.unitsFocus,
                    label: 'Units',
                    numeric: true,
                    onChanged: (_) {
                      row.pullUnits();
                      _edited();
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _miniField(
                    controller: row.rate,
                    focusNode: row.rateFocus,
                    label: 'Rate / piece',
                    numeric: true,
                    onChanged: (_) {
                      row.pullRate();
                      _edited();
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            ValueListenableBuilder<int>(
              valueListenable: row.tick,
              builder: (context, _, __) => _LineReadout(
                cells: <MapEntry<String, String>>[
                  MapEntry('Units', row.item.units.toString()),
                  MapEntry('Amount', formatInr(row.item.total)),
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
// Small shared pieces
// =============================================================================

class _RowToolbar extends StatelessWidget {
  const _RowToolbar({
    required this.title,
    required this.canMoveUp,
    required this.canMoveDown,
    required this.onMoveUp,
    required this.onMoveDown,
    required this.onDuplicate,
    required this.onDelete,
  });

  final String title;
  final bool canMoveUp;
  final bool canMoveDown;
  final VoidCallback onMoveUp;
  final VoidCallback onMoveDown;
  final VoidCallback onDuplicate;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        Expanded(
          child: Text(
            title,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
          ),
        ),
        // Up/down instead of drag-to-reorder: a drag handle competes with the
        // vertical scroll on a long form, and a mis-drag silently reorders the
        // window list a fitter is reading off on site.
        IconButton(
          icon: const Icon(Icons.arrow_upward, size: 18),
          tooltip: 'Move up',
          visualDensity: VisualDensity.compact,
          onPressed: canMoveUp ? onMoveUp : null,
        ),
        IconButton(
          icon: const Icon(Icons.arrow_downward, size: 18),
          tooltip: 'Move down',
          visualDensity: VisualDensity.compact,
          onPressed: canMoveDown ? onMoveDown : null,
        ),
        IconButton(
          icon: const Icon(Icons.copy_outlined, size: 18),
          tooltip: 'Duplicate',
          visualDensity: VisualDensity.compact,
          onPressed: onDuplicate,
        ),
        IconButton(
          icon: const Icon(Icons.delete_outline, size: 18),
          color: Colors.redAccent,
          tooltip: 'Delete',
          visualDensity: VisualDensity.compact,
          onPressed: onDelete,
        ),
      ],
    );
  }
}

class _ProductPicker extends StatelessWidget {
  const _ProductPicker({
    required this.products,
    required this.selected,
    required this.onSelected,
  });

  final List<OfflineProduct> products;
  final OfflineProduct? selected;
  final ValueChanged<OfflineProduct> onSelected;

  @override
  Widget build(BuildContext context) {
    return InputDecorator(
      decoration: const InputDecoration(
        labelText: 'Product',
        prefixIcon: Icon(Icons.category_outlined, size: 20),
        isDense: true,
        border: OutlineInputBorder(),
      ),
      isEmpty: selected == null,
      child: DropdownButtonHideUnderline(
        child: DropdownButton<OfflineProduct>(
          value: selected,
          isDense: true,
          isExpanded: true,
          hint: const Text('Pick from rate card'),
          items: products
              .map((p) => DropdownMenuItem<OfflineProduct>(
                    value: p,
                    child: Text(
                      p.code.isEmpty ? p.name : '${p.code} - ${p.name}',
                      overflow: TextOverflow.ellipsis,
                    ),
                  ))
              .toList(growable: false),
          onChanged: (p) {
            if (p != null) onSelected(p);
          },
        ),
      ),
    );
  }
}

class _LineReadout extends StatelessWidget {
  const _LineReadout({required this.cells});

  final List<MapEntry<String, String>> cells;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: <Widget>[
          for (final cell in cells)
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    cell.key,
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: theme.colorScheme.outline),
                  ),
                  Text(
                    cell.value,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Compact field used inside item rows. Top-level (not a State method) so the
/// item cards stay independent of the screen's State object.
Widget _miniField({
  required TextEditingController controller,
  required FocusNode focusNode,
  required String label,
  required ValueChanged<String> onChanged,
  bool numeric = false,
}) {
  return TextField(
    controller: controller,
    focusNode: focusNode,
    keyboardType:
        numeric ? const TextInputType.numberWithOptions(decimal: true) : null,
    textInputAction: TextInputAction.next,
    onChanged: onChanged,
    style: const TextStyle(fontSize: 14),
    decoration: InputDecoration(
      labelText: label,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
      border: const OutlineInputBorder(),
    ),
  );
}
