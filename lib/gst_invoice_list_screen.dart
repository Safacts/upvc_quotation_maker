import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'gst_invoice_model.dart';
import 'gst_invoice_screen.dart';
import 'supabase_config.dart';
import 'app_state.dart';

class GstInvoiceListScreen extends StatefulWidget {
  const GstInvoiceListScreen({Key? key}) : super(key: key);

  @override
  _GstInvoiceListScreenState createState() => _GstInvoiceListScreenState();
}

class _GstInvoiceListScreenState extends State<GstInvoiceListScreen> {
  List<GstInvoiceData> _invoices = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchInvoices();
  }

  Future<void> _fetchInvoices() async {
    setState(() => _isLoading = true);
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final response = await SupabaseConfig.client
          .from('gst_invoices')
          .select()
          .eq('client_id', clientId)
          .order('created_at', ascending: false);

      if (!mounted) return;
      setState(() {
        _invoices = (response as List).map((e) => GstInvoiceData.fromMap(e)).toList();
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _isLoading = false);
      debugPrint('GST invoice fetch error: $e');
    }
  }

  Color _statusColor(GstInvoiceStatus s) {
    switch (s) {
      case GstInvoiceStatus.draft: return Colors.grey.shade400;
      case GstInvoiceStatus.sent:  return Colors.blue.shade400;
      case GstInvoiceStatus.paid:  return Colors.green.shade500;
      case GstInvoiceStatus.cancelled: return Colors.red.shade400;
    }
  }

  Widget _buildStatusChip(GstInvoiceStatus s) {
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('GST Invoices', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _invoices.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.receipt_long, size: 60, color: Colors.grey.shade400),
                      const SizedBox(height: 16),
                      Text('No GST invoices yet', style: TextStyle(color: Colors.grey.shade500, fontSize: 18)),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _fetchInvoices,
                  child: ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    itemCount: _invoices.length,
                    itemBuilder: (context, index) {
                      final inv = _invoices[index];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 12),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(20),
                          onTap: () async {
                            await Navigator.push(context, MaterialPageRoute(builder: (context) => GstInvoiceScreen(existingData: inv)));
                            _fetchInvoices();
                          },
                          child: Padding(
                            padding: const EdgeInsets.all(16.0),
                            child: Row(
                              children: [
                                CircleAvatar(
                                  backgroundColor: theme.colorScheme.primary.withOpacity(0.1),
                                  child: Icon(Icons.receipt_long, color: theme.colorScheme.primary),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        inv.buyerName.isEmpty ? 'Untitled Invoice' : inv.buyerName,
                                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(inv.invoiceNumber, style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                                      const SizedBox(height: 6),
                                      _buildStatusChip(inv.status),
                                    ],
                                  ),
                                ),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text('₹${inv.grandTotal.toStringAsFixed(0)}', style: TextStyle(fontWeight: FontWeight.bold, color: theme.colorScheme.primary, fontSize: 16)),
                                    const SizedBox(height: 4),
                                    Text(DateFormat('MMM dd, yyyy').format(inv.invoiceDate), style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          await Navigator.push(context, MaterialPageRoute(builder: (context) => GstInvoiceScreen()));
          _fetchInvoices();
        },
        icon: const Icon(Icons.add),
        label: const Text('New GST Invoice'),
      ),
    );
  }
}
