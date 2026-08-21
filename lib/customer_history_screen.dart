import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:toastification/toastification.dart';
import 'app_state.dart';
import 'models.dart';
import 'models_extra.dart';
import 'quotation_screen.dart';
import 'supabase_config.dart';

class CustomerHistoryScreen extends StatefulWidget {
  final String customerName;
  final String? customerId;

  const CustomerHistoryScreen({
    super.key,
    required this.customerName,
    this.customerId,
  });

  @override
  State<CustomerHistoryScreen> createState() => _CustomerHistoryScreenState();
}

class _CustomerHistoryScreenState extends State<CustomerHistoryScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  CustomerHistory? _history;
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _fetchHistory();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _fetchHistory() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final response = await SupabaseConfig.client.rpc(
        'customer_history',
        params: {
          'p_cid': clientId,
          'p_customer_name': widget.customerName,
          if (widget.customerId != null && widget.customerId!.isNotEmpty)
            'p_customer_id': widget.customerId,
        },
      );

      if (!mounted) return;

      final json = (response as Map).cast<String, dynamic>();
      setState(() {
        _history = CustomerHistory.fromRpc(json, fallbackName: widget.customerName);
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
      toastification.show(
        context: context,
        title: const Text('Failed to load history'),
        description: Text(e.toString()),
        type: ToastificationType.error,
        style: ToastificationStyle.fillColored,
        autoCloseDuration: const Duration(seconds: 5),
        alignment: Alignment.bottomCenter,
      );
    }
  }

  Future<void> _onRefresh() async {
    await _fetchHistory();
  }

  Future<void> _openQuotation(CustomerHistoryQuote quote) async {
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final response = await SupabaseConfig.client
          .from('quotations')
          .select('*, measured_items(*), unmeasured_items(*)')
          .eq('id', quote.id)
          .eq('client_id', clientId)
          .single();

      if (!mounted) return;

      final fullQuote = QuotationData.fromMap(response);
      await Navigator.push(
        context,
        MaterialPageRoute(builder: (context) => QuotationScreen(existingData: fullQuote)),
      );
      _fetchHistory();
    } catch (e) {
      if (!mounted) return;
      toastification.show(
        context: context,
        title: const Text('Failed to open quotation'),
        description: Text(e.toString()),
        type: ToastificationType.error,
        style: ToastificationStyle.fillColored,
        autoCloseDuration: const Duration(seconds: 5),
        alignment: Alignment.bottomCenter,
      );
    }
  }

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'draft':
        return Colors.grey.shade400;
      case 'sent':
        return Colors.blue.shade400;
      case 'won':
        return Colors.green.shade500;
      case 'lost':
        return Colors.red.shade400;
      default:
        return Colors.grey.shade400;
    }
  }

  Widget _buildStatusChip(String status) {
    final color = _statusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.5), width: 1),
      ),
      child: Text(
        status.toUpperCase(),
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color),
      ),
    );
  }

  Color _paymentStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'paid':
        return Colors.green.shade500;
      case 'partial':
        return Colors.orange.shade500;
      case 'unpaid':
      default:
        return Colors.red.shade400;
    }
  }

  Widget _buildPaymentStatusChip(String status) {
    final color = _paymentStatusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.5), width: 1),
      ),
      child: Text(
        status.toUpperCase(),
        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: color),
      ),
    );
  }

  Widget _buildViewedIndicator(CustomerHistoryQuote quote) {
    if (!quote.wasOpened) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.indigo.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.indigo.withValues(alpha: 0.5), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.visibility, size: 10, color: Colors.indigo),
          const SizedBox(width: 4),
          Text(
            quote.viewCount > 1 ? '${quote.viewCount}x viewed' : 'Viewed',
            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Colors.indigo),
          ),
        ],
      ),
    );
  }

  Widget _buildSummaryCard(CustomerHistory history) {
    final theme = Theme.of(context);
    final currFmt = NumberFormat.compactCurrency(locale: 'en_IN', symbol: '₹');

    return Card(
      margin: const EdgeInsets.all(16),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              history.customerName,
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: theme.colorScheme.primary,
              ),
            ),
            if (history.customerId != null) ...[
              const SizedBox(height: 4),
              Text(
                'ID: ${history.customerId}',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
              ),
            ],
            const SizedBox(height: 20),
            Row(
              children: [
                _buildStatItem(
                  'Total Quoted',
                  currFmt.format(history.totalQuoted),
                  Icons.attach_money,
                  Colors.blue,
                ),
                const SizedBox(width: 12),
                _buildStatItem(
                  'Total Paid',
                  currFmt.format(history.totalPaid),
                  Icons.check_circle,
                  Colors.green,
                ),
                const SizedBox(width: 12),
                _buildStatItem(
                  'Balance',
                  currFmt.format(history.balance),
                  history.balance > 0 ? Icons.warning : Icons.check_circle_outline,
                  history.balance > 0 ? Colors.orange : Colors.green,
                ),
                const SizedBox(width: 12),
                _buildStatItem(
                  'Win Rate',
                  '${history.winRate.toStringAsFixed(1)}%',
                  Icons.emoji_events,
                  Colors.amber,
                ),
              ],
            ),
          ],
        ),
      ),
    ).animate().fade().slideY(begin: -0.1);
  }

  Widget _buildStatItem(String label, String value, IconData icon, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(height: 8),
            Text(
              value,
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: color),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            Text(label, style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
          ],
        ),
      ),
    );
  }

  Widget _buildQuotationsTab() {
    if (_history == null) return const SizedBox.shrink();

    final quotes = _history!.quotations;

    if (quotes.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.description_outlined, size: 60, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text('No quotations found', style: TextStyle(color: Colors.grey.shade500, fontSize: 18)),
          ],
        ),
      ).animate().fade();
    }

    return RefreshIndicator(
      onRefresh: _onRefresh,
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        itemCount: quotes.length,
        itemBuilder: (context, index) {
          final quote = quotes[index];
          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: () => _openQuotation(quote),
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        CircleAvatar(
                          backgroundColor: _statusColor(quote.status).withValues(alpha: 0.1),
                          child: Icon(Icons.description, color: _statusColor(quote.status)),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                quote.quoteNo,
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                DateFormat('MMM dd, yyyy').format(quote.createdAt),
                                style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                              ),
                            ],
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              '₹${quote.grandTotal.toStringAsFixed(2)}',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: Theme.of(context).colorScheme.primary,
                                fontSize: 16,
                              ),
                            ),
                            const SizedBox(height: 4),
                            _buildStatusChip(quote.status),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _buildPaymentStatusChip(quote.paymentStatus),
                        _buildViewedIndicator(quote),
                        if (quote.reference.isNotEmpty)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: Colors.grey.shade100,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: Colors.grey.shade300),
                            ),
                            child: Text(
                              'Ref: ${quote.reference}',
                              style: TextStyle(fontSize: 10, color: Colors.grey.shade700),
                            ),
                          ),
                      ],
                    ),
                    if (quote.balance > 0) ...[
                      const SizedBox(height: 8),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: Colors.orange.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.orange.withValues(alpha: 0.3)),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.info_outline, size: 16, color: Colors.orange),
                            const SizedBox(width: 8),
                            Text(
                              'Balance: ₹${quote.balance.toStringAsFixed(2)}  ·  Paid: ₹${quote.amountPaid.toStringAsFixed(2)}',
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: Colors.orange.shade800),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ).animate().fade(delay: Duration(milliseconds: 50 * index)).slideX(begin: 0.1);
        },
      ),
    );
  }

  Widget _buildPaymentsTab() {
    if (_history == null) return const SizedBox.shrink();

    final payments = _history!.payments;

    if (payments.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.payment_outlined, size: 60, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text('No payments found', style: TextStyle(color: Colors.grey.shade500, fontSize: 18)),
          ],
        ),
      ).animate().fade();
    }

    return RefreshIndicator(
      onRefresh: _onRefresh,
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        itemCount: payments.length,
        itemBuilder: (context, index) {
          final payment = payments[index];
          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Row(
                children: [
                  CircleAvatar(
                    backgroundColor: Colors.green.withValues(alpha: 0.1),
                    child: const Icon(Icons.payment, color: Colors.green),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '₹${payment.amount.toStringAsFixed(2)}',
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Colors.green),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          DateFormat('MMM dd, yyyy • hh:mm a').format(payment.paidAt),
                          style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: payment.methodLabel == 'UPI'
                              ? Colors.indigo.withValues(alpha: 0.15)
                              : payment.methodLabel == 'CASH'
                                  ? Colors.green.withValues(alpha: 0.15)
                                  : Colors.blue.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          payment.methodLabel,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: payment.methodLabel == 'UPI'
                                ? Colors.indigo
                                : payment.methodLabel == 'CASH'
                                    ? Colors.green
                                    : Colors.blue,
                          ),
                        ),
                      ),
                      if (payment.reference.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          'Ref: ${payment.reference}',
                          style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ).animate().fade(delay: Duration(milliseconds: 50 * index)).slideX(begin: 0.1);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {

    if (_isLoading) {
      return Scaffold(
        appBar: AppBar(
          title: Text('History: ${widget.customerName}', style: const TextStyle(fontWeight: FontWeight.bold)),
        ),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_error != null && _history == null) {
      return Scaffold(
        appBar: AppBar(
          title: Text('History: ${widget.customerName}', style: const TextStyle(fontWeight: FontWeight.bold)),
          actions: [
            IconButton(icon: const Icon(Icons.refresh), onPressed: _fetchHistory),
          ],
        ),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.error_outline, size: 60, color: Colors.red.shade400),
              const SizedBox(height: 16),
              Text('Failed to load history', style: TextStyle(color: Colors.grey.shade600, fontSize: 18)),
              const SizedBox(height: 8),
              Text(_error!, style: TextStyle(color: Colors.grey.shade500, fontSize: 14), textAlign: TextAlign.center),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                icon: const Icon(Icons.refresh),
                label: const Text('Retry'),
                onPressed: _fetchHistory,
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text('History: ${widget.customerName}', style: const TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _onRefresh),
        ],
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            Tab(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.description, size: 18),
                  const SizedBox(width: 6),
                  Text('Quotations (${_history?.quoteCount ?? 0})'),
                ],
              ),
            ),
            Tab(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.payment, size: 18),
                  const SizedBox(width: 6),
                  Text('Payments (${_history?.paymentCount ?? 0})'),
                ],
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          if (_history != null) _buildSummaryCard(_history!),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildQuotationsTab(),
                _buildPaymentsTab(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}