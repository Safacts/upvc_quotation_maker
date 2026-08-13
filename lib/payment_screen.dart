import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:toastification/toastification.dart';
import '../app_state.dart';
import '../models.dart';
import '../models_extra.dart';
import '../supabase_config.dart';

class PaymentScreen extends StatefulWidget {
  final QuotationData quotation;

  const PaymentScreen({super.key, required this.quotation});

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  List<Payment> _payments = [];
  bool _isLoading = true;
  bool _isSaving = false;

  // Payment form
  final _amountController = TextEditingController();
  final _referenceController = TextEditingController();
  final _noteController = TextEditingController();
  String _selectedMethod = 'upi';
  bool _showForm = false;

  @override
  void initState() {
    super.initState();
    _loadPayments();
    // Pre-fill amount with remaining balance
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final remaining = widget.quotation.grandTotal - _totalPaid;
      if (remaining > 0) {
        _amountController.text = remaining.toStringAsFixed(2);
      }
    });
  }

  @override
  void dispose() {
    _amountController.dispose();
    _referenceController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  double get _totalPaid => _payments.fold(0.0, (sum, p) => sum + p.amount);
  double get _balance => widget.quotation.grandTotal - _totalPaid;
  String get _paymentStatus {
    if (_totalPaid <= 0) return 'unpaid';
    if (_totalPaid >= widget.quotation.grandTotal) return 'paid';
    return 'partial';
  }

  Color get _statusColor {
    switch (_paymentStatus) {
      case 'paid': return Colors.green;
      case 'partial': return Colors.orange;
      default: return Colors.red;
    }
  }

  String get _statusLabel {
    switch (_paymentStatus) {
      case 'paid': return 'PAID';
      case 'partial': return 'PARTIAL';
      default: return 'UNPAID';
    }
  }

  Future<void> _loadPayments() async {
    setState(() => _isLoading = true);
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final response = await SupabaseConfig.client
          .from('payments')
          .select()
          .eq('quotation_id', widget.quotation.id ?? '')
          .eq('client_id', clientId)
          .order('paid_at', ascending: false);

      if (mounted) {
        setState(() {
          _payments = (response as List).map((e) => Payment.fromMap(e)).toList();
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        // Table might not exist yet — that's OK
        debugPrint('Payments load error (table may not exist): $e');
      }
    }
  }

  Future<void> _recordPayment() async {
    final amount = double.tryParse(_amountController.text) ?? 0;
    if (amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a valid amount'), backgroundColor: Colors.red),
      );
      return;
    }

    setState(() => _isSaving = true);
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final payment = Payment(
        quotationId: widget.quotation.id,
        customerName: widget.quotation.customerName,
        amount: amount,
        method: _selectedMethod,
        reference: _referenceController.text.trim(),
        note: _noteController.text.trim(),
      );

      await SupabaseConfig.client
          .from('payments')
          .insert(payment.toMap(clientId: clientId));

      // Update quotation payment status
      final newStatus = _totalPaid + amount >= widget.quotation.grandTotal
          ? 'paid'
          : (_totalPaid + amount > 0 ? 'partial' : 'unpaid');

      if (widget.quotation.id != null) {
        await SupabaseConfig.client
            .from('quotations')
            .update({'payment_status': newStatus})
            .eq('id', widget.quotation.id!)
            .eq('client_id', clientId);
      }

      _amountController.clear();
      _referenceController.clear();
      _noteController.clear();
      setState(() => _showForm = false);
      await _loadPayments();

      if (mounted) {
        toastification.show(
          context: context,
          title: const Text('Payment recorded'),
          type: ToastificationType.success,
          style: ToastificationStyle.fillColored,
          autoCloseDuration: const Duration(seconds: 2),
          alignment: Alignment.bottomCenter,
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to record payment: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  void _copyUpiId() {
    Clipboard.setData(const ClipboardData(text: '6304562779@nyes'));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('UPI ID copied'), backgroundColor: Colors.green),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final q = widget.quotation;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Payment'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Quotation summary
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(q.quotationNo, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                                  const SizedBox(height: 4),
                                  Text(q.customerName, style: TextStyle(color: Colors.grey.shade600)),
                                ],
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                decoration: BoxDecoration(
                                  color: _statusColor.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(20),
                                  border: Border.all(color: _statusColor.withValues(alpha: 0.5)),
                                ),
                                child: Text(
                                  _statusLabel,
                                  style: TextStyle(fontWeight: FontWeight.bold, color: _statusColor, fontSize: 12),
                                ),
                              ),
                            ],
                          ),
                          const Divider(height: 24),
                          _buildAmountRow('Quotation Total', q.grandTotal, isBold: true),
                          _buildAmountRow('Amount Paid', _totalPaid, color: Colors.green),
                          _buildAmountRow('Balance Due', _balance, color: Colors.red, isBold: true),
                        ],
                      ),
                    ),
                  ).animate().fade().slideY(begin: -0.1),

                  // UPI QR Section
                  const SizedBox(height: 16),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        children: [
                          const Text('UPI Payment', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                          const SizedBox(height: 12),
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: Colors.grey.shade300),
                            ),
                            child: Column(
                              children: [
                                // Simulated QR code area
                                Container(
                                  width: 160,
                                  height: 160,
                                  decoration: BoxDecoration(
                                    color: Colors.grey.shade100,
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(Icons.qr_code_2, size: 80, color: Colors.grey.shade400),
                                      const SizedBox(height: 8),
                                      Text('UPI QR', style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
                                    ],
                                  ),
                                ),
                                const SizedBox(height: 12),
                                Text('Scan to pay ₹${_balance.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w600)),
                                const SizedBox(height: 8),
                                InkWell(
                                  onTap: _copyUpiId,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                                    decoration: BoxDecoration(
                                      color: Colors.grey.shade100,
                                      borderRadius: BorderRadius.circular(20),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Text('6304562779@nyes', style: TextStyle(fontFamily: 'monospace', fontSize: 13, color: Colors.grey.shade700)),
                                        const SizedBox(width: 8),
                                        Icon(Icons.copy, size: 16, color: Colors.grey.shade500),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ).animate().fade(delay: 100.ms).slideY(begin: 0.1),

                  // Record Payment Button
                  const SizedBox(height: 16),
                  if (!_showForm)
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: ElevatedButton.icon(
                        onPressed: _balance <= 0 ? null : () => setState(() => _showForm = true),
                        icon: const Icon(Icons.payment),
                        label: Text(_balance <= 0 ? 'Fully Paid' : 'Record Payment'),
                      ),
                    ),

                  // Payment Form
                  if (_showForm) ...[
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text('Record Payment', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                                IconButton(
                                  icon: const Icon(Icons.close),
                                  onPressed: () => setState(() => _showForm = false),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            TextField(
                              controller: _amountController,
                              keyboardType: TextInputType.number,
                              decoration: const InputDecoration(
                                labelText: 'Amount (₹)',
                                border: OutlineInputBorder(),
                                prefixIcon: Icon(Icons.currency_rupee),
                              ),
                            ),
                            const SizedBox(height: 12),
                            const Text('Payment Method', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: Payment.methods.map((method) {
                                final isSelected = _selectedMethod == method;
                                return ChoiceChip(
                                  label: Text(Payment(method: method).methodLabel),
                                  selected: isSelected,
                                  selectedColor: theme.colorScheme.primary,
                                  labelStyle: TextStyle(
                                    color: isSelected ? Colors.white : Colors.grey.shade700,
                                    fontSize: 13,
                                  ),
                                  onSelected: (_) => setState(() => _selectedMethod = method),
                                );
                              }).toList(),
                            ),
                            const SizedBox(height: 12),
                            TextField(
                              controller: _referenceController,
                              decoration: const InputDecoration(
                                labelText: 'Reference / Transaction ID',
                                border: OutlineInputBorder(),
                              ),
                            ),
                            const SizedBox(height: 12),
                            TextField(
                              controller: _noteController,
                              decoration: const InputDecoration(
                                labelText: 'Note (optional)',
                                border: OutlineInputBorder(),
                              ),
                              maxLines: 2,
                            ),
                            const SizedBox(height: 16),
                            SizedBox(
                              width: double.infinity,
                              child: ElevatedButton(
                                onPressed: _isSaving ? null : _recordPayment,
                                child: _isSaving
                                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                    : const Text('Save Payment'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ).animate().fade().slideY(begin: 0.1),
                  ],

                  // Payment History
                  if (_payments.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    Text('Payment History', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: theme.primaryColor)),
                    const SizedBox(height: 8),
                    ...List.generate(_payments.length, (i) {
                      final p = _payments[i];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: Colors.green.withValues(alpha: 0.1),
                            child: const Icon(Icons.check, color: Colors.green, size: 20),
                          ),
                          title: Text(
                            '₹${p.amount.toStringAsFixed(2)}',
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                          subtitle: Text(
                            '${p.methodLabel}${p.reference.isNotEmpty ? " · ${p.reference}" : ""}',
                            style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                          ),
                          trailing: Text(
                            DateFormat('dd MMM, HH:mm').format(p.paidAt),
                            style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                          ),
                        ),
                      );
                    }),
                  ],

                  const SizedBox(height: 24),
                ],
              ),
            ),
    );
  }

  Widget _buildAmountRow(String label, double amount, {bool isBold = false, Color? color}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(
            fontSize: isBold ? 15 : 14,
            fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
          )),
          Text(
            '₹${amount.toStringAsFixed(2)}',
            style: TextStyle(
              fontSize: isBold ? 15 : 14,
              fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}
