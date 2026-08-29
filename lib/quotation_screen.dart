import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';
import 'models.dart';
import 'models_extra.dart';
import 'app_state.dart';
import 'pdf_generator.dart' deferred as pdf_gen;
import 'vaishnavi_pdf_generator.dart';
import 'supabase_config.dart';
import 'crafted_widget.dart';
import 'theme.dart';
import 'pdf_confirmation_screen.dart';
import 'quote_share.dart';
import 'umami_tracker.dart';
import 'quotation_export.dart' deferred as export_lib;
import 'services/catalog_service.dart';
import 'services/connectivity_service.dart';
import 'services/quotation_recovery_service.dart';
import 'widgets/site_photo_picker.dart';

class QuotationScreen extends StatefulWidget {
  final QuotationData? existingData;

  const QuotationScreen({super.key, this.existingData});

  @override
  _QuotationScreenState createState() => _QuotationScreenState();
}

class _QuotationScreenState extends State<QuotationScreen>
    with WidgetsBindingObserver {
  late QuotationData data;
  bool _isLoading = false;
  bool _isSaving = false;
  bool _saveQueued = false;
  bool _isExporting = false;
  bool _isOffline = false;
  bool _isCloudPending = false;
  bool _isProcessingPdf = false;
  bool _isSendingEmail = false;
  Timer? _debounce;
  Timer? _retryTimer;
  List<QuotationData> _pastQuotations = [];
  bool _usePresets = false;
  List<Map<String, dynamic>> _rateCardItems = [];
  DateTime? _lastSaved;
  String? _lastSaveError;
  bool _hasUnsyncedChanges = false;

  // Product Catalog
  List<Product> _measuredProducts = [];
  List<Product> _unmeasuredProducts = [];
  bool _isLoadingCatalog = false;

  // Customer Picker
  List<Map<String, dynamic>> _customers = [];
  bool _isLoadingCustomers = false;

  // Site Photos (state kept for parent-level reference in PDF generation)
  List<QuotationPhoto> _photos = [];

  final _nameFocus = FocusNode();
  final _referenceFocus = FocusNode();
  final _addressFocus = FocusNode();
  final _contactFocus = FocusNode();
  final _emailFocus = FocusNode();
  final _advancePaidFocus = FocusNode();
  final _transportFocus = FocusNode();
  final _gstFocus = FocusNode();

  final Map<String, FocusNode> _itemFocusNodes = {};

  FocusNode _node(String key) {
    return _itemFocusNodes.putIfAbsent(key, () => FocusNode());
  }

  void _nextField(String currentKey) {
    if (currentKey.startsWith('m_')) {
      final parts = currentKey.split('_');
      final idx = int.parse(parts[1]);
      final field = int.parse(parts[2]);
      if (field < 6) {
        _node('m_${idx}_${field + 1}').requestFocus();
      } else if (idx < data.measuredItems.length - 1) {
        _node('m_${idx + 1}_0').requestFocus();
      } else if (data.unmeasuredItems.isNotEmpty) {
        _node('u_0_0').requestFocus();
      } else {
        if (_isKprupvc) {
          _advancePaidFocus.requestFocus();
        } else {
          _transportFocus.requestFocus();
        }
      }
      return;
    }
    if (currentKey.startsWith('u_')) {
      final parts = currentKey.split('_');
      final idx = int.parse(parts[1]);
      final field = int.parse(parts[2]);
      if (field < 2) {
        _node('u_${idx}_${field + 1}').requestFocus();
      } else if (idx < data.unmeasuredItems.length - 1) {
        _node('u_${idx + 1}_0').requestFocus();
      } else {
        if (_isKprupvc) {
          _advancePaidFocus.requestFocus();
        } else {
          _transportFocus.requestFocus();
        }
      }
      return;
    }
  }

  bool get _isKprupvc =>
      Provider.of<AppState>(
        context,
        listen: false,
      ).clientConfig.clientId.toLowerCase() ==
      'kprupvc';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _usePresets =
        Provider.of<AppState>(
          context,
          listen: false,
        ).clientConfig.enablePricePresets;
    if (widget.existingData != null) {
      data = widget.existingData!;
      _lastSaved = widget.existingData!.createdAt;
      _loadItems();
    } else {
      data = QuotationData();
      unawaited(_restoreLocalDraftOrInit());
    }
    _fetchPastQuotations();
    _loadCatalog();
    _loadCustomers();
    _loadRateCard();
    unawaited(_prefetchGenerationLibs());
  }

  Future<void> _loadRateCard() async {
    final enabled =
        Provider.of<AppState>(
          context,
          listen: false,
        ).clientConfig.enableRateCard;
    if (!enabled) return;
    try {
      final clientId =
          Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final response = await SupabaseConfig.client
          .from('rate_card_items')
          .select()
          .eq('client_id', clientId)
          .eq('is_active', true);
      if (mounted) {
        setState(() {
          _rateCardItems =
              (response as List)
                  .map((e) => Map<String, dynamic>.from(e as Map))
                  .toList();
        });
      }
    } catch (e) {
      debugPrint('Failed to load rate card: $e');
    }
  }

  double? _matchRateCardRate(String code, double width, double height) {
    if (_rateCardItems.isEmpty || code.trim().isEmpty) return null;
    final now = DateTime.now();
    final normalized = code.trim().toLowerCase().replaceAll(
      RegExp(r'[\s\-]+'),
      '_',
    );
    Map<String, dynamic>? best;
    int bestScore = -1;
    String? bestStart;
    for (final row in _rateCardItems) {
      final rowType = (row['item_type'] ?? '').toString().trim().toLowerCase();
      if (rowType.isEmpty) continue;
      final exactType = rowType == normalized;
      if (!exactType && rowType != 'any') continue;
      final startRaw = row['validity_start']?.toString();
      final endRaw = row['validity_end']?.toString();
      final start =
          startRaw == null || startRaw.isEmpty
              ? null
              : DateTime.tryParse(startRaw);
      final end =
          endRaw == null || endRaw.isEmpty ? null : DateTime.tryParse(endRaw);
      if (start != null && now.isBefore(start)) continue;
      if (end != null && now.isAfter(end)) continue;
      bool dimsOk = true;
      final minW = num.tryParse('${row['min_width_mm']}');
      final maxW = num.tryParse('${row['max_width_mm']}');
      final minH = num.tryParse('${row['min_height_mm']}');
      final maxH = num.tryParse('${row['max_height_mm']}');
      if ((minW != null && width < minW) ||
          (maxW != null && width > maxW) ||
          (minH != null && height < minH) ||
          (maxH != null && height > maxH)) {
        if (minW != null || maxW != null || minH != null || maxH != null)
          dimsOk = false;
      }
      final price = double.tryParse('${row['price_per_sqft']}');
      if (price == null || price <= 0) continue;
      final score = (exactType ? 2 : 0) + (dimsOk ? 1 : 0);
      if (score > bestScore ||
          (score == bestScore &&
              best != null &&
              (bestStart == null ||
                  (startRaw != null && startRaw.compareTo(bestStart) > 0)))) {
        best = row;
        bestScore = score;
        bestStart = startRaw;
      }
    }
    return best == null ? null : double.tryParse('${best['price_per_sqft']}');
  }

  void _applyRateCardRate(dynamic item) {
    if (_rateCardItems.isEmpty) return;
    if (item.rate != 0) return;
    final matched = _matchRateCardRate(
      item.code as String,
      (item.width as num?)?.toDouble() ?? 0,
      (item.height as num?)?.toDouble() ?? 0,
    );
    if (matched == null) return;
    setState(() => item.rate = matched);
    _onDataChanged();
  }

  Future<void> _prefetchGenerationLibs() async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
    try {
      await Future.wait([pdf_gen.loadLibrary(), export_lib.loadLibrary()]);
    } catch (_) {
      return;
    }
  }

  Future<void> _fetchPastQuotations() async {
    try {
      final clientId =
          Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final response = await SupabaseConfig.client
          .from('quotations')
          .select()
          .eq('client_id', clientId);
      if (mounted) {
        setState(() {
          _pastQuotations =
              (response as List).map((e) => QuotationData.fromMap(e)).toList();
        });
      }
    } catch (e) {
      debugPrint('Failed to load past quotes: $e');
    }
  }

  Future<void> _loadCatalog({bool forceRefresh = false}) async {
    setState(() => _isLoadingCatalog = true);
    try {
      final clientId =
          Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final catalogService = CatalogService.instance;

      if (forceRefresh) {
        catalogService.invalidate(clientId);
      }

      final measured = await catalogService.fetchMeasuredProducts(clientId);
      final unmeasured = await catalogService.fetchUnmeasuredProducts(clientId);

      if (mounted) {
        setState(() {
          _measuredProducts = measured;
          _unmeasuredProducts = unmeasured;
          _isLoadingCatalog = false;
        });
      }
    } catch (e) {
      debugPrint('Failed to load catalog: $e');
      if (mounted) {
        setState(() {
          _isLoadingCatalog = false;
          _measuredProducts = [];
          _unmeasuredProducts = [];
        });
        // Silent fallback on network issues so user is not alarmed
      }
    }
  }

  // ===== CUSTOMER PICKER =====

  Future<void> _loadCustomers() async {
    setState(() => _isLoadingCustomers = true);
    try {
      final clientId =
          Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final response = await SupabaseConfig.client
          .from('quotations')
          .select('customer_name, contact_no, email, address')
          .eq('client_id', clientId)
          .order('created_at', ascending: false);

      // Deduplicate by customer_name
      final unique = <String, Map<String, dynamic>>{};
      for (final row in (response as List)) {
        final name = (row['customer_name'] ?? '') as String;
        if (name.isNotEmpty && !unique.containsKey(name)) {
          unique[name] = row as Map<String, dynamic>;
        }
      }
      if (mounted) {
        setState(() {
          _customers = unique.values.toList();
          _isLoadingCustomers = false;
        });
      }
    } catch (e) {
      debugPrint('Failed to load customers: $e');
      if (mounted) setState(() => _isLoadingCustomers = false);
    }
  }

  // ===== SITE PHOTOS (delegated to SitePhotoPicker widget) =====

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _debounce?.cancel();
    _retryTimer?.cancel();
    _nameFocus.dispose();
    _referenceFocus.dispose();
    _addressFocus.dispose();
    _contactFocus.dispose();
    _emailFocus.dispose();
    _advancePaidFocus.dispose();
    _transportFocus.dispose();
    _gstFocus.dispose();
    for (final n in _itemFocusNodes.values) {
      n.dispose();
    }
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      // A phone call or app switch must never discard the latest keystroke.
      // Start the normal save path immediately: it checkpoints locally before
      // attempting the network and therefore also creates a durable outbox
      // envelope when the call interrupts connectivity.
      unawaited(_autoSaveToDatabase());
    }
  }

  bool _isNetworkError(Object error) {
    final str = error.toString().toLowerCase();
    return str.contains('failed to fetch') ||
        str.contains('clientexception') ||
        str.contains('socketexception') ||
        str.contains('timeoutexception') ||
        str.contains('network') ||
        str.contains('connection') ||
        str.contains('handshake') ||
        str.contains('xmlhttprequest');
  }

  String _calmError(Object error, String action) {
    final message = error.toString().toLowerCase();
    if (_isNetworkError(error)) {
      return 'You appear to be offline. Your draft is safe on this device.';
    }
    if (message.contains('401') ||
        message.contains('403') ||
        message.contains('unauthorized') ||
        message.contains('forbidden')) {
      return 'Your session may have expired. Please sign in again, then retry $action.';
    }
    if (RegExp(r'\b5\d{2}\b').hasMatch(message) || message.contains('server')) {
      return 'The service is having trouble right now. Please try $action again in a moment.';
    }
    return 'Could not $action. Please try again.';
  }

  Future<void> _restoreLocalDraftOrInit() async {
    final clientId =
        Provider.of<AppState>(context, listen: false).clientConfig.clientId;
    try {
      final prefs = await SharedPreferences.getInstance();
      final key = prefs.getString('last_active_draft_$clientId');
      final raw = key == null ? null : prefs.getString(key);
      if (raw != null) {
        final stored = jsonDecode(raw);
        final quotation = stored is Map ? stored['quotation'] : null;
        if (quotation is Map && quotation['id'] != null) {
          final restored = QuotationData.fromMap(
            Map<String, dynamic>.from(quotation),
          );
          final measured = stored['measured_items'];
          final unmeasured = stored['unmeasured_items'];
          if (measured is List) {
            restored.measuredItems =
                measured
                    .map(
                      (e) => MeasuredItem.fromMap(
                        Map<String, dynamic>.from(e as Map),
                      ),
                    )
                    .toList();
          }
          if (unmeasured is List) {
            restored.unmeasuredItems =
                unmeasured
                    .map(
                      (e) => UnmeasuredItem.fromMap(
                        Map<String, dynamic>.from(e as Map),
                      ),
                    )
                    .toList();
          }
          if (!mounted) return;
          setState(() {
            data = restored;
            _lastSaved = restored.createdAt;
            _hasUnsyncedChanges =
                stored['needs_sync'] == true || restored.syncVersion == 0;
          });
          WidgetsBinding.instance.addPostFrameCallback((_) async {
            if (!mounted) return;
            final continueDraft = await showDialog<bool>(
              context: context,
              barrierDismissible: false,
              builder:
                  (dialogContext) => AlertDialog(
                    title: const Text('Continue your last quotation?'),
                    content: const Text(
                      'We found an unfinished quotation saved on this device.',
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(dialogContext, false),
                        child: const Text('Start new'),
                      ),
                      ElevatedButton(
                        onPressed: () => Navigator.pop(dialogContext, true),
                        child: const Text('Continue'),
                      ),
                    ],
                  ),
            );
            if (continueDraft == false && mounted) {
              setState(() => data = QuotationData());
              await _initQuoteNumber();
            }
          });
          return;
        }
      }
    } catch (e) {
      debugPrint('Failed to restore local draft: $e');
    }
    await _initQuoteNumber();
  }

  Future<void> _persistLocalDraft() async {
    try {
      final clientId =
          Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final prefs = await SharedPreferences.getInstance();
      final draftKey =
          'quotation_local_draft_${clientId}_${data.id ?? 'active'}';
      final draftData = {
        'quotation': data.toMap(clientId: clientId, includeStatus: true),
        'measured_items':
            data.measuredItems
                .map((e) => e.toMap(data.id ?? '', clientId: clientId))
                .toList(),
        'unmeasured_items':
            data.unmeasuredItems
                .map((e) => e.toMap(data.id ?? '', clientId: clientId))
                .toList(),
        'updated_at': DateTime.now().toIso8601String(),
        'needs_sync':
            _hasUnsyncedChanges || _isCloudPending || data.syncVersion == 0,
      };
      await prefs.setString(draftKey, jsonEncode(draftData));
      await prefs.setString('last_active_draft_$clientId', draftKey);
    } catch (e) {
      debugPrint('Failed to persist local draft: $e');
    }
  }

  void _onDataChanged() {
    _hasUnsyncedChanges = true;
    _persistLocalDraft();
    if (_debounce?.isActive ?? false) _debounce!.cancel();
    _debounce = Timer(const Duration(seconds: 2), () {
      _autoSaveToDatabase();
    });
  }

  Future<void> _loadItems() async {
    setState(() => _isLoading = true);
    try {
      if (data.id != null) {
        final qRes = await SupabaseConfig.client
            .from('quotations')
            .select('sync_version')
            .eq('id', data.id!)
            .eq('client_id', clientId)
            .maybeSingle();
        if (qRes != null && qRes['sync_version'] != null) {
          data.syncVersion = (qRes['sync_version'] as num).toInt();
        }

        final measuredRes = await SupabaseConfig.client
            .from('measured_items')
            .select()
            .eq('quotation_id', data.id!)
            .eq('client_id', clientId);
        final unmeasuredRes = await SupabaseConfig.client
            .from('unmeasured_items')
            .select()
            .eq('quotation_id', data.id!)
            .eq('client_id', clientId);

        setState(() {
          data.measuredItems =
              (measuredRes as List)
                  .map((e) => MeasuredItem.fromMap(e))
                  .toList();
          data.unmeasuredItems =
              (unmeasuredRes as List)
                  .map((e) => UnmeasuredItem.fromMap(e))
                  .toList();
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() => _isLoading = false);
      if (!_isNetworkError(e)) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed to load items: $e')));
      }
    }
  }

  Future<void> _initQuoteNumber() async {
    final prefix = Provider.of<AppState>(context, listen: false).quotePrefix;
    final clientId =
        Provider.of<AppState>(context, listen: false).clientConfig.clientId;
    // SAFE REUSE: prevent 32 empty drafts from piling up (prod has 32 empties 28-08).
    // Before burning a new quote_no via RPC (which increments quotation_counters),
    // try to reuse the most recent empty draft for this client:
    // deleted=false, status=draft, no measured/unmeasured items. This keeps at most
    // one empty draft per client and avoids the "delete empties → creation error"
    // trap (local draft cache + burned counter).
    try {
      final emptyCandidates = await SupabaseConfig.client
          .from('quotations')
          .select('id,quote_no,sync_version,created_at')
          .eq('client_id', clientId)
          .eq('deleted', false)
          .eq('status', 'draft')
          .order('created_at', ascending: false)
          .limit(5);
      for (final row in (emptyCandidates as List)) {
        final qid = row['id'] as String?;
        final qno = (row['quote_no'] as String?) ?? '';
        if (qid == null || qid.isEmpty || qno.isEmpty) continue;
        // Cheap emptiness check — if either table has a row, this draft is not empty
        final mCount = await SupabaseConfig.client
            .from('measured_items')
            .select('id')
            .eq('quotation_id', qid)
            .eq('client_id', clientId)
            .limit(1);
        if ((mCount as List).isNotEmpty) continue;
        final uCount = await SupabaseConfig.client
            .from('unmeasured_items')
            .select('id')
            .eq('quotation_id', qid)
            .eq('client_id', clientId)
            .limit(1);
        if ((uCount as List).isNotEmpty) continue;
        // Reuse this empty draft — don't burn a new number
        data.id = qid;
        data.syncVersion = (row['sync_version'] as num?)?.toInt() ?? 1;
        if (mounted) setState(() => data.quotationNo = qno);
        await _loadItems(); // will load empty lists
        // Ensure local draft points at the reused id
        await _persistLocalDraft();
        return;
      }
    } catch (_) {
      // Offline or RLS error — fall through to generating new draft
    }
    data.id ??= const Uuid().v4();
    if (data.quotationNo.isEmpty) {
      String nextNo = await QuotationData.generateNextQuoteNumber(
        prefix: prefix,
        clientId: clientId,
      );
      if (mounted) {
        setState(() => data.quotationNo = nextNo);
      }
    }
    _autoSaveToDatabase();
  }

  Future<void> _autoSaveToDatabase() async {
    if (_isSaving) {
      _saveQueued = true;
      return;
    }
    setState(() => _isSaving = true);
    data.id ??= const Uuid().v4();
    final clientId =
        Provider.of<AppState>(context, listen: false).clientConfig.clientId;
    // Always persist to local cache first so device never loses progress
    await _persistLocalDraft();

    try {
      final quotationMap = data.toMap(clientId: clientId, includeStatus: true);
      // Stable child IDs make the atomic server operation idempotent.
      for (final item in data.measuredItems) {
        item.id ??= const Uuid().v4();
      }
      for (final item in data.unmeasuredItems) {
        item.id ??= const Uuid().v4();
      }
      final result = await QuotationRecoveryService.instance.saveBundle(
        clientId: clientId,
        quotation: quotationMap,
        measuredItems:
            data.measuredItems
                .map((item) => item.toMap(data.id!, clientId: clientId))
                .toList(),
        unmeasuredItems:
            data.unmeasuredItems
                .map((item) => item.toMap(data.id!, clientId: clientId))
                .toList(),
      );

      if (result.state == RecoverySaveState.saved &&
          result.serverVersion != null) {
        data.syncVersion = result.serverVersion!;
        _hasUnsyncedChanges = false;
      }
      if (mounted) {
        setState(() {
          if (result.state == RecoverySaveState.saved) {
            _lastSaved = DateTime.now();
            _lastSaveError = null;
            _isOffline = false;
            _isCloudPending = false;
          } else if (result.state == RecoverySaveState.conflict) {
            if (result.serverVersion != null) {
              data.syncVersion = result.serverVersion!;
            }
            _lastSaveError = result.message;
            _isOffline = false;
            _isCloudPending = false;
          } else {
            _lastSaveError = null;
            _isOffline = !ConnectivityService.instance.isOnline;
            _isCloudPending = true;
          }
        });
      }
      if (result.state == RecoverySaveState.saved) {
        _retryTimer?.cancel();
        // Persist the acknowledged revision. Recovery Center can now
        // distinguish this safe local copy from a draft that still needs sync.
        await _persistLocalDraft();
      }
    } catch (e) {
      debugPrint('Auto-save error: $e');
      if (mounted) {
        if (_isNetworkError(e)) {
          setState(() {
            _isOffline = true;
            _isCloudPending = true;
            _lastSaveError = null;
          });
          // Silent auto-retry in 10 seconds without showing scary red toasts
          _retryTimer?.cancel();
          _retryTimer = Timer(const Duration(seconds: 10), () {
            if (mounted) {
              _autoSaveToDatabase();
            }
          });
        } else {
          setState(() => _lastSaveError = _calmError(e, 'sync this draft'));
        }
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
      if (_saveQueued && mounted) {
        _saveQueued = false;
        unawaited(_autoSaveToDatabase());
      }
    }
  }

  bool _hasLineItems() {
    final measured = data.measuredItems.any(
      (item) =>
          item.code.trim().isNotEmpty ||
          item.description.trim().isNotEmpty ||
          item.glass.trim().isNotEmpty ||
          item.width > 0 ||
          item.height > 0 ||
          item.rate > 0,
    );
    final unmeasured = data.unmeasuredItems.any(
      (item) => item.description.trim().isNotEmpty || item.rate > 0,
    );
    return measured || unmeasured;
  }

  Future<void> _sendEmail(String targetEmail) async {
    try {
      final appState = Provider.of<AppState>(context, listen: false);
      final passwordHash = await QuoteShare.passwordHash(appState.clientConfig);
      await pdf_gen.loadLibrary();
      final effectivePhotos =
          appState.enableSitePhotos ? _photos : const <QuotationPhoto>[];
      final pdfBytes = await _generateClientPdfBytes(appState, effectivePhotos);
      final reviewUrl = QuoteShare.reviewUrl(
        data,
        config: appState.clientConfig,
      );
      final quoteLink = await _quoteLink(data);
      if (quoteLink == null)
        debugPrint(
          'QuotationScreen: _sendEmail no quote link for ${data.quotationNo} — email will have only review CTA',
        );

      // Only render the "Review & Confirm" CTA when we hold a working token.
      final reviewCta =
          quoteLink == null
              ? ''
              : '''
        <p style="margin: 24px 0 8px 0; color: #3D1F08; font-size: 14px;">Please review and confirm your quotation:</p>
        <p style="margin: 0;"><a href="$quoteLink" style="display: inline-block; background-color: #C44A10; color: #ffffff; padding: 14px 34px; border-radius: 999px; text-decoration: none; font-size: 15px; font-weight: 700;">Review & Confirm Quotation</a></p>''';

      final htmlBody = '''
      <div style="font-family: 'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; max-width: 600px; margin: auto; background-color: #FFFBF6; padding: 0; border: 1px solid #EADFD3; border-radius: 16px; overflow: hidden;">
        <!-- Header Band -->
        <div style="background-color: #1A0A00; padding: 26px 36px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            <tr>
              <td style="vertical-align: middle; width: 42px;">
                <img src="https://app.vitharn.com/logo.png" alt="Vitharn" width="42" height="42" style="display: block; border-radius: 10px; width: 42px; height: 42px;" />
              </td>
              <td style="vertical-align: middle; padding-left: 14px;">
                <div style="color: #FFFFFF; font-size: 17px; font-weight: 800; line-height: 1.2; letter-spacing: -0.2px;">Vitharn <span style="color: #E06A1E;">ERP</span> Services</div>
                <div style="color: #9A8B7E; font-size: 11.5px; line-height: 1.4; margin-top: 2px;">Quotation & ERP software for UPVC fabricators</div>
              </td>
            </tr>
          </table>
        </div>
        <!-- Body -->
        <div style="padding: 34px 36px; color: #3D1F08;">
          <p style="margin: 0 0 16px 0; font-size: 15.5px; line-height: 1.6;">Dear <b>${data.customerName}</b>,</p>
          <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #3D1F08;">Please find attached the quotation <b>${data.quotationNo}</b> for your requested UPVC windows and doors.</p>
          <!-- Details Card -->
          <div style="background-color: #FFFBF6; border: 1px solid #E2D3C4; border-radius: 12px; padding: 20px 24px; margin: 0 0 28px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #7A5030; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Quote No</td>
                <td style="padding: 8px 0; color: #1A0A00; font-size: 13.5px; font-weight: 700; text-align: right;">${data.quotationNo}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #7A5030; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Date</td>
                <td style="padding: 8px 0; color: #1A0A00; font-size: 13.5px; font-weight: 700; text-align: right;">${DateFormat('dd-MMM-yyyy').format(data.date)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #7A5030; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Total Amount</td>
                <td style="padding: 8px 0; color: #1A0A00; font-size: 13.5px; font-weight: 700; text-align: right;">Rs. ${data.grandTotal.toStringAsFixed(2)}</td>
              </tr>
              ${_isKprupvc ? '<tr><td style="padding: 8px 0; color: #2E7D32; font-size: 11.5px; font-weight: 700;">Advance Paid</td><td style="padding: 8px 0; color: #2E7D32; font-size: 13.5px; font-weight: 700; text-align: right;">Rs. ${data.advancePaid.toStringAsFixed(2)}</td></tr><tr><td style="padding: 8px 0; color: #C44A10; font-size: 11.5px; font-weight: 700;">Remaining Amount</td><td style="padding: 8px 0; color: #C44A10; font-size: 13.5px; font-weight: 800; text-align: right;">Rs. ${data.balanceDue.toStringAsFixed(2)}</td></tr>' : ''}
            </table>
          </div>
$reviewCta
          <p style="margin: 24px 0 8px 0; color: #3D1F08; font-size: 14px;">We'd love your feedback! Please rate your experience with us here:</p>
          <p style="margin: 0 0 28px 0;"><a href="$reviewUrl" style="display: inline-block; background-color: #C44A10; color: #ffffff; padding: 14px 34px; border-radius: 999px; text-decoration: none; font-size: 15px; font-weight: 700;">Rate Your Experience</a></p>
          <p style="margin: 0; color: #7A5030; font-size: 14px; line-height: 1.6;">If you have any questions, please feel free to reach out.</p>
        </div>
        <!-- Footer -->
        <div style="background-color: #FFF3E6; border-top: 1px solid #EADFD3; padding: 20px 36px; text-align: center;">
          <p style="margin: 0 0 6px 0; color: #3D1F08; font-size: 13px; line-height: 1.5;">
            Vitharn ERP Services |
            <a href="mailto:vitarn.dev@gmail.com" style="color: #C44A10; text-decoration: none;">vitarn.dev@gmail.com</a> |
            <a href="https://app.vitharn.com" style="color: #C44A10; text-decoration: none;">app.vitharn.com</a>
          </p>
          <p style="margin: 0; color: #9A8B7E; font-size: 11px; line-height: 1.4;">Sent by your Vitharn UPVC Quotation Maker</p>
        </div>
      </div>
      ''';

      final attachments = <Map<String, dynamic>>[];
      if (pdfBytes.isNotEmpty) {
        attachments.add({
          'filename': '${data.quotationNo}.pdf',
          'content': base64Encode(pdfBytes),
        });
      }

      final url = '${QuoteShare.origin()}/api/send_email';
      final res = await http.post(
        Uri.parse(url),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'client_id': appState.clientConfig.clientId,
          'admin_password_hash': passwordHash,
          'to': targetEmail.trim(),
          'subject':
              'Quotation ${data.quotationNo} from ${appState.companyName}',
          'html': htmlBody,
          if (attachments.isNotEmpty) 'attachments': attachments,
        }),
      );
      if (res.statusCode != 200) {
        String errorMsg = 'HTTP ${res.statusCode}';
        try {
          final decoded = jsonDecode(res.body);
          if (decoded is Map && decoded['error'] != null) {
            errorMsg = decoded['error'].toString();
          }
        } catch (_) {}
        throw Exception(errorMsg);
      }
      await _markAsSent();
    } catch (e) {
      throw Exception('Failed to send email: $e');
    }
  }

  Future<void> _markAsSent() async {
    if (data.status != QuotationStatus.sent && data.id != null) {
      setState(() => data.status = QuotationStatus.sent);
      try {
        final clientId =
            Provider.of<AppState>(context, listen: false).clientConfig.clientId;
        await SupabaseConfig.client
            .from('quotations')
            .update({'status': QuotationStatus.sent.value})
            .eq('id', data.id!)
            .eq('client_id', clientId);
      } catch (_) {}
    }
  }

  /// Customer-facing quote link, or `null` when no valid token could be minted.
  ///
  /// This used to be a private `_fetchQuoteToken()` that returned `''` on
  /// failure, which produced `/quote/<id>?token=` — a URL that always answers
  /// 403 for the customer. The shared helper in `quote_share.dart` now returns
  /// null instead, so the email can omit the button rather than embed a dead
  /// one. See that file for the full root-cause write-up.
  Future<String?> _quoteLink(QuotationData q) => QuoteShare.quoteLink(
    q,
    config: Provider.of<AppState>(context, listen: false).clientConfig,
  );

  Future<void> _manualEmailPrompt() async {
    final emailController = TextEditingController(text: data.email);
    showDialog(
      context: context,
      builder: (context) {
        bool isSending = false;
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('Email Quotation'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: emailController,
                    decoration: const InputDecoration(
                      labelText: 'Customer Email',
                    ),
                    keyboardType: TextInputType.emailAddress,
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Cancel'),
                ),
                ElevatedButton(
                  onPressed:
                      isSending
                          ? null
                          : () async {
                            final email = emailController.text.trim();
                            if (email.isEmpty) return;
                            setDialogState(() => isSending = true);
                            try {
                              if (_isSendingEmail) return;
                              if (mounted)
                                setState(() => _isSendingEmail = true);
                              try {
                                await _sendEmail(email);
                              } finally {
                                if (mounted)
                                  setState(() => _isSendingEmail = false);
                              }
                              if (context.mounted) {
                                Navigator.pop(context);
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text('Email sent successfully!'),
                                  ),
                                );
                              }
                            } catch (e) {
                              setDialogState(() => isSending = false);
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text(
                                      _calmError(e, 'send the email'),
                                    ),
                                  ),
                                );
                              }
                            }
                          },
                  child:
                      isSending
                          ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(),
                          )
                          : const Text('Send'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  /// Tenant-routed PDF generation. Vaishnavi's client-specific request is a
  /// pixel-faithful replica of their supplied reference: the SVG templates in
  /// `src/templates/vaishnavi/` get the quotation data baked in and are then
  /// rendered to PDF server-side (`/api/vaishnavi-estimate/render`), with an
  /// inline pw.Document fallback inside the generator itself.
  Future<Uint8List> _generateClientPdfBytes(
    AppState appState,
    List<QuotationPhoto> photos,
  ) async {
    final id = appState.clientConfig.clientId.toLowerCase().replaceAll(
      RegExp(r'[^a-z0-9]+'),
      '-',
    );
    if (id.startsWith('vaishnavi')) {
      return generateVaishnaviPdfBytes(data, appState, photos: photos);
    }
    await pdf_gen.loadLibrary();
    return pdf_gen.generatePdfBytes(data, appState, photos: photos);
  }

  Future<void> _generateAndProcessPdf() async {
    if (_isProcessingPdf) return;
    if (mounted) setState(() => _isProcessingPdf = true);
    try {
      // 1. Force Save
      umamiTrack('generate_pdf');
      await _autoSaveToDatabase();

      // Generate PDF bytes
      final appState = Provider.of<AppState>(context, listen: false);
      await pdf_gen.loadLibrary();
      final effectivePhotos =
          appState.enableSitePhotos ? _photos : const <QuotationPhoto>[];
      final pdfBytes = await _generateClientPdfBytes(appState, effectivePhotos);

      // 2. If email exists, send automatically in background
      Future<void>? emailTask;
      if (data.email.isNotEmpty && data.email.contains('@')) {
        emailTask = _sendEmail(data.email);
      }

      // 3. Navigate to Confirmation Screen
      if (!mounted) return;
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder:
              (context) => PdfConfirmationScreen(
                data: data,
                pdfBytes: pdfBytes,
                emailTask: emailTask,
              ),
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_calmError(e, 'generate the PDF'))),
        );
      }
    } finally {
      if (mounted) setState(() => _isProcessingPdf = false);
    }
  }

  Widget _buildSectionTitle(String title, {Widget? trailing}) {
    return Padding(
      padding: const EdgeInsets.only(top: 24, bottom: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            title,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.bold,
              color: Theme.of(context).primaryColor,
            ),
          ),
          if (trailing != null) trailing,
        ],
      ),
    );
  }

  Color _statusColor(QuotationStatus s) {
    switch (s) {
      case QuotationStatus.draft:
        return Colors.grey.shade400;
      case QuotationStatus.sent:
        return Colors.blue.shade400;
      case QuotationStatus.won:
        return Colors.green.shade500;
      case QuotationStatus.lost:
        return Colors.red.shade400;
    }
  }

  Widget _statusChip(String label, QuotationStatus status) {
    final isSelected = data.status == status;
    return GestureDetector(
      onTap: () async {
        if (data.status != status) {
          setState(() => data.status = status);
          await _updateStatus(data, status);
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? _statusColor(status) : Colors.transparent,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _statusColor(status), width: 1.5),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
            color: isSelected ? Colors.white : _statusColor(status),
          ),
        ),
      ),
    );
  }

  Future<void> _updateStatus(QuotationData q, QuotationStatus newStatus) async {
    try {
      final clientId =
          Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      await SupabaseConfig.client
          .from('quotations')
          .update({'status': newStatus.value})
          .eq('id', q.id!)
          .eq('client_id', clientId);
    } catch (e) {
      debugPrint('Status update error: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading)
      return const Scaffold(body: Center(child: CircularProgressIndicator()));

    final clientId =
        Provider.of<AppState>(context, listen: false).clientConfig.clientId;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.existingData == null ? 'New Quotation' : 'Edit Quotation',
        ),
        actions: [
          if (_isSaving)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 14.0),
              child: Center(
                child: SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.green,
                  ),
                ),
              ),
            )
          else if (_isOffline)
            Tooltip(
              message: 'Saved on device (Offline). Tap to retry cloud sync.',
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12.0),
                child: Center(
                  child: InkWell(
                    onTap: () => _autoSaveToDatabase(),
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.amber.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: Colors.amber.shade700,
                          width: 1,
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.cloud_off,
                            color: Colors.amber.shade800,
                            size: 16,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            'Offline',
                            style: TextStyle(
                              color: Colors.amber.shade900,
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            )
          else if (_isCloudPending)
            Tooltip(
              message: 'Saved safely on this device. Cloud backup is retrying.',
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12.0),
                child: Center(
                  child: Icon(
                    Icons.cloud_upload,
                    color: Colors.amber.shade800,
                    size: 22,
                  ),
                ),
              ),
            )
          else if (_lastSaveError != null)
            Tooltip(
              message: 'Sync issue: $_lastSaveError',
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 12.0),
                child: Center(
                  child: Icon(Icons.cloud_off, color: Colors.red, size: 22),
                ),
              ),
            )
          else
            Tooltip(
              message:
                  _lastSaved != null
                      ? 'Saved to cloud at ${DateFormat('HH:mm:ss').format(_lastSaved!)}'
                      : 'Connected to $clientId',
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 12.0),
                child: Center(
                  child: Icon(Icons.cloud_done, color: Colors.green, size: 22),
                ),
              ),
            ),
          IconButton(
            icon: const Icon(Icons.email),
            onPressed: _isSendingEmail ? null : _manualEmailPrompt,
            tooltip: 'Send to custom email',
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Quote No',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey,
                              ),
                            ),
                            Text(
                              data.quotationNo,
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                              ),
                            ),
                          ],
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            const Text(
                              'Date',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey,
                              ),
                            ),
                            Text(
                              DateFormat('dd-MMM-yyyy').format(data.date),
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        if (_isSaving) ...[
                          const SizedBox(
                            width: 13,
                            height: 13,
                            child: CircularProgressIndicator(
                              strokeWidth: 1.5,
                              color: Colors.green,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'Saving to $clientId...',
                            style: TextStyle(
                              fontSize: 11.5,
                              color: Colors.blue.shade700,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ] else if (_isOffline) ...[
                          Icon(
                            Icons.offline_pin,
                            size: 15,
                            color: Colors.amber.shade800,
                          ),
                          const SizedBox(width: 6),
                          Flexible(
                            child: Text(
                              'Saved on device (Offline) • Auto-syncing when connected',
                              style: TextStyle(
                                fontSize: 11.5,
                                color: Colors.amber.shade900,
                                fontWeight: FontWeight.w500,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ] else if (_isCloudPending) ...[
                          Icon(
                            Icons.offline_pin,
                            size: 15,
                            color: Colors.amber.shade800,
                          ),
                          const SizedBox(width: 6),
                          Flexible(
                            child: Text(
                              'Saved safely • Cloud backup retrying',
                              style: TextStyle(
                                fontSize: 11.5,
                                color: Colors.amber.shade900,
                                fontWeight: FontWeight.w500,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ] else if (_lastSaveError != null) ...[
                          const Icon(Icons.error, size: 14, color: Colors.red),
                          const SizedBox(width: 6),
                          Flexible(
                            child: Text(
                              'Sync issue: $_lastSaveError',
                              style: const TextStyle(
                                fontSize: 11,
                                color: Colors.red,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ] else ...[
                          const Icon(
                            Icons.cloud_done,
                            size: 15,
                            color: Colors.green,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'Saved to $clientId at ${DateFormat('HH:mm:ss').format(_lastSaved ?? data.createdAt)}',
                            style: TextStyle(
                              fontSize: 11.5,
                              color: Colors.green.shade700,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ).animate().fade().slideY(begin: -0.1),

            // Status selector
            if (widget.existingData != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  children: [
                    const Text(
                      'Status: ',
                      style: TextStyle(fontSize: 13, color: Colors.grey),
                    ),
                    Expanded(
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: [
                            _statusChip('Draft', QuotationStatus.draft),
                            const SizedBox(width: 6),
                            _statusChip('Sent', QuotationStatus.sent),
                            const SizedBox(width: 6),
                            _statusChip('Won', QuotationStatus.won),
                            const SizedBox(width: 6),
                            _statusChip('Lost', QuotationStatus.lost),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ).animate().fade().slideY(begin: -0.1),

            _buildSectionTitle(
              'Customer Details',
            ).animate().fade().fade(delay: 100.ms),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Autocomplete<QuotationData>(
                      initialValue: TextEditingValue(text: data.customerName),
                      displayStringForOption: (option) => option.customerName,
                      optionsBuilder: (TextEditingValue textEditingValue) {
                        if (textEditingValue.text.isEmpty)
                          return const Iterable<QuotationData>.empty();
                        final uniqueCustomers = <String, QuotationData>{};
                        for (var q in _pastQuotations) {
                          if (q.customerName.toLowerCase().contains(
                            textEditingValue.text.toLowerCase(),
                          )) {
                            uniqueCustomers.putIfAbsent(
                              q.customerName,
                              () => q,
                            );
                          }
                        }
                        return uniqueCustomers.values;
                      },
                      onSelected: (QuotationData selection) {
                        setState(() {
                          data.customerName = selection.customerName;
                          data.address = selection.address;
                          data.contactNo = selection.contactNo;
                          data.email = selection.email;
                        });
                        _onDataChanged();
                      },
                      fieldViewBuilder: (
                        context,
                        textEditingController,
                        focusNode,
                        onFieldSubmitted,
                      ) {
                        return TextFormField(
                          controller: textEditingController,
                          focusNode: focusNode,
                          textInputAction: TextInputAction.next,
                          onFieldSubmitted: (_) {
                            onFieldSubmitted();
                            _referenceFocus.requestFocus();
                          },
                          decoration: InputDecoration(
                            labelText: 'Name',
                            suffixIcon:
                                _isLoadingCustomers
                                    ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: Padding(
                                        padding: EdgeInsets.all(12),
                                        child: CircularProgressIndicator(
                                          strokeWidth: 1.5,
                                        ),
                                      ),
                                    )
                                    : null,
                          ),
                          onChanged: (val) {
                            data.customerName = val;
                            _onDataChanged();
                          },
                        );
                      },
                    ),
                    if (data.customerName.isNotEmpty && _customers.isNotEmpty)
                      Builder(
                        builder: (context) {
                          final match =
                              _customers
                                  .where(
                                    (c) =>
                                        c['customer_name'] == data.customerName,
                                  )
                                  .toList();
                          if (match.isEmpty) return const SizedBox.shrink();
                          final count =
                              _pastQuotations
                                  .where(
                                    (q) => q.customerName == data.customerName,
                                  )
                                  .length;
                          return Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Row(
                              children: [
                                Icon(
                                  Icons.history,
                                  size: 14,
                                  color: Colors.grey.shade500,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  '$count previous quotation${count == 1 ? '' : 's'}',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Colors.grey.shade500,
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    const SizedBox(height: 12),
                    TextFormField(
                      focusNode: _referenceFocus,
                      initialValue: data.reference,
                      textInputAction: TextInputAction.next,
                      onFieldSubmitted: (_) => _addressFocus.requestFocus(),
                      decoration: const InputDecoration(labelText: 'Reference'),
                      onChanged: (val) {
                        data.reference = val;
                        _onDataChanged();
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      focusNode: _addressFocus,
                      initialValue: data.address,
                      textInputAction: TextInputAction.next,
                      onFieldSubmitted: (_) => _contactFocus.requestFocus(),
                      decoration: const InputDecoration(labelText: 'Address'),
                      onChanged: (val) {
                        data.address = val;
                        _onDataChanged();
                      },
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            focusNode: _contactFocus,
                            initialValue: data.contactNo,
                            keyboardType: TextInputType.phone,
                            textInputAction: TextInputAction.next,
                            onFieldSubmitted: (_) => _emailFocus.requestFocus(),
                            inputFormatters: [
                              LengthLimitingTextInputFormatter(10),
                            ],
                            decoration: const InputDecoration(
                              labelText: 'Contact No',
                            ),
                            onChanged: (val) {
                              data.contactNo = val;
                              _onDataChanged();
                            },
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextFormField(
                            focusNode: _emailFocus,
                            initialValue: data.email,
                            keyboardType: TextInputType.emailAddress,
                            textInputAction: TextInputAction.done,
                            decoration: const InputDecoration(
                              labelText: 'Email (Optional)',
                            ),
                            onChanged: (val) {
                              data.email = val;
                              _onDataChanged();
                            },
                          ),
                        ),
                      ],
                    ),
                    if (Provider.of<AppState>(
                              context,
                              listen: false,
                            ).clientConfig.clientId ==
                            'kprupvc' &&
                        Provider.of<AppState>(
                          context,
                          listen: false,
                        ).supplierCompanies.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        initialValue:
                            data.supplierCompany.isEmpty
                                ? null
                                : data.supplierCompany,
                        decoration: InputDecoration(
                          labelText: 'Supplier Company',
                          labelStyle: TextStyle(
                            color: Theme.of(context).primaryColor,
                          ),
                          border: const OutlineInputBorder(),
                        ),
                        isExpanded: true,
                        items: [
                          const DropdownMenuItem<String>(
                            value: null,
                            child: Text('-- Select Supplier --'),
                          ),
                          ...Provider.of<AppState>(
                            context,
                            listen: false,
                          ).supplierCompanies.map((c) {
                            return DropdownMenuItem<String>(
                              value: c,
                              child: Text(c),
                            );
                          }),
                        ],
                        onChanged: (val) {
                          setState(() {
                            data.supplierCompany = val ?? '';
                          });
                          _onDataChanged();
                        },
                      ),
                    ],
                  ],
                ),
              ),
            ).animate().fade(delay: 200.ms),

            SwitchListTile(
              title: const Text(
                'Enable Presets (Autofill from Catalog)',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              value: _usePresets,
              activeThumbColor: Theme.of(context).colorScheme.primary,
              onChanged: (val) => setState(() => _usePresets = val),
            ).animate().fade(delay: 250.ms),

            _buildSectionTitle(
              'Measured Items',
              trailing: IconButton(
                icon: const Icon(Icons.refresh, size: 20),
                onPressed:
                    _isLoadingCatalog
                        ? null
                        : () => _loadCatalog(forceRefresh: true),
                tooltip: 'Refresh product catalog',
              ),
            ).animate().fade(delay: 300.ms),
            ...data.measuredItems.asMap().entries.map((entry) {
              int index = entry.key;
              MeasuredItem item = entry.value;
              return Card(
                key: item.cardKey,
                margin: const EdgeInsets.only(bottom: 12),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Item #${index + 1}',
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                          IconButton(
                            icon: const Icon(
                              Icons.delete,
                              color: Colors.redAccent,
                            ),
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(),
                            onPressed: () {
                              setState(
                                () => data.measuredItems.removeAt(index),
                              );
                              _onDataChanged();
                            },
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      if (_usePresets) ...[
                        Row(
                          children: [
                            Expanded(
                              child: DropdownButtonFormField<Product>(
                                decoration: InputDecoration(
                                  labelText:
                                      'Select from Product Catalog (Autofills fields)',
                                  prefixIcon:
                                      _isLoadingCatalog
                                          ? const SizedBox(
                                            width: 20,
                                            height: 20,
                                            child: Padding(
                                              padding: EdgeInsets.all(12.0),
                                              child: CircularProgressIndicator(
                                                strokeWidth: 2,
                                              ),
                                            ),
                                          )
                                          : null,
                                ),
                                initialValue: null,
                                isExpanded: true,
                                hint: Text(
                                  _isLoadingCatalog
                                      ? 'Loading catalog...'
                                      : 'Choose a product...',
                                ),
                                items:
                                    _measuredProducts.map((p) {
                                      return DropdownMenuItem<Product>(
                                        value: p,
                                        child: Row(
                                          children: [
                                            Expanded(
                                              child: Text(p.displayLabel),
                                            ),
                                            const SizedBox(width: 8),
                                            Container(
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                    horizontal: 6,
                                                    vertical: 2,
                                                  ),
                                              decoration: BoxDecoration(
                                                color:
                                                    p.isLowStock
                                                        ? Colors.red.withValues(
                                                          alpha: 0.1,
                                                        )
                                                        : Colors.green
                                                            .withValues(
                                                              alpha: 0.1,
                                                            ),
                                                borderRadius:
                                                    BorderRadius.circular(8),
                                              ),
                                              child: Text(
                                                '${p.stockQuantity}',
                                                style: TextStyle(
                                                  fontSize: 10,
                                                  fontWeight: FontWeight.bold,
                                                  color:
                                                      p.isLowStock
                                                          ? Colors.red
                                                          : Colors.green,
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                      );
                                    }).toList(),
                                onChanged:
                                    _isLoadingCatalog
                                        ? null
                                        : (Product? product) {
                                          if (product != null) {
                                            setState(() {
                                              if (product.name.isNotEmpty)
                                                item.code = product.name;
                                              item.description =
                                                  product.description.isNotEmpty
                                                      ? product.description
                                                      : product.name;
                                              item.glass = '';
                                              item.width = 0;
                                              item.height = 0;
                                              item.rate = product.price;
                                              item.cardKey = UniqueKey();
                                            });
                                            _onDataChanged();
                                          }
                                        },
                              ),
                            ),
                            IconButton(
                              icon: const Icon(Icons.refresh, size: 20),
                              onPressed:
                                  _isLoadingCatalog
                                      ? null
                                      : () => _loadCatalog(forceRefresh: true),
                              tooltip: 'Refresh product catalog',
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                      ],
                      Row(
                        children: [
                          Expanded(
                            child: TextFormField(
                              focusNode: _node('m_${index}_0'),
                              initialValue: item.code,
                              textInputAction: TextInputAction.next,
                              onFieldSubmitted:
                                  (_) => _nextField('m_${index}_0'),
                              decoration: const InputDecoration(
                                labelText: 'Code',
                              ),
                              onChanged: (val) {
                                item.code = val;
                                _onDataChanged();
                                _applyRateCardRate(item);
                              },
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            flex: 2,
                            child: TextFormField(
                              focusNode: _node('m_${index}_1'),
                              initialValue: item.description,
                              textInputAction: TextInputAction.next,
                              onFieldSubmitted:
                                  (_) => _nextField('m_${index}_1'),
                              decoration: const InputDecoration(
                                labelText: 'Description',
                              ),
                              onChanged: (val) {
                                item.description = val;
                                _onDataChanged();
                              },
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: TextFormField(
                              focusNode: _node('m_${index}_2'),
                              initialValue:
                                  item.width == 0 ? '' : item.width.toString(),
                              keyboardType: TextInputType.number,
                              textInputAction: TextInputAction.next,
                              onFieldSubmitted:
                                  (_) => _nextField('m_${index}_2'),
                              decoration: const InputDecoration(
                                labelText: 'W (MM)',
                              ),
                              onChanged: (val) {
                                item.width = double.tryParse(val) ?? 0;
                                setState(() {});
                                _onDataChanged();
                                _applyRateCardRate(item);
                              },
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextFormField(
                              focusNode: _node('m_${index}_3'),
                              initialValue:
                                  item.height == 0
                                      ? ''
                                      : item.height.toString(),
                              keyboardType: TextInputType.number,
                              textInputAction: TextInputAction.next,
                              onFieldSubmitted:
                                  (_) => _nextField('m_${index}_3'),
                              decoration: const InputDecoration(
                                labelText: 'H (MM)',
                              ),
                              onChanged: (val) {
                                item.height = double.tryParse(val) ?? 0;
                                setState(() {});
                                _onDataChanged();
                                _applyRateCardRate(item);
                              },
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextFormField(
                              focusNode: _node('m_${index}_4'),
                              initialValue: item.units.toString(),
                              keyboardType: TextInputType.number,
                              textInputAction: TextInputAction.next,
                              onFieldSubmitted:
                                  (_) => _nextField('m_${index}_4'),
                              decoration: const InputDecoration(
                                labelText: 'Units',
                              ),
                              onChanged: (val) {
                                item.units = int.tryParse(val) ?? 1;
                                setState(() {});
                                _onDataChanged();
                              },
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: TextFormField(
                              focusNode: _node('m_${index}_5'),
                              initialValue: item.glass,
                              textInputAction: TextInputAction.next,
                              onFieldSubmitted:
                                  (_) => _nextField('m_${index}_5'),
                              decoration: const InputDecoration(
                                labelText: 'Glass',
                              ),
                              onChanged: (val) {
                                item.glass = val;
                                _onDataChanged();
                              },
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextFormField(
                              focusNode: _node('m_${index}_6'),
                              initialValue:
                                  item.rate == 0 ? '' : item.rate.toString(),
                              keyboardType: TextInputType.number,
                              textInputAction: TextInputAction.next,
                              onFieldSubmitted:
                                  (_) => _nextField('m_${index}_6'),
                              decoration: const InputDecoration(
                                labelText: 'Rate (Rs)',
                              ),
                              onChanged: (val) {
                                item.rate = double.tryParse(val) ?? 0;
                                setState(() {});
                                _onDataChanged();
                              },
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ).animate().fade(delay: 300.ms).slideX(begin: 0.1);
            }),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                icon: const Icon(Icons.add),
                label: const Text('Add Measured Item'),
                onPressed: () {
                  setState(() => data.measuredItems.add(MeasuredItem()));
                  _onDataChanged();
                },
              ),
            ).animate().fade(delay: 400.ms),

            _buildSectionTitle(
              'Unmeasured Items',
              trailing: IconButton(
                icon: const Icon(Icons.refresh, size: 20),
                onPressed:
                    _isLoadingCatalog
                        ? null
                        : () => _loadCatalog(forceRefresh: true),
                tooltip: 'Refresh product catalog',
              ),
            ).animate().fade(delay: 500.ms),
            ...data.unmeasuredItems.asMap().entries.map((entry) {
              int index = entry.key;
              UnmeasuredItem item = entry.value;
              return Card(
                key: item.cardKey,
                margin: const EdgeInsets.only(bottom: 12),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Unmeasured #${index + 1}',
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                          IconButton(
                            icon: const Icon(
                              Icons.delete,
                              color: Colors.redAccent,
                            ),
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(),
                            onPressed: () {
                              setState(
                                () => data.unmeasuredItems.removeAt(index),
                              );
                              _onDataChanged();
                            },
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      if (_usePresets) ...[
                        Row(
                          children: [
                            Expanded(
                              child: DropdownButtonFormField<Product>(
                                decoration: InputDecoration(
                                  labelText:
                                      'Select from Product Catalog (Autofills fields)',
                                  prefixIcon:
                                      _isLoadingCatalog
                                          ? const SizedBox(
                                            width: 20,
                                            height: 20,
                                            child: Padding(
                                              padding: EdgeInsets.all(12.0),
                                              child: CircularProgressIndicator(
                                                strokeWidth: 2,
                                              ),
                                            ),
                                          )
                                          : null,
                                ),
                                initialValue: null,
                                isExpanded: true,
                                hint: Text(
                                  _isLoadingCatalog
                                      ? 'Loading catalog...'
                                      : 'Choose a product...',
                                ),
                                items:
                                    _unmeasuredProducts.map((p) {
                                      return DropdownMenuItem<Product>(
                                        value: p,
                                        child: Row(
                                          children: [
                                            Expanded(
                                              child: Text(p.displayLabel),
                                            ),
                                            const SizedBox(width: 8),
                                            Container(
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                    horizontal: 6,
                                                    vertical: 2,
                                                  ),
                                              decoration: BoxDecoration(
                                                color:
                                                    p.isLowStock
                                                        ? Colors.red.withValues(
                                                          alpha: 0.1,
                                                        )
                                                        : Colors.green
                                                            .withValues(
                                                              alpha: 0.1,
                                                            ),
                                                borderRadius:
                                                    BorderRadius.circular(8),
                                              ),
                                              child: Text(
                                                '${p.stockQuantity}',
                                                style: TextStyle(
                                                  fontSize: 10,
                                                  fontWeight: FontWeight.bold,
                                                  color:
                                                      p.isLowStock
                                                          ? Colors.red
                                                          : Colors.green,
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                      );
                                    }).toList(),
                                onChanged:
                                    _isLoadingCatalog
                                        ? null
                                        : (Product? product) {
                                          if (product != null) {
                                            setState(() {
                                              item.description =
                                                  product.description.isNotEmpty
                                                      ? product.description
                                                      : product.name;
                                              item.rate = product.price;
                                              item.cardKey = UniqueKey();
                                            });
                                            _onDataChanged();
                                          }
                                        },
                              ),
                            ),
                            IconButton(
                              icon: const Icon(Icons.refresh, size: 20),
                              onPressed:
                                  _isLoadingCatalog
                                      ? null
                                      : () => _loadCatalog(forceRefresh: true),
                              tooltip: 'Refresh product catalog',
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                      ],
                      TextFormField(
                        focusNode: _node('u_${index}_0'),
                        initialValue: item.description,
                        textInputAction: TextInputAction.next,
                        onFieldSubmitted: (_) => _nextField('u_${index}_0'),
                        decoration: const InputDecoration(
                          labelText: 'Description',
                        ),
                        onChanged: (val) {
                          item.description = val;
                          _onDataChanged();
                        },
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: TextFormField(
                              focusNode: _node('u_${index}_1'),
                              initialValue: item.units.toString(),
                              keyboardType: TextInputType.number,
                              textInputAction: TextInputAction.next,
                              onFieldSubmitted:
                                  (_) => _nextField('u_${index}_1'),
                              decoration: const InputDecoration(
                                labelText: 'Units',
                              ),
                              onChanged: (val) {
                                item.units = int.tryParse(val) ?? 1;
                                setState(() {});
                                _onDataChanged();
                              },
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextFormField(
                              focusNode: _node('u_${index}_2'),
                              initialValue:
                                  item.rate == 0 ? '' : item.rate.toString(),
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                    decimal: true,
                                    signed: true,
                                  ),
                              textInputAction: TextInputAction.next,
                              onFieldSubmitted:
                                  (_) => _nextField('u_${index}_2'),
                              decoration: const InputDecoration(
                                labelText: 'Rate (Rs)',
                              ),
                              onChanged: (val) {
                                item.rate = double.tryParse(val) ?? 0;
                                setState(() {});
                                _onDataChanged();
                              },
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ).animate().fade(delay: 500.ms).slideX(begin: 0.1);
            }),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                icon: const Icon(Icons.add),
                label: const Text('Add Unmeasured Item'),
                onPressed: () {
                  setState(() => data.unmeasuredItems.add(UnmeasuredItem()));
                  _onDataChanged();
                },
              ),
            ).animate().fade(delay: 600.ms),

            // ===== SITE PHOTOS SECTION (delegated to SitePhotoPicker) =====
            // Gated by Settings > Enable Site Photos (default ON, local SharedPreferences)
            if (Provider.of<AppState>(context).enableSitePhotos) ...[
              _buildSectionTitle('Site Photos').animate().fade(delay: 650.ms),
              SitePhotoPicker(
                quotationId: data.id,
                initialPhotos: _photos,
                onPhotosChanged: (photos) {
                  setState(() => _photos = photos);
                },
                onRequestSave: () async {
                  await _autoSaveToDatabase();
                  return data.id;
                },
              ),
            ],

            _buildSectionTitle(
              'Final Computations',
            ).animate().fade(delay: 700.ms),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_isKprupvc) ...[
                      TextFormField(
                        key: const ValueKey('kpr-advance-paid-field'),
                        focusNode: _advancePaidFocus,
                        initialValue:
                            data.advancePaid == 0
                                ? ''
                                : data.advancePaid.toString(),
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        textInputAction: TextInputAction.next,
                        onFieldSubmitted: (_) => _transportFocus.requestFocus(),
                        decoration: const InputDecoration(
                          labelText: 'Advance Paid (Rs)',
                          helperText: 'Amount already paid by the customer',
                        ),
                        onChanged: (val) {
                          data.advancePaid = double.tryParse(val) ?? 0;
                          if (data.advancePaid < 0) data.advancePaid = 0;
                          setState(() {});
                          _onDataChanged();
                        },
                      ),
                      const SizedBox(height: 12),
                    ],
                    TextFormField(
                      focusNode: _transportFocus,
                      initialValue:
                          data.transport == 0 ? '' : data.transport.toString(),
                      keyboardType: TextInputType.number,
                      textInputAction: TextInputAction.next,
                      onFieldSubmitted: (_) {
                        if (data.includeGst) {
                          _gstFocus.requestFocus();
                        }
                      },
                      decoration: const InputDecoration(
                        labelText: 'Transport Cost (Rs)',
                      ),
                      onChanged: (val) {
                        data.transport = double.tryParse(val) ?? 0;
                        setState(() {});
                        _onDataChanged();
                      },
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Checkbox(
                          value: data.includeGst,
                          onChanged: (val) {
                            setState(() {
                              data.includeGst = val ?? false;
                              if (data.includeGst &&
                                  data.gstPercentage == 0.0) {
                                final appState = Provider.of<AppState>(
                                  context,
                                  listen: false,
                                );
                                data.gstPercentage =
                                    appState.defaultGstPercentage;
                              }
                            });
                            _onDataChanged();
                          },
                        ),
                        const Expanded(
                          child: Text('Do you want to add GST to the invoice?'),
                        ),
                      ],
                    ),
                    if (data.includeGst)
                      Padding(
                        padding: const EdgeInsets.only(
                          left: 48.0,
                          top: 8.0,
                          bottom: 8.0,
                        ),
                        child: TextFormField(
                          focusNode: _gstFocus,
                          initialValue:
                              data.gstPercentage == 0.0
                                  ? ''
                                  : data.gstPercentage.toString(),
                          keyboardType: TextInputType.number,
                          textInputAction: TextInputAction.done,
                          decoration: const InputDecoration(
                            labelText: 'GST Percentage (%)',
                          ),
                          onChanged: (val) {
                            data.gstPercentage = double.tryParse(val) ?? 0.0;
                            setState(() {});
                            _onDataChanged();
                          },
                        ),
                      ),
                    const Divider(),
                    const SizedBox(height: 8),
                    _buildComputationRow(
                      'Subtotal (Actual Amount)',
                      data.actualAmount,
                    ),
                    _buildComputationRow('Transport Cost', data.transport),
                    if (data.includeGst)
                      _buildComputationRow(
                        'IGST (${data.gstPercentage}%)',
                        data.igst,
                      ),
                    const Divider(thickness: 1.5),
                    _buildComputationRow(
                      'Grand Total',
                      data.grandTotal,
                      isBold: true,
                    ),
                    if (_isKprupvc) ...[
                      _buildComputationRow('Advance Paid', data.advancePaid),
                      _buildComputationRow(
                        'Remaining Amount',
                        data.balanceDue,
                        isBold: true,
                      ),
                    ],
                    const SizedBox(height: 8),
                    Text(
                      data.amountInWords,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ],
                ),
              ),
            ).animate().fade(delay: 700.ms),

            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              height: 60,
              child: ElevatedButton(
                onPressed: _isProcessingPdf ? null : _generateAndProcessPdf,
                style: ElevatedButton.styleFrom(
                  padding: EdgeInsets.zero,
                  backgroundColor: Colors.transparent,
                  elevation: 0,
                  shadowColor: Colors.transparent,
                ),
                child: Ink(
                  decoration: BoxDecoration(
                    gradient: AppTheme.primaryGradientFrom(
                      Provider.of<AppState>(
                        context,
                        listen: false,
                      ).clientConfig,
                    ),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Container(
                    alignment: Alignment.center,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: const [
                        Icon(Icons.picture_as_pdf, color: Colors.white),
                        SizedBox(width: 12),
                        Text(
                          'GENERATE PDF',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 1.2,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ).animate().scale(delay: 800.ms),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _exportData('xlsx'),
                    icon: const Icon(Icons.table_chart),
                    label: const Text('EXPORT EXCEL'),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      side: BorderSide(
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _exportData('csv'),
                    icon: const Icon(Icons.grid_on),
                    label: const Text('EXPORT CSV'),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      side: BorderSide(
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    ),
                  ),
                ),
              ],
            ).animate().fade(delay: 850.ms),
            const SizedBox(height: 20),
            CraftedWithLoveWidget(),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  Future<void> _exportData(String format) async {
    if (_isExporting) return;
    _isExporting = true;
    final appState = Provider.of<AppState>(context, listen: false);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await export_lib.loadLibrary();
      if (format == 'xlsx') {
        await export_lib.exportQuotationXlsx(data, appState);
      } else {
        await export_lib.exportQuotationCsv(data, appState);
      }
      messenger.showSnackBar(
        SnackBar(
          content: Text('Exported ${data.quotationNo}.$format'),
          duration: const Duration(seconds: 2),
        ),
      );
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Export failed: $e')));
    } finally {
      _isExporting = false;
    }
  }

  Widget _buildComputationRow(
    String label,
    double amount, {
    bool isBold = false,
  }) {
    final theme = Theme.of(context);
    final style = TextStyle(
      fontSize: isBold ? 16 : 14,
      fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
      color:
          isBold ? theme.colorScheme.primary : theme.textTheme.bodyLarge?.color,
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: style),
          Text('₹${amount.toStringAsFixed(2)}', style: style),
        ],
      ),
    );
  }
}
