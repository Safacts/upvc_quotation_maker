import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
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

class DashboardScreen extends StatefulWidget {
  final String? initialOpenQuote;
  const DashboardScreen({Key? key, this.initialOpenQuote}) : super(key: key);

  @override
  _DashboardScreenState createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  List<QuotationData> _quotations = [];
  bool _isLoading = true;
  String _searchQuery = '';
  String _filterType = 'Newest';
  bool _hasHandledOpenQuote = false;

  @override
  void initState() {
    super.initState();
    _fetchQuotations();
  }

  Future<void> _fetchQuotations() async {
    setState(() => _isLoading = true);
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final response = await SupabaseConfig.client
          .from('quotations')
          .select()
          .eq('client_id', clientId)
          .order('created_at', ascending: false);

      setState(() {
        _quotations = (response as List).map((e) => QuotationData.fromMap(e)).toList();
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
      setState(() => _isLoading = false);
      debugPrint('Fetch error: $e');
    }
  }

  void _logout() async {
    umamiTrack('logout');
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('session_active');
    } else {
      try {
        const storage = FlutterSecureStorage();
        await storage.delete(key: 'session_active');
      } catch (_) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove('session_active');
      }
    }
    if (!mounted) return;
    Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => LoginScreen()));
  }

  Future<void> _updateStatus(QuotationData q, QuotationStatus newStatus) async {
    try {
      await SupabaseConfig.client
          .from('quotations')
          .update({'status': newStatus.value})
          .eq('id', q.id!);
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
        return Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Update Status', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: theme.primaryColor)),
              const SizedBox(height: 8),
              Text(q.customerName, style: TextStyle(color: Colors.grey.shade600)),
              const SizedBox(height: 20),
              ...QuotationStatus.values.map((s) {
                final isSelected = q.status == s;
                return ListTile(
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
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
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
        color: _statusColor(s).withOpacity(0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: _statusColor(s).withOpacity(0.5), width: 1),
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
          boxShadow: [BoxShadow(color: gradient.colors.first.withOpacity(0.4), blurRadius: 10, offset: const Offset(0, 5))],
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

  Widget _buildSummaryRow(List<QuotationData> quotations) {
    final thisMonth = DateTime.now();
    final monthQuotes = quotations.where((q) => q.createdAt.year == thisMonth.year && q.createdAt.month == thisMonth.month).toList();
    final wonQuotes = quotations.where((q) => q.status == QuotationStatus.won).toList();
    final currFmt = NumberFormat.compactCurrency(locale: 'en_IN', symbol: '₹');

    return Row(
      children: [
        _buildMiniStat('This Month', monthQuotes.length.toString(), Icons.calendar_today_outlined, Colors.indigo),
        const SizedBox(width: 8),
        _buildMiniStat('Won', wonQuotes.length.toString(), Icons.check_circle_outline, Colors.green),
        const SizedBox(width: 8),
        _buildMiniStat('Total Value', currFmt.format(quotations.fold(0.0, (s, q) => s + q.grandTotal)), Icons.currency_rupee, Colors.orange),
      ],
    ).animate().fade(delay: 100.ms).slideY(begin: 0.1);
  }

  Widget _buildMiniStat(String label, String value, IconData icon, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
        decoration: BoxDecoration(
          color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(height: 6),
            Text(value, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: color)),
            Text(label, style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
          ],
        ),
      ),
    );
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
                    padding: const EdgeInsets.all(8),
                    decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                    child: ClientLogo(config: Provider.of<AppState>(context, listen: false).clientConfig, width: 60, height: 60),
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
                if (Provider.of<AppState>(context, listen: false).clientConfig.clientId.toLowerCase() == 'kprupvc')
                  SizedBox(
                    width: (MediaQuery.of(context).size.width / 2) - 22,
                    child: _buildTopTile(
                      title: 'Market Page',
                      icon: Icons.web,
                      gradient: const LinearGradient(colors: [Color(0xFF1E3A5F), Color(0xFF2D5F8A)]),
                      delay: 300,
                      onTap: () {
                        Navigator.push(context, MaterialPageRoute(builder: (context) => const MarketPagePreviewScreen()));
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
                            Icon(Icons.inbox, size: 60, color: Colors.grey.shade400),
                            const SizedBox(height: 16),
                            Text('No quotations found', style: TextStyle(color: Colors.grey.shade500, fontSize: 18)),
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
                                        backgroundColor: theme.colorScheme.primary.withOpacity(0.1),
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
