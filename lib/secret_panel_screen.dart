import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'models.dart';
import 'app_state.dart';
import 'supabase_config.dart';
import 'package:flutter_animate/flutter_animate.dart';

class SecretPanelScreen extends StatefulWidget {
  const SecretPanelScreen({super.key});

  @override
  _SecretPanelScreenState createState() => _SecretPanelScreenState();
}

class _SecretPanelScreenState extends State<SecretPanelScreen> {
  List<QuotationData> _quotations = [];
  bool _isLoading = true;

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
    } catch (e) {
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  Future<void> _deleteQuotation(String id, String quoteNo) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Quotation'),
        content: Text('Are you sure you want to delete quotation $quoteNo?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      setState(() => _isLoading = true);
      try {
        final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
        await SupabaseConfig.client.from('quotations').delete().eq('id', id).eq('client_id', clientId);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Quotation $quoteNo deleted.')));
        _fetchQuotations();
      } catch (e) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Delete failed: $e')));
      }
    }
  }

  Future<void> _emptyDatabase() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('EMPTY DATABASE'),
        content: const Text('WARNING: This will permanently delete ALL quotations, measured items, unmeasured items, and sent email logs. This action cannot be undone. Are you absolutely sure?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Wipe Database'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      // Second validation to prevent accidental clicks
      final textController = TextEditingController();
      final doubleConfirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Type WIPE to Confirm'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Please type WIPE to confirm database reset.'),
              const SizedBox(height: 12),
              TextField(
                controller: textController,
                decoration: const InputDecoration(hintText: 'WIPE'),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
            TextButton(
              onPressed: () {
                if (textController.text.trim().toUpperCase() == 'WIPE') {
                  Navigator.pop(context, true);
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Verification failed.')));
                  Navigator.pop(context, false);
                }
              },
              style: TextButton.styleFrom(foregroundColor: Colors.red),
              child: const Text('Confirm Reset'),
            ),
          ],
        ),
      );

      if (doubleConfirmed == true) {
        setState(() => _isLoading = true);
        try {
          // Delete only THIS client's records (tenant-isolated wipe)
          final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
          await SupabaseConfig.client.from('quotations').delete().eq('client_id', clientId);
          await SupabaseConfig.client.from('sent_emails').delete().eq('client_id', clientId);
          
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Database reset successfully.')));
          _fetchQuotations();
        } catch (e) {
          setState(() => _isLoading = false);
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Database reset failed: $e')));
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Developer Panel', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: const Icon(Icons.delete_forever, color: Colors.redAccent),
            tooltip: 'Empty Database',
            onPressed: _isLoading ? null : _emptyDatabase,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _quotations.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.developer_board, size: 60, color: Colors.grey.shade400),
                      const SizedBox(height: 16),
                      Text('No data in database', style: TextStyle(color: Colors.grey.shade500, fontSize: 18)),
                    ],
                  ),
                ).animate().fade()
              : Column(
                  children: [
                    Container(
                      width: double.infinity,
                      color: Colors.red.withValues(alpha: 0.1),
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: const [
                          Icon(Icons.warning_amber_rounded, color: Colors.redAccent),
                          SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              'Danger Zone: Deletions here are permanent and cannot be recovered.',
                              style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold, fontSize: 13),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _quotations.length,
                        itemBuilder: (context, index) {
                          final q = _quotations[index];
                          return Card(
                            margin: const EdgeInsets.only(bottom: 12),
                            child: Padding(
                              padding: const EdgeInsets.all(16.0),
                              child: Row(
                                children: [
                                  CircleAvatar(
                                    backgroundColor: Colors.red.withValues(alpha: 0.1),
                                    child: const Icon(Icons.insert_drive_file, color: Colors.redAccent),
                                  ),
                                  const SizedBox(width: 16),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(q.customerName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                                        const SizedBox(height: 4),
                                        Text(q.quotationNo, style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                                        Text(DateFormat('MMM dd, yyyy').format(q.date), style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
                                      ],
                                    ),
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
                                    onPressed: () => _deleteQuotation(q.id!, q.quotationNo),
                                  ),
                                ],
                              ),
                            ),
                          ).animate().fade(delay: Duration(milliseconds: 30 * index)).slideX(begin: 0.05);
                        },
                      ),
                    ),
                  ],
                ),
    );
  }
}
