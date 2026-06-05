import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'models.dart';
import 'quotation_screen.dart';
import 'supabase_config.dart';
import 'login_screen.dart';
import 'settings_screen.dart';
import 'about_screen.dart';
import 'crafted_widget.dart';
import 'email_portal_screen.dart';
import 'analytics_screen.dart';
import 'theme.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class DashboardScreen extends StatefulWidget {
  @override
  _DashboardScreenState createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  List<QuotationData> _quotations = [];
  bool _isLoading = true;
  String _searchQuery = '';

  String _filterType = 'Newest';

  @override
  void initState() {
    super.initState();
    _fetchQuotations();
  }

  Future<void> _fetchQuotations() async {
    setState(() => _isLoading = true);
    try {
      final response = await SupabaseConfig.client
          .from('quotations')
          .select()
          .order('created_at', ascending: false);
      
      setState(() {
        _quotations = (response as List).map((e) => QuotationData.fromMap(e)).toList();
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      debugPrint('Fetch error: $e');
    }
  }

  void _logout() async {
    const storage = FlutterSecureStorage();
    await storage.delete(key: 'session_active');
    if (!mounted) return;
    Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => LoginScreen()));
  }

  Widget _buildTopTile({required String title, required IconData icon, required VoidCallback onTap, required LinearGradient gradient, required int delay}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        height: 120,
        decoration: BoxDecoration(
          gradient: gradient,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [BoxShadow(color: gradient.colors.first.withOpacity(0.4), blurRadius: 10, offset: const Offset(0, 5))],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 40, color: Colors.white),
            const SizedBox(height: 10),
            Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
          ],
        ),
      ),
    ).animate().scale(delay: Duration(milliseconds: delay));
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
    } else {
      filteredQuotations.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
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
                    child: Image.asset('assets/logo.png', width: 60, height: 60, fit: BoxFit.contain),
                  ),
                  const SizedBox(height: 10),
                  const Text('Venkateshwara UPVC', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
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
                Navigator.push(context, MaterialPageRoute(builder: (context) => AnalyticsScreen()));
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
            padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
            child: Wrap(
              spacing: 16,
              runSpacing: 16,
              children: [
                SizedBox(
                  width: (MediaQuery.of(context).size.width / 2) - 24,
                  child: _buildTopTile(
                    title: 'New Quotation',
                    icon: Icons.add_circle_outline,
                    gradient: AppTheme.primaryGradient,
                    delay: 100,
                    onTap: () async {
                      await Navigator.push(context, MaterialPageRoute(builder: (context) => QuotationScreen()));
                      _fetchQuotations();
                    },
                  ),
                ),
                SizedBox(
                  width: (MediaQuery.of(context).size.width / 2) - 24,
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
