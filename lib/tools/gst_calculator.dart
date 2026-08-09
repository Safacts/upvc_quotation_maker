import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

/// GST Calculator for Indian uPVC products and services.
///
/// Supports both Exclusive (add GST to base) and Inclusive (extract GST from total)
/// calculation modes with standard Indian GST rates (0%, 5%, 12%, 18%, 28%).
///
/// This is a free tool — no authentication required.
class GstCalculator extends StatefulWidget {
  const GstCalculator({super.key});

  @override
  State<GstCalculator> createState() => _GstCalculatorState();
}

class _GstCalculatorState extends State<GstCalculator> {
  final _amountController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  /// Available GST rates for Indian uPVC products and services.
  static const List<double> _gstRates = [0, 5, 12, 18, 28];

  double _selectedRate = 18.0; // Default 18% — typical for uPVC windows & fittings
  CalculationMode _mode = CalculationMode.exclusive;

  // Results
  double _baseAmount = 0.0;
  double _cgst = 0.0;
  double _sgst = 0.0;
  double _totalGst = 0.0;
  double _grandTotal = 0.0;
  bool _hasCalculated = false;

  final _currencyFormat = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  void _calculate() {
    if (!_formKey.currentState!.validate()) return;

    final amount = double.tryParse(_amountController.text.trim()) ?? 0.0;
    if (amount <= 0) return;

    setState(() {
      if (_mode == CalculationMode.exclusive) {
        // Exclusive mode: add GST to base amount
        _baseAmount = amount;
        _totalGst = amount * _selectedRate / 100;
        _cgst = _totalGst / 2;
        _sgst = _totalGst / 2;
        _grandTotal = amount + _totalGst;
      } else {
        // Inclusive mode: extract GST from total
        _grandTotal = amount;
        _baseAmount = amount / (1 + _selectedRate / 100);
        _totalGst = amount - _baseAmount;
        _cgst = _totalGst / 2;
        _sgst = _totalGst / 2;
      }
      _hasCalculated = true;
    });
  }

  void _reset() {
    setState(() {
      _amountController.clear();
      _selectedRate = 18.0;
      _mode = CalculationMode.exclusive;
      _baseAmount = 0.0;
      _cgst = 0.0;
      _sgst = 0.0;
      _totalGst = 0.0;
      _grandTotal = 0.0;
      _hasCalculated = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primaryColor = theme.primaryColor;

    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.calculate_rounded, color: primaryColor, size: 28),
            const SizedBox(width: 10),
            const Text('GST Calculator',
                style: TextStyle(fontWeight: FontWeight.w700)),
          ],
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: primaryColor,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Header note card
                _buildNoteCard(theme),
                const SizedBox(height: 20),

                // Input card
                _buildInputCard(theme, primaryColor),
                const SizedBox(height: 20),

                // Mode toggle card
                _buildModeCard(theme, primaryColor),
                const SizedBox(height: 24),

                // Action buttons
                _buildActionButtons(theme, primaryColor),
                const SizedBox(height: 24),

                // Results card
                if (_hasCalculated) _buildResultsCard(theme, primaryColor),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildNoteCard(ThemeData theme) {
    return Card(
      elevation: 8,
      shadowColor: Colors.blue.withValues(alpha: 0.15),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      color: Colors.blue.shade50,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(Icons.info_outline_rounded, color: Colors.blue.shade700, size: 24),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'GST rates for uPVC windows & fittings is typically 18%',
                style: TextStyle(
                  color: Colors.blue.shade800,
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInputCard(ThemeData theme, Color primaryColor) {
    return Card(
      elevation: 12,
      shadowColor: primaryColor.withValues(alpha: 0.15),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(24)),
        side: BorderSide(color: Color(0xCCFFFFFF), width: 1.5),
      ),
      color: const Color(0xCCFFFFFF),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Enter Details',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: primaryColor,
              ),
            ),
            const SizedBox(height: 20),

            // Amount field
            TextFormField(
              controller: _amountController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d{0,2}')),
              ],
              validator: (value) {
                if (value == null || value.trim().isEmpty) {
                  return 'Please enter an amount';
                }
                final num = double.tryParse(value.trim());
                if (num == null || num <= 0) {
                  return 'Enter a valid amount greater than 0';
                }
                return null;
              },
              decoration: InputDecoration(
                labelText: _mode == CalculationMode.exclusive
                    ? 'Base Amount (₹)'
                    : 'Total Amount (₹)',
                hintText: 'Enter amount',
                prefixIcon: Container(
                  padding: const EdgeInsets.all(12),
                  child: const Text('₹',
                      style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
                ),
                prefixIconConstraints: const BoxConstraints(minWidth: 56),
                filled: true,
                fillColor: const Color(0xFFF1F5F9).withValues(alpha: 0.7),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(20),
                  borderSide: BorderSide.none,
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(20),
                  borderSide: BorderSide.none,
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(20),
                  borderSide: BorderSide(color: theme.colorScheme.secondary, width: 2),
                ),
                errorBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(20),
                  borderSide: const BorderSide(color: Colors.redAccent, width: 1.5),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
              ),
            ),
            const SizedBox(height: 20),

            // GST Rate dropdown
            Text(
              'GST Rate',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Colors.grey.shade700,
              ),
            ),
            const SizedBox(height: 8),
            Container(
              decoration: BoxDecoration(
                color: const Color(0xFFF1F5F9).withValues(alpha: 0.7),
                borderRadius: BorderRadius.circular(20),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<double>(
                  value: _selectedRate,
                  isExpanded: true,
                  icon: Icon(Icons.keyboard_arrow_down_rounded, color: primaryColor),
                  borderRadius: BorderRadius.circular(20),
                  items: _gstRates.map((rate) {
                    return DropdownMenuItem<double>(
                      value: rate,
                      child: Row(
                        children: [
                          Icon(Icons.percent_rounded,
                              size: 18, color: primaryColor.withValues(alpha: 0.7)),
                          const SizedBox(width: 10),
                          Text(
                            '${rate.toStringAsFixed(0)}%',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                  onChanged: (value) {
                    if (value != null) {
                      setState(() {
                        _selectedRate = value;
                        // Recalculate if already calculated
                        if (_hasCalculated) _calculate();
                      });
                    }
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildModeCard(ThemeData theme, Color primaryColor) {
    return Card(
      elevation: 12,
      shadowColor: primaryColor.withValues(alpha: 0.15),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(24)),
        side: BorderSide(color: Color(0xCCFFFFFF), width: 1.5),
      ),
      color: const Color(0xCCFFFFFF),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Calculation Mode',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: primaryColor,
              ),
            ),
            const SizedBox(height: 16),
            SegmentedButton<CalculationMode>(
              segments: const [
                ButtonSegment<CalculationMode>(
                  value: CalculationMode.exclusive,
                  label: Text('Exclusive', style: TextStyle(fontWeight: FontWeight.w600)),
                  icon: Icon(Icons.add_circle_outline_rounded),
                ),
                ButtonSegment<CalculationMode>(
                  value: CalculationMode.inclusive,
                  label: Text('Inclusive', style: TextStyle(fontWeight: FontWeight.w600)),
                  icon: Icon(Icons.remove_circle_outline_rounded),
                ),
              ],
              selected: {_mode},
              onSelectionChanged: (Set<CalculationMode> selection) {
                setState(() {
                  _mode = selection.first;
                  if (_hasCalculated) _calculate();
                });
              },
              style: ButtonStyle(
                backgroundColor: WidgetStateProperty.resolveWith<Color?>(
                  (states) {
                    if (states.contains(WidgetState.selected)) {
                      return primaryColor;
                    }
                    return Colors.grey.shade100;
                  },
                ),
                foregroundColor: WidgetStateProperty.resolveWith<Color?>(
                  (states) {
                    if (states.contains(WidgetState.selected)) {
                      return Colors.white;
                    }
                    return Colors.grey.shade700;
                  },
                ),
                shape: WidgetStateProperty.all(
                  RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                padding: WidgetStateProperty.all(
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              _mode == CalculationMode.exclusive
                  ? 'Add GST on top of the base amount'
                  : 'Extract GST from the total amount',
              style: TextStyle(
                fontSize: 13,
                color: Colors.grey.shade600,
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionButtons(ThemeData theme, Color primaryColor) {
    return Row(
      children: [
        // Calculate button
        Expanded(
          flex: 3,
          child: ElevatedButton.icon(
            onPressed: _calculate,
            icon: const Icon(Icons.calculate_rounded, size: 22),
            label: const Text(
              'Calculate',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, letterSpacing: 0.5),
            ),
            style: ElevatedButton.styleFrom(
              elevation: 10,
              shadowColor: primaryColor.withValues(alpha: 0.5),
              backgroundColor: primaryColor,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
          ),
        ),
        const SizedBox(width: 12),
        // Reset button
        Expanded(
          flex: 1,
          child: OutlinedButton(
            onPressed: _reset,
            style: OutlinedButton.styleFrom(
              side: BorderSide(color: primaryColor.withValues(alpha: 0.5), width: 1.5),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              padding: const EdgeInsets.symmetric(vertical: 16),
              foregroundColor: primaryColor,
            ),
            child: const Icon(Icons.refresh_rounded, size: 24),
          ),
        ),
      ],
    );
  }

  Widget _buildResultsCard(ThemeData theme, Color primaryColor) {
    return Card(
      elevation: 12,
      shadowColor: primaryColor.withValues(alpha: 0.15),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(24)),
        side: BorderSide(color: Color(0xCCFFFFFF), width: 1.5),
      ),
      color: const Color(0xCCFFFFFF),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.receipt_long_rounded, color: primaryColor, size: 24),
                const SizedBox(width: 10),
                Text(
                  'Calculation Result',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: primaryColor,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),

            // Result rows
            _buildResultRow(
              'Base / Taxable Amount',
              _currencyFormat.format(_baseAmount),
              Icons.monetization_on_outlined,
              Colors.teal,
            ),
            const Divider(height: 20, thickness: 1, color: Color(0xFFE2E8F0)),

            _buildResultRow(
              'CGST (${(_selectedRate / 2).toStringAsFixed(1)}%)',
              _currencyFormat.format(_cgst),
              Icons.call_split_rounded,
              Colors.orange.shade700,
            ),
            const SizedBox(height: 10),

            _buildResultRow(
              'SGST (${(_selectedRate / 2).toStringAsFixed(1)}%)',
              _currencyFormat.format(_sgst),
              Icons.call_split_rounded,
              Colors.orange.shade700,
            ),
            const Divider(height: 20, thickness: 1, color: Color(0xFFE2E8F0)),

            _buildResultRow(
              'Total GST (${_selectedRate.toStringAsFixed(0)}%)',
              _currencyFormat.format(_totalGst),
              Icons.account_balance_rounded,
              Colors.red.shade700,
              isBold: true,
            ),
            const Divider(height: 20, thickness: 2, color: Color(0xFFCBD5E1)),

            // Grand total highlighted
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [primaryColor, primaryColor.withValues(alpha: 0.7)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.savings_rounded, color: Colors.white, size: 22),
                      SizedBox(width: 10),
                      Text(
                        'Grand Total',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                  Text(
                    _currencyFormat.format(_grandTotal),
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildResultRow(String label, String value, IconData icon, Color iconColor,
      {bool isBold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 20, color: iconColor),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 14,
                fontWeight: isBold ? FontWeight.w700 : FontWeight.w500,
                color: isBold ? Colors.grey.shade900 : Colors.grey.shade700,
              ),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: isBold ? 16 : 15,
              fontWeight: isBold ? FontWeight.w800 : FontWeight.w600,
              color: Colors.grey.shade900,
            ),
          ),
        ],
      ),
    );
  }
}

/// Calculation mode for GST.
enum CalculationMode {
  /// Add GST on top of the base amount.
  exclusive,

  /// Extract GST from the total (inclusive) amount.
  inclusive,
}
