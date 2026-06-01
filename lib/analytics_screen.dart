import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'supabase_config.dart';
import 'theme.dart';

class AnalyticsScreen extends StatefulWidget {
  @override
  _AnalyticsScreenState createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  bool _isLoading = true;
  int _totalQuotations = 0;
  int _totalEmails = 0;
  double _totalRevenue = 0.0;

  @override
  void initState() {
    super.initState();
    _fetchAnalytics();
  }

  Future<void> _fetchAnalytics() async {
    setState(() => _isLoading = true);
    try {
      // 1. Fetch total quotations
      final quotesResp = await SupabaseConfig.client.from('quotations').select('id, transport_cost');
      _totalQuotations = (quotesResp as List).length;

      // 2. Fetch total emails
      final emailsResp = await SupabaseConfig.client.from('sent_emails').select('id');
      _totalEmails = (emailsResp as List).length;

      // 3. Calculate total revenue
      double total = 0.0;
      for (var q in quotesResp) {
        total += (q['transport_cost'] ?? 0).toDouble();
      }
      
      // Also get all items to sum up the actual amount
      final mItemsResp = await SupabaseConfig.client.from('measured_items').select('width, height, units, rate');
      for (var item in mItemsResp as List) {
        double w = (item['width'] ?? 0).toDouble();
        double h = (item['height'] ?? 0).toDouble();
        int u = item['units'] ?? 1;
        double r = (item['rate'] ?? 0).toDouble();
        double sft = (w / 304.8) * (h / 304.8);
        total += (sft * u * r);
      }

      final umItemsResp = await SupabaseConfig.client.from('unmeasured_items').select('units, rate');
      for (var item in umItemsResp as List) {
        int u = item['units'] ?? 1;
        double r = (item['rate'] ?? 0).toDouble();
        total += (u * r);
      }

      _totalRevenue = total;

    } catch (e) {
      debugPrint('Analytics Fetch error: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Widget _buildStatCard(String title, String value, IconData icon, Color color, int delay) {
    return Card(
      elevation: 8,
      shadowColor: color.withOpacity(0.3),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: LinearGradient(
            colors: [color.withOpacity(0.1), Colors.white],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: color.withOpacity(0.2),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 36, color: color),
            ),
            const SizedBox(width: 20),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(fontSize: 16, color: Colors.grey.shade600, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  Text(value, style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: color)),
                ],
              ),
            ),
          ],
        ),
      ),
    ).animate().fade(delay: Duration(milliseconds: delay)).slideX(begin: 0.2);
  }

  @override
  Widget build(BuildContext context) {
    final NumberFormat currencyFormat = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

    return Scaffold(
      appBar: AppBar(title: const Text('Analytics & Performance')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Overview', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)).animate().fade(),
                  const SizedBox(height: 20),
                  _buildStatCard('Total Revenue Quoted', currencyFormat.format(_totalRevenue), Icons.currency_rupee, Colors.green, 100),
                  const SizedBox(height: 16),
                  _buildStatCard('Quotations Generated', _totalQuotations.toString(), Icons.request_quote, Colors.blue, 200),
                  const SizedBox(height: 16),
                  _buildStatCard('Total Emails Sent', _totalEmails.toString(), Icons.mark_email_read, Colors.purple, 300),
                ],
              ),
            ),
    );
  }
}
