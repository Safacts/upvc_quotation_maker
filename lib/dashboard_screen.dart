import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:intl/intl.dart';
import 'supabase_config.dart';
import 'models.dart';
import 'quotation_screen.dart';
import 'login_screen.dart';

class DashboardScreen extends StatefulWidget {
  @override
  _DashboardScreenState createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final _storage = FlutterSecureStorage();
  List<QuotationData> _quotations = [];
  List<QuotationData> _filteredQuotations = [];
  bool _isLoading = true;
  String _searchQuery = '';

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

      final List<QuotationData> fetched = (response as List).map((e) => QuotationData.fromMap(e)).toList();
      
      setState(() {
        _quotations = fetched;
        _filteredQuotations = fetched;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to load quotations: $e')));
    }
  }

  void _filterQuotations(String query) {
    setState(() {
      _searchQuery = query.toLowerCase();
      _filteredQuotations = _quotations.where((q) {
        return q.customerName.toLowerCase().contains(_searchQuery) ||
               q.contactNo.toLowerCase().contains(_searchQuery) ||
               q.quotationNo.toLowerCase().contains(_searchQuery);
      }).toList();
    });
  }

  void _logout() async {
    await _storage.delete(key: 'is_logged_in');
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (context) => LoginScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Dashboard', style: TextStyle(color: Colors.white)),
        backgroundColor: Color(0xFF1E3A5F),
        actions: [
          IconButton(icon: Icon(Icons.refresh, color: Colors.white), onPressed: _fetchQuotations),
          IconButton(icon: Icon(Icons.logout, color: Colors.white), onPressed: _logout),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12.0),
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Search by Name, Contact, or Quote No...',
                prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                contentPadding: EdgeInsets.zero,
              ),
              onChanged: _filterQuotations,
            ),
          ),
          Expanded(
            child: _isLoading 
              ? Center(child: CircularProgressIndicator())
              : _filteredQuotations.isEmpty
                ? Center(child: Text('No quotations found.'))
                : ListView.builder(
                    itemCount: _filteredQuotations.length,
                    itemBuilder: (context, index) {
                      final q = _filteredQuotations[index];
                      return Card(
                        margin: EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        child: ListTile(
                          title: Text(q.customerName, style: TextStyle(fontWeight: FontWeight.bold)),
                          subtitle: Text('${q.quotationNo} | ${DateFormat('dd-MMM-yyyy').format(q.date)}'),
                          trailing: Icon(Icons.chevron_right),
                          onTap: () {
                            // Open existing quotation (view mode or edit mode)
                            // For simplicity, we just pass it to QuotationScreen
                            // QuotationScreen would need to be updated to accept an existing QuotationData
                            Navigator.push(
                              context,
                              MaterialPageRoute(builder: (context) => QuotationScreen(existingData: q)),
                            );
                          },
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (context) => QuotationScreen()),
          ).then((_) => _fetchQuotations()); // Refresh when coming back
        },
        backgroundColor: Color(0xFF1E3A5F),
        child: Icon(Icons.add, color: Colors.white),
      ),
    );
  }
}
