import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'utils/http_client.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'app_state.dart';
import 'models.dart';
import 'quotation_screen.dart';
import 'supabase_config.dart';
import 'login_screen.dart';
import 'settings_screen.dart';
import 'about_screen.dart';
import 'crafted_widget.dart';
import 'email_portal_screen.dart';
import 'analytics_screen.dart';
import 'market_page_preview_screen.dart';
import 'theme.dart';
import 'client_logo.dart';
import 'umami_tracker.dart';
import 'gst_invoice_list_screen.dart';
import 'inventory_screen.dart';
import 'production_screen.dart';
import 'cutting_screen.dart';
import 'leads_screen.dart';
import 'project_screen.dart';
import 'services/connectivity_service.dart';
import 'services/offline_database.dart';
import 'services/sync_engine.dart';
import 'widgets/offline_indicator.dart';
import 'widgets/update_prompt.dart';
import 'widgets/sync_status_widget.dart';
import 'widgets/update_banner.dart';
import 'services/auto_update_service.dart';
import 'services/quotation_recovery_service.dart';

class DashboardScreen extends StatefulWidget {
  final String? initialOpenQuote;
  const DashboardScreen({super.key, this.initialOpenQuote});

  @override
  _DashboardScreenState createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  List<QuotationData> _quotations = [];
  bool _isLoading = true;
  bool _quotationLoadFailed = false;
  String _searchQuery = '';
  String _filterType = 'Newest';
  bool _hasHandledOpenQuote = false;

  /// Number of locally-queued records awaiting push to the server.
  int _pendingSyncCount = 0;

  @override
  void initState() {
    super.initState();
    _fetchQuotations();
    _refreshPendingSyncCount();
    _checkForAppUpdate();
  }

  /// Check for updates AFTER app loads. AutoUpdateService compares the
  /// client config's published versionCode against the INSTALLED package
  /// version and, when newer, UpdatePrompt (mounted below) shows the
  /// animated download + in-place install dialog.
  Future<void> _checkForAppUpdate() async {
    try {
      // Wait for app to fully load first
      await Future.delayed(const Duration(seconds: 2));
      if (!mounted) return;
      await AutoUpdateService.instance.checkNow();
    } catch (_) {
      // Silently fail — update check is optional
    }
  }

  /// Read the offline write-queue depth so the banner shows a real number.
  /// Never throws — OfflineDatabase is a no-op on Flutter Web.
  Future<void> _refreshPendingSyncCount() async {
    try {
      final clientId =
          Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      if (clientId.isEmpty) return;
      final databaseCount =
          await OfflineDatabase.instance.getPendingSyncCount(clientId);
      final recoveryCount =
          await QuotationRecoveryService.instance.pendingCount(clientId);
      final count = databaseCount + recoveryCount;
      if (!mounted || count == _pendingSyncCount) return;
      setState(() => _pendingSyncCount = count);
    } catch (_) {
      // Pending count is cosmetic; never surface an error for it.
    }
  }

  static const _quotationsCachePrefix = 'cached_quotations_list_v1_';

  Future<void> _saveCachedQuotationsList(String clientId, List<dynamic> rawList) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('$_quotationsCachePrefix$clientId', jsonEncode(rawList));
    } catch (_) {}
  }

  Future<List<QuotationData>> _loadCachedQuotationsList(String clientId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('$_quotationsCachePrefix$clientId');
      if (raw != null && raw.isNotEmpty) {
        final decoded = jsonDecode(raw);
        if (decoded is List) {
          return decoded
              .map((e) => QuotationData.fromMap(Map<String, dynamic>.from(e as Map)))
              .toList();
        }
      }
    } catch (_) {}
    return const [];
  }

  Future<void> _fetchQuotations() async {
    final clientId =
        Provider.of<AppState>(context, listen: false).clientConfig.clientId;
    if (_quotations.isEmpty) {
      final initialCached = await _loadCachedQuotationsList(clientId);
      if (initialCached.isNotEmpty && mounted) {
        final local = await _localRecoveryQuotations(clientId, includeAcknowledgedDrafts: true);
        final merged = <String, QuotationData>{
          for (final q in initialCached) if (q.id != null) q.id!: q,
          for (final q in local) if (q.id != null) q.id!: q,
        };
        setState(() {
          _quotations = merged.values.toList();
          _isLoading = false;
        });
      }
    }

    setState(() => _isLoading = _quotations.isEmpty);
    try {
      final response = await SupabaseConfig.client
          .from('quotations')
          // Embed line items via FK relationship — WITHOUT these, every quote
          // loaded with empty item lists and grandTotal collapsed to transport
          // (+GST on transport only), which is exactly what the client saw.
          .select('*, measured_items(*), unmeasured_items(*)')
          .eq('client_id', clientId)
          .order('created_at', ascending: false)
          .timeout(const Duration(seconds: 5));

      final cloud = (response as List).map((e) => QuotationData.fromMap(e)).toList();
      unawaited(_saveCachedQuotationsList(clientId, response));

      final local = await _localRecoveryQuotations(clientId, includeAcknowledgedDrafts: false);
      final merged = <String, QuotationData>{
        for (final quotation in cloud)
          if (quotation.id != null) quotation.id!: quotation,
      };
      // Unsynced device copies override cloud rows. Acknowledged local drafts
      // may be older than cloud and must never hide a newer cloud revision.
      for (final quotation in local) {
        if (quotation.id != null) merged[quotation.id!] = quotation;
      }

      setState(() {
        _quotations = merged.values.toList();
        _quotationLoadFailed = false;
        _isLoading = false;
      });

      if (!_hasHandledOpenQuote && widget.initialOpenQuote != null) {
        _hasHandledOpenQuote = true;
        try {
          final openQuoteId = widget.initialOpenQuote;
          if (openQuoteId != null && openQuoteId.isNotEmpty) {
            final qIndex = _quotations.indexWhere((q) => q.id == openQuoteId);
            if (qIndex != -1) {
              Future.microtask(() {
                if (mounted) {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (context) => QuotationScreen(existingData: _quotations[qIndex])),
                  ).then((_) => _fetchQuotations());
                }
              });
            }
          }
        } catch (_) {}
      }
    } catch (e) {
      final cached = await _loadCachedQuotationsList(clientId);
      final recovered = await _localRecoveryQuotations(clientId, includeAcknowledgedDrafts: true);
      if (mounted) {
        setState(() {
          final merged = <String, QuotationData>{
            for (final quotation in cached)
              if (quotation.id != null) quotation.id!: quotation,
            for (final quotation in _quotations)
              if (quotation.id != null) quotation.id!: quotation,
            for (final quotation in recovered)
              if (quotation.id != null) quotation.id!: quotation,
          };
          _quotations = merged.values.toList();
          _quotationLoadFailed = true;
          _isLoading = false;
        });
      }
      debugPrint('Fetch error: $e');
    }
  }

  Future<List<QuotationData>> _localRecoveryQuotations(
    String clientId, {
    required bool includeAcknowledgedDrafts,
  }) async {
    final service = QuotationRecoveryService.instance;
    final recovered = <String, QuotationData>{};

    void addSnapshot(Map<dynamic, dynamic> snapshot) {
      final quotation = snapshot['quotation'];
      if (quotation is! Map) return;
      final map = Map<String, dynamic>.from(quotation);
      if ((map['client_id'] ?? clientId).toString() != clientId) return;
      map['measured_items'] = snapshot['measured_items'] ?? const [];
      map['unmeasured_items'] = snapshot['unmeasured_items'] ?? const [];
      final parsed = QuotationData.fromMap(map);
      if (parsed.id != null) recovered[parsed.id!] = parsed;
    }

    for (final draft in await service.localDrafts(clientId)) {
      final quotation = draft['quotation'];
      if (quotation is! Map) continue;
      final syncVersion = (quotation['sync_version'] as num?)?.toInt() ?? 0;
      final needsSync = draft['needs_sync'] == true || syncVersion == 0;
      if (includeAcknowledgedDrafts || needsSync) addSnapshot(draft);
    }
    // Pending envelopes are authoritative device changes and take precedence.
    for (final envelope in await service.pendingEnvelopes(clientId)) {
      final snapshot = envelope['snapshot'];
      if (snapshot is Map) addSnapshot(snapshot);
    }
    return recovered.values.toList();
  }

  Future<void> _syncEverything() async {
    final clientId =
        Provider.of<AppState>(context, listen: false).clientConfig.clientId;
    await Future.wait([
      SyncEngine.instance.syncAll(),
      QuotationRecoveryService.instance.flushPending(clientId),
    ]);
    await _refreshPendingSyncCount();
    await _fetchQuotations();
  }

  void _logout() async {
    umamiTrack('logout');
    if (kIsWeb) {
      try {
        await postWithCredentials(
          Uri.parse('/api/portal_auth'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'mode': 'logout'}),
        );
      } catch (_) {}
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('session_active');
      await prefs.remove('session_client_id');
      await prefs.remove('session_password_hash');
    } else {
      try {
        const storage = FlutterSecureStorage();
        await storage.delete(key: 'session_active');
        await storage.delete(key: 'session_client_id');
        await storage.delete(key: 'session_password_hash');
      } catch (_) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove('session_active');
        await prefs.remove('session_client_id');
        await prefs.remove('session_password_hash');
      }
    }
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (context) => const LoginScreen()),
      (route) => false,
    );
  }

  Future<void> _updateStatus(QuotationData q, QuotationStatus newStatus) async {
    if (q.id == null) {
      debugPrint('Status update skipped: quotation has null id');
      return;
    }
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      await SupabaseConfig.client
          .from('quotations')
          .update({'status': newStatus.value})
          .eq('id', q.id!)
          .eq('client_id', clientId);
      setState(() => q.status = newStatus);
    } catch (e) {
      debugPrint('Status update error: $e');
    }
  }

  void _showStatusSheet(QuotationData q) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) {
        final theme = Theme.of(ctx);
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Quotation Options', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: theme.primaryColor)),
                    IconButton(
                      icon: const Icon(Icons.close, size: 20),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () => Navigator.pop(ctx),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text('${q.quotationNo} · ${q.customerName}', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                const SizedBox(height: 16),
                Text('CHANGE STATUS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 0.8, color: Colors.grey.shade500)),
                const SizedBox(height: 6),
                ...QuotationStatus.values.map((s) {
                  final isSelected = q.status == s;
                  return ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    leading: Container(
                      width: 12, height: 12,
                      decoration: BoxDecoration(color: _statusColor(s), shape: BoxShape.circle),
                    ),
                    title: Text(s.label, style: TextStyle(fontWeight: isSelected ? FontWeight.bold : FontWeight.normal)),
                    trailing: isSelected ? Icon(Icons.check_circle, color: theme.primaryColor) : null,
                    onTap: () async {
                      Navigator.pop(ctx);
                      await _updateStatus(q, s);
                    },
                  );
                }),
                const Divider(height: 20),
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.delete_outline, color: Colors.red),
                  title: const Text('Delete Quotation', style: TextStyle(color: Colors.red, fontWeight: FontWeight.w600)),
                  subtitle: const Text('Permanently remove this quotation', style: TextStyle(fontSize: 11, color: Colors.redAccent)),
                  onTap: () {
                    Navigator.pop(ctx);
                    _confirmDeleteQuotation(q);
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _confirmDeleteQuotation(QuotationData q) {
    showDialog(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            Icon(Icons.warning_amber_rounded, color: Colors.amber.shade800, size: 28),
            const SizedBox(width: 10),
            const Text('Delete Quotation?'),
          ],
        ),
        content: Text(
          'Are you sure you want to delete quotation ${q.quotationNo} for "${q.customerName}"?\n\n'
          'Amount: ₹${q.grandTotal.toStringAsFixed(0)}',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogCtx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red.shade600,
              foregroundColor: Colors.white,
            ),
            onPressed: () {
              Navigator.pop(dialogCtx);
              _secondConfirmationDelete(q);
            },
            child: const Text('Continue to Delete'),
          ),
        ],
      ),
    );
  }

  void _secondConfirmationDelete(QuotationData q) {
    showDialog(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            Icon(Icons.delete_forever, color: Colors.red.shade700, size: 28),
            const SizedBox(width: 10),
            const Text('Final Confirmation'),
          ],
        ),
        content: Text(
          'This is your final confirmation.\n\n'
          'Are you ABSOLUTELY sure you want to permanently delete quotation ${q.quotationNo}?\n\n'
          'This action CANNOT be undone.',
          style: const TextStyle(height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogCtx),
            child: const Text('Keep Quotation'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Colors.red.shade800,
              foregroundColor: Colors.white,
            ),
            onPressed: () async {
              Navigator.pop(dialogCtx);
              await _deleteQuotation(q);
            },
            child: const Text('Yes, Delete Permanently'),
          ),
        ],
      ),
    );
  }

  Future<void> _deleteQuotation(QuotationData q) async {
    if (q.id == null) {
      debugPrint('Delete skipped: quotation has null id');
      return;
    }
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      // Delete child line items first to ensure database clean-up
      await SupabaseConfig.client
          .from('measured_items')
          .delete()
          .eq('quotation_id', q.id!)
          .eq('client_id', clientId);
      await SupabaseConfig.client
          .from('unmeasured_items')
          .delete()
          .eq('quotation_id', q.id!)
          .eq('client_id', clientId);
      await SupabaseConfig.client
          .from('quotations')
          .delete()
          .eq('id', q.id!)
          .eq('client_id', clientId);

      if (mounted) {
        setState(() {
          _quotations.removeWhere((item) => item.id == q.id);
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Quotation ${q.quotationNo} deleted successfully'),
            backgroundColor: Colors.red.shade700,
          ),
        );
      }
    } catch (e) {
      debugPrint('Delete quotation error: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to delete quotation: $e'),
            backgroundColor: Colors.red.shade900,
          ),
        );
      }
    }
  }

  Color _statusColor(QuotationStatus s) {
    switch (s) {
      case QuotationStatus.draft: return Colors.grey.shade400;
      case QuotationStatus.sent:  return Colors.blue.shade400;
      case QuotationStatus.won:   return Colors.green.shade500;
      case QuotationStatus.lost:  return Colors.red.shade400;
    }
  }

  Widget _buildStatusChip(QuotationStatus s) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: _statusColor(s).withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: _statusColor(s).withValues(alpha: 0.5), width: 1),
      ),
      child: Text(
        s.label,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: _statusColor(s)),
      ),
    );
  }

  Widget _buildTopTile({required String title, required IconData icon, required VoidCallback onTap, required LinearGradient gradient, required int delay}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        height: 110,
        decoration: BoxDecoration(
          gradient: gradient,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [BoxShadow(color: gradient.colors.first.withValues(alpha: 0.4), blurRadius: 10, offset: const Offset(0, 5))],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 36, color: Colors.white),
            const SizedBox(height: 8),
            Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
          ],
        ),
      ),
    ).animate().scale(delay: Duration(milliseconds: delay));
  }

  Widget _buildTrialWarningBanner(BuildContext context) {
    final appState = context.watch<AppState>();

    // No trial warning active — render nothing.
    if (!appState.isTrialExpiringSoon && !appState.isTrialExpired) {
      return const SizedBox.shrink();
    }

    if (appState.isTrialExpired) {
      return Container(
        width: double.infinity,
        margin: const EdgeInsets.fromLTRB(12, 8, 12, 0),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [Colors.red.shade700, Colors.red.shade900],
          ),
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
              color: Colors.red.shade900.withValues(alpha: 0.3),
              blurRadius: 8,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.lock_clock, color: Colors.white, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Trial Expired',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                'Your trial period has ended. Please contact your service provider to continue using the app.',
                style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 13),
              ),
              if (appState.companyEmail.isNotEmpty || appState.companyContact.isNotEmpty) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    if (appState.companyEmail.isNotEmpty) ...[
                      const Icon(Icons.email_outlined, color: Colors.white70, size: 14),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text(
                          appState.companyEmail,
                          style: const TextStyle(color: Colors.white70, fontSize: 12),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                    if (appState.companyEmail.isNotEmpty && appState.companyContact.isNotEmpty)
                      const SizedBox(width: 12),
                    if (appState.companyContact.isNotEmpty) ...[
                      const Icon(Icons.phone_outlined, color: Colors.white70, size: 14),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text(
                          appState.companyContact,
                          style: const TextStyle(color: Colors.white70, fontSize: 12),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ],
          ),
        ),
      );
    }

    // Trial expiring soon
    final days = appState.trialDaysRemaining;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [Colors.amber.shade700, Colors.orange.shade800],
        ),
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.orange.shade900.withValues(alpha: 0.25),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          children: [
            const Icon(Icons.timer_outlined, color: Colors.white, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                days == 1
                    ? 'Trial expires tomorrow'
                    : days <= 0
                        ? 'Trial expires today'
                        : 'Trial expires in $days days',
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
            ),
            Text(
              'Contact provider',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.85),
                fontSize: 12,
                decoration: TextDecoration.underline,
                decorationColor: Colors.white70,
              ),
            ),
          ],
        ),
      ),
    ).animate(onPlay: (controller) => controller.repeat(reverse: true))
        .fadeIn(duration: 800.ms);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final filteredQuotations = _quotations.where((q) {
      final query = _searchQuery.toLowerCase();
      return q.customerName.toLowerCase().contains(query) || q.quotationNo.toLowerCase().contains(query);
    }).toList();

    if (_filterType == 'Oldest') {
      filteredQuotations.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    } else if (_filterType == 'Highest Amount') {
      filteredQuotations.sort((a, b) => b.grandTotal.compareTo(a.grandTotal));
    } else if (_filterType == 'Lowest Amount') {
      filteredQuotations.sort((a, b) => a.grandTotal.compareTo(b.grandTotal));
    } else if (_filterType == 'Won') {
      filteredQuotations.retainWhere((q) => q.status == QuotationStatus.won);
    } else {
      filteredQuotations.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          const SyncStatusWidget(compact: true),
          IconButton(icon: const Icon(Icons.analytics_outlined), tooltip: 'Analytics', onPressed: () {
            Navigator.push(context, MaterialPageRoute(builder: (context) => AnalyticsScreen(quotations: _quotations)));
          }),
          IconButton(icon: const Icon(Icons.refresh), onPressed: _fetchQuotations),
        ],
      ),
      drawer: Drawer(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            DrawerHeader(
              decoration: BoxDecoration(color: theme.primaryColor),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 72,
                    height: 72,
                    padding: const EdgeInsets.all(4),
                    decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                    child: Container(
                      decoration: const BoxDecoration(shape: BoxShape.circle),
                      clipBehavior: Clip.antiAlias,
                      child: ClientLogo(
                        config: Provider.of<AppState>(context, listen: false).clientConfig, 
                        width: 64, 
                        height: 64, 
                        fit: BoxFit.cover
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Flexible(child: Text(Provider.of<AppState>(context).companyName, textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold))),
                ],
              ),
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.add_circle_outline, color: Colors.indigo),
              title: const Text('New Quotation'),
              onTap: () async {
                Navigator.pop(context);
                await Navigator.push(context, MaterialPageRoute(builder: (context) => QuotationScreen()));
                _fetchQuotations();
              },
            ),
            ListTile(
              leading: const Icon(Icons.inventory_2_outlined, color: Colors.brown),
              title: const Text('Inventory'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const InventoryScreen(),
                  ),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.factory_outlined, color: Colors.orange),
              title: const Text('Production'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const ProductionScreen(),
                  ),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.content_cut, color: Colors.blue),
              title: const Text('Cutting'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const CuttingScreen(),
                  ),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.people_outline, color: Colors.teal),
              title: const Text('Leads / CRM'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const LeadsScreen(),
                  ),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.folder_copy_outlined, color: Colors.indigo),
              title: const Text('Projects'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const ProjectScreen(),
                  ),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.receipt_long, color: Colors.green),
              title: const Text('GST Invoices'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(context, MaterialPageRoute(builder: (context) => const GstInvoiceListScreen()));
              },
            ),
            ListTile(
              leading: const Icon(Icons.email_outlined, color: Colors.pink),
              title: const Text('Send Email'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(context, MaterialPageRoute(builder: (context) => EmailPortalScreen()));
              },
            ),
            ListTile(
              leading: const Icon(Icons.analytics_outlined, color: Colors.green),
              title: const Text('Analytics'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(context, MaterialPageRoute(builder: (context) => AnalyticsScreen(quotations: _quotations)));
              },
            ),
            if (Provider.of<AppState>(context, listen: false).clientConfig.clientId.toLowerCase() == 'kprupvc')
              ListTile(
                leading: const Icon(Icons.web, color: Colors.indigo),
                title: const Text('Market Page'),
                onTap: () {
                  Navigator.pop(context);
                  Navigator.push(context, MaterialPageRoute(builder: (context) => const MarketPagePreviewScreen()));
                },
              ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.settings),
              title: const Text('Settings'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(context, MaterialPageRoute(builder: (context) => SettingsScreen()));
              },
            ),
            ListTile(
              leading: const Icon(Icons.info),
              title: const Text('About'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(context, MaterialPageRoute(builder: (context) => AboutScreen()));
              },
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.logout, color: Colors.red),
              title: const Text('Logout', style: TextStyle(color: Colors.red)),
              onTap: _logout,
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          // Offline indicator banner.
          // connectivityStream emits isOnline (true == online), so it must be
          // inverted here — the banner takes isOffline.
          StreamBuilder<bool>(
            stream: ConnectivityService.instance.connectivityStream
                .map((online) => !online),
            initialData: !ConnectivityService.instance.isOnline,
            builder: (context, snapshot) {
              final isOffline = snapshot.data ?? false;
              return OfflineBanner(
                isOffline: isOffline,
                pendingSyncCount: _pendingSyncCount,
                onTap: isOffline
                    ? null
                    : _syncEverything,
              );
            },
          ),
          // Content update banner (products / pricing / terms / bank / branding)
          UpdateBanner(
            clientId: context.read<AppState>().clientConfig.clientId,
            onApplied: _fetchQuotations,
          ),
          // APK in-app update dialog (animated download + install progress).
          // Renders nothing unless AutoUpdateService emits an update event.
          const UpdatePrompt(),
          // Trial expiry warning banner
          _buildTrialWarningBanner(context),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                SizedBox(
                  width: (MediaQuery.of(context).size.width / 2) - 22,
                  child: _buildTopTile(
                    title: 'New Quotation',
                    icon: Icons.add_circle_outline,
                    gradient: AppTheme.primaryGradientFrom(Provider.of<AppState>(context, listen: false).clientConfig),
                    delay: 100,
                    onTap: () async {
                      umamiTrack('new_quotation');
                      await Navigator.push(context, MaterialPageRoute(builder: (context) => QuotationScreen()));
                      _fetchQuotations();
                    },
                  ),
                ),
                SizedBox(
                  width: (MediaQuery.of(context).size.width / 2) - 22,
                  child: _buildTopTile(
                    title: 'Send Email',
                    icon: Icons.email_outlined,
                    gradient: const LinearGradient(colors: [Color(0xFFEC4899), Color(0xFFF43F5E)]),
                    delay: 200,
                    onTap: () {
                      Navigator.push(context, MaterialPageRoute(builder: (context) => EmailPortalScreen()));
                    },
                  ),
                ),
              ],
            ),
          ),

          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    decoration: const InputDecoration(
                      labelText: 'Search Quotations',
                      prefixIcon: Icon(Icons.search),
                    ),
                    onChanged: (value) => setState(() => _searchQuery = value),
                  ),
                ),
                const SizedBox(width: 8),
                PopupMenuButton<String>(
                  icon: const Icon(Icons.filter_list, size: 28),
                  tooltip: 'Filter',
                  onSelected: (value) => setState(() => _filterType = value),
                  itemBuilder: (context) => [
                    const PopupMenuItem(value: 'Newest', child: Text('Newest First')),
                    const PopupMenuItem(value: 'Oldest', child: Text('Oldest First')),
                    const PopupMenuItem(value: 'Highest Amount', child: Text('Highest Amount')),
                    const PopupMenuItem(value: 'Lowest Amount', child: Text('Lowest Amount')),
                    const PopupMenuItem(value: 'Won', child: Text('Won Only')),
                  ],
                ),
              ],
            ).animate().fade(delay: 300.ms).slideY(begin: 0.2),
          ),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : filteredQuotations.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(_quotationLoadFailed ? Icons.cloud_off_outlined : Icons.inbox, size: 60, color: Colors.grey.shade400),
                            const SizedBox(height: 16),
                            Text(
                              _quotationLoadFailed
                                  ? 'Saved quotations could not be loaded yet'
                                  : _quotations.isNotEmpty
                                      ? 'No matching quotations'
                                      : 'No quotations yet',
                              style: TextStyle(color: Colors.grey.shade500, fontSize: 18),
                              textAlign: TextAlign.center,
                            ),
                            if (_quotationLoadFailed) ...[
                              const SizedBox(height: 8),
                              const Padding(
                                padding: EdgeInsets.symmetric(horizontal: 28),
                                child: Text('Your device copies are protected. Check the connection and try again.', textAlign: TextAlign.center),
                              ),
                              const SizedBox(height: 12),
                              OutlinedButton.icon(onPressed: _fetchQuotations, icon: const Icon(Icons.refresh), label: const Text('Try Again')),
                            ],
                          ],
                        ),
                      ).animate().fade()
                    : RefreshIndicator(
                        onRefresh: _fetchQuotations,
                        child: ListView.builder(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          itemCount: filteredQuotations.length,
                          itemBuilder: (context, index) {
                            final q = filteredQuotations[index];
                            return Card(
                              margin: const EdgeInsets.only(bottom: 12),
                              child: InkWell(
                                borderRadius: BorderRadius.circular(20),
                                onTap: () async {
                                  await Navigator.push(context, MaterialPageRoute(builder: (context) => QuotationScreen(existingData: q)));
                                  _fetchQuotations();
                                },
                                onLongPress: () => _showStatusSheet(q),
                                child: Padding(
                                  padding: const EdgeInsets.all(16.0),
                                  child: Row(
                                    children: [
                                      CircleAvatar(
                                        backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.1),
                                        child: Icon(Icons.description, color: theme.colorScheme.primary),
                                      ),
                                      const SizedBox(width: 16),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(q.customerName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                                            const SizedBox(height: 4),
                                            Text(q.quotationNo, style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                                            const SizedBox(height: 6),
                                            _buildStatusChip(q.status),
                                          ],
                                        ),
                                      ),
                                      Column(
                                        crossAxisAlignment: CrossAxisAlignment.end,
                                        children: [
                                          Text('₹${q.grandTotal.toStringAsFixed(0)}', style: TextStyle(fontWeight: FontWeight.bold, color: theme.colorScheme.primary, fontSize: 16)),
                                          const SizedBox(height: 4),
                                          Text(DateFormat('MMM dd, yyyy').format(q.date), style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ).animate().fade(delay: Duration(milliseconds: 50 * index)).slideX(begin: 0.1);
                          },
                        ),
                      ),
          ),
          CraftedWithLoveWidget(),
        ],
      ),
      floatingActionButton: Padding(
        padding: const EdgeInsets.only(bottom: 48.0),
        child: FloatingActionButton.extended(
          onPressed: () async {
            await Navigator.push(context, MaterialPageRoute(builder: (context) => QuotationScreen()));
            _fetchQuotations();
          },
          icon: const Icon(Icons.add),
          label: const Text('New Quotation'),
        ).animate().scale(delay: 500.ms),
      ),
    );
  }
}
