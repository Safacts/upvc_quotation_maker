import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'models.dart';
import 'app_state.dart';
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
  double _totalSubtotal = 0.0;
  double _totalIgst = 0.0;
  double _totalTransport = 0.0;

  @override
  void initState() {
    super.initState();
    _fetchAnalytics();
  }

  Future<void> _fetchAnalytics() async {
    setState(() => _isLoading = true);
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      // 1. Fetch all quotations
      final quotesResp = await SupabaseConfig.client.from('quotations').select().eq('client_id', clientId);
      final quotations = (quotesResp as List).map((e) => QuotationData.fromMap(e)).toList();
      _totalQuotations = quotations.length;

      // 2. Fetch total emails
      final emailsResp = await SupabaseConfig.client.from('sent_emails').select('id').eq('client_id', clientId);
      _totalEmails = (emailsResp as List).length;

      // 3. Fetch all items
      final mItemsResp = await SupabaseConfig.client.from('measured_items').select().eq('client_id', clientId);
      final umItemsResp = await SupabaseConfig.client.from('unmeasured_items').select().eq('client_id', clientId);

      // Group items by quotation_id
      final mItemsMap = <String, List<MeasuredItem>>{};
      for (var map in mItemsResp as List) {
        final qId = map['quotation_id'] as String?;
        if (qId != null) {
          mItemsMap.putIfAbsent(qId, () => []).add(MeasuredItem.fromMap(map));
        }
      }

      final umItemsMap = <String, List<UnmeasuredItem>>{};
      for (var map in umItemsResp as List) {
        final qId = map['quotation_id'] as String?;
        if (qId != null) {
          umItemsMap.putIfAbsent(qId, () => []).add(UnmeasuredItem.fromMap(map));
        }
      }

      // Assign items to quotations & calculate sums
      double subtotal = 0.0;
      double transport = 0.0;
      double igst = 0.0;
      double grandTotal = 0.0;

      for (var q in quotations) {
        if (q.id != null) {
          q.measuredItems = mItemsMap[q.id!] ?? [];
          q.unmeasuredItems = umItemsMap[q.id!] ?? [];
          
          subtotal += q.actualAmount;
          transport += q.transport;
          igst += q.igst;
          grandTotal += q.grandTotal;
        }
      }

      setState(() {
        _totalRevenue = grandTotal;
        _totalSubtotal = subtotal;
        _totalIgst = igst;
        _totalTransport = transport;
      });

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

  Widget _buildBreakdownRow(String label, String value, {bool isBold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(fontSize: 15, fontWeight: isBold ? FontWeight.bold : FontWeight.normal)),
          Text(value, style: TextStyle(fontSize: 15, fontWeight: isBold ? FontWeight.bold : FontWeight.normal, color: isBold ? Colors.green.shade700 : null)),
        ],
      ),
    );
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
                  
                  // Detailed Financial Breakdown Card
                  Card(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Financial Details', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Theme.of(context).primaryColor)),
                          const SizedBox(height: 12),
                          const Divider(),
                          _buildBreakdownRow('Items Subtotal', currencyFormat.format(_totalSubtotal)),
                          _buildBreakdownRow('Transport Charges', currencyFormat.format(_totalTransport)),
                          _buildBreakdownRow('Total IGST', currencyFormat.format(_totalIgst)),
                          const Divider(thickness: 1.5),
                          _buildBreakdownRow('Total Quoted Value', currencyFormat.format(_totalRevenue), isBold: true),
                        ],
                      ),
                    ),
                  ).animate().fade(delay: 200.ms).slideY(begin: 0.1),
                  const SizedBox(height: 16),

                  _buildStatCard('Quotations Generated', _totalQuotations.toString(), Icons.request_quote, Colors.blue, 300),
                  const SizedBox(height: 16),
                  _buildStatCard('Total Emails Sent', _totalEmails.toString(), Icons.mark_email_read, Colors.purple, 400),
                ],
              ),
            ),
    );
  }
}
