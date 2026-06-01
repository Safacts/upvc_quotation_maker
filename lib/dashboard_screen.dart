import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'supabase_config.dart';
import 'models.dart';
import 'quotation_screen.dart';
import 'login_screen.dart';
import 'settings_screen.dart';
import 'about_screen.dart';

class DashboardScreen extends StatefulWidget {
  @override
  _DashboardScreenState createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  List<QuotationData> allQuotations = [];
  List<QuotationData> filteredQuotations = [];
  bool isLoading = true;
  String searchQuery = '';

  @override
  void initState() {
    super.initState();
    _fetchQuotations();
  }

  Future<void> _fetchQuotations() async {
    setState(() => isLoading = true);
    try {
      final response = await SupabaseConfig.client
          .from('quotations')
          .select()
          .order('created_at', ascending: false);

      final List<QuotationData> fetchedData = (response as List).map((e) => QuotationData.fromMap(e)).toList();

      setState(() {
        allQuotations = fetchedData;
        filteredQuotations = fetchedData;
        isLoading = false;
      });
    } catch (e) {
      debugPrint('Error fetching quotations: $e');
      setState(() => isLoading = false);
    }
  }

  void _filterQuotations(String query) {
    setState(() {
      searchQuery = query;
      filteredQuotations = allQuotations.where((quote) {
        return quote.customerName.toLowerCase().contains(query.toLowerCase()) ||
               quote.quotationNo.toLowerCase().contains(query.toLowerCase()) ||
               quote.contactNo.contains(query);
      }).toList();
    });
  }

  void _logout() {
    Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => LoginScreen()));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Quotations Dashboard', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
      drawer: Drawer(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            DrawerHeader(
              decoration: BoxDecoration(
                color: theme.primaryColor,
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Icon(Icons.dashboard, color: Colors.white, size: 40),
                  SizedBox(height: 10),
                  Text('Venkateshwara UPVC', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                  Text('jvenkateshupvc@gmail.com', style: TextStyle(color: Colors.white70, fontSize: 14)),
                ],
              ),
            ),
            ListTile(
              leading: const Icon(Icons.settings),
              title: const Text('Settings'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(context, MaterialPageRoute(builder: (context) => SettingsScreen()));
              },
            ),
            ListTile(
              leading: const Icon(Icons.info_outline),
              title: const Text('About'),
              onTap: () {
                Navigator.pop(context);
                Navigator.push(context, MaterialPageRoute(builder: (context) => AboutScreen()));
              },
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.logout, color: Colors.redAccent),
              title: const Text('Logout', style: TextStyle(color: Colors.redAccent)),
              onTap: _logout,
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Search by name, quote no, or phone...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _filterQuotations('');
                          FocusScope.of(context).unfocus();
                        },
                      )
                    : null,
              ),
              onChanged: _filterQuotations,
            ).animate().fade().slideY(begin: -0.2),
          ),
          Expanded(
            child: isLoading
                ? const Center(child: CircularProgressIndicator())
                : filteredQuotations.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.inbox, size: 60, color: Colors.grey.shade400),
                            const SizedBox(height: 16),
                            Text('No quotations found', style: TextStyle(color: Colors.grey.shade600, fontSize: 16)),
                          ],
                        ),
                      ).animate().fade()
                    : RefreshIndicator(
                        onRefresh: _fetchQuotations,
                        child: ListView.builder(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          itemCount: filteredQuotations.length,
                          itemBuilder: (context, index) {
                            final quote = filteredQuotations[index];
                            return Card(
                              margin: const EdgeInsets.only(bottom: 12),
                              child: InkWell(
                                borderRadius: BorderRadius.circular(16),
                                onTap: () async {
                                  await Navigator.push(context, MaterialPageRoute(builder: (context) => QuotationScreen(existingData: quote)));
                                  _fetchQuotations();
                                },
                                child: Padding(
                                  padding: const EdgeInsets.all(16.0),
                                  child: Row(
                                    children: [
                                      Container(
                                        padding: const EdgeInsets.all(12),
                                        decoration: BoxDecoration(
                                          color: theme.colorScheme.secondary.withOpacity(0.1),
                                          shape: BoxShape.circle,
                                        ),
                                        child: Icon(Icons.receipt_long, color: theme.colorScheme.secondary),
                                      ),
                                      const SizedBox(width: 16),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(quote.customerName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                                            const SizedBox(height: 4),
                                            Text('Quote: ${quote.quotationNo}', style: TextStyle(color: theme.textTheme.bodySmall?.color)),
                                            Text('Date: ${DateFormat('dd-MMM-yyyy').format(quote.date)}', style: TextStyle(color: theme.textTheme.bodySmall?.color)),
                                          ],
                                        ),
                                      ),
                                      const Icon(Icons.chevron_right, color: Colors.grey),
                                    ],
                                  ),
                                ),
                              ),
                            ).animate().fade(delay: Duration(milliseconds: 50 * index)).slideX(begin: 0.1);
                          },
                        ),
                      ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: const Text('New Quotation'),
        onPressed: () async {
          await Navigator.push(context, MaterialPageRoute(builder: (context) => QuotationScreen()));
          _fetchQuotations();
        },
      ).animate().scale(delay: const Duration(milliseconds: 300)),
    );
  }
}
