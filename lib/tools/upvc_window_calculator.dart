import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

/// uPVC Window Cost Calculator — a free tool for UPVC installers.
///
/// Estimates the cost of uPVC windows based on dimensions, window type,
/// frame color, and glass type — helping installers and customers plan budgets.
class UpvcWindowCalculator extends StatefulWidget {
  const UpvcWindowCalculator({super.key});

  @override
  State<UpvcWindowCalculator> createState() => _UpvcWindowCalculatorState();
}

class _UpvcWindowCalculatorState extends State<UpvcWindowCalculator> {
  // ── Controllers ──────────────────────────────────────────────────
  final _widthController = TextEditingController();
  final _heightController = TextEditingController();
  final _qtyController = TextEditingController(text: '1');

  // ── State ───────────────────────────────────────────────────────
  String? _selectedWindowType;
  String? _selectedFrameColor;
  String? _selectedGlassType;

  // Results
  double _areaSqFt = 0;
  double _ratePerSqFt = 0;
  double _colorMultiplier = 0;
  double _colorUpchargeAmount = 0;
  double _subtotal = 0;
  double _total = 0;
  bool _hasCalculated = false;

  // ── Constants ───────────────────────────────────────────────────
  static const List<String> _windowTypes = [
    'Sliding',
    'Casement',
    'Fixed',
    'Tilt & Turn',
  ];

  static const List<String> _frameColors = [
    'White',
    'Woodgrain',
    'Grey',
    'Black',
  ];

  static const List<String> _glassTypes = [
    'Single',
    'Double (Laminated)',
    'Triple',
  ];

  // Rate per sq ft (₹) based on window type and glass type
  static const Map<String, Map<String, double>> _rateCard = {
    'Sliding': {
      'Single': 350,
      'Double (Laminated)': 450,
      'Triple': 600,
    },
    'Casement': {
      'Single': 400,
      'Double (Laminated)': 520,
      'Triple': 680,
    },
    'Fixed': {
      'Single': 280,
      'Double (Laminated)': 380,
      'Triple': 500,
    },
    'Tilt & Turn': {
      'Single': 500,
      'Double (Laminated)': 650,
      'Triple': 820,
    },
  };

  // Color upcharge multiplier
  static const Map<String, double> _colorMultipliers = {
    'White': 1.0,
    'Woodgrain': 1.15,
    'Grey': 1.10,
    'Black': 1.20,
  };

  // Color upcharge percentage (for display)
  static const Map<String, String> _colorUpchargeLabels = {
    'White': '0%',
    'Woodgrain': '+15%',
    'Grey': '+10%',
    'Black': '+20%',
  };

  static const Map<String, Color> _colorDisplay = {
    'White': Color(0xFFE8E8E8),
    'Woodgrain': Color(0xFF8B6914),
    'Grey': Color(0xFF9E9E9E),
    'Black': Color(0xFF333333),
  };

  // Number formatters
  final NumberFormat _currencyFormat =
      NumberFormat.currency(locale: 'INR', symbol: '₹', decimalDigits: 0);
  final NumberFormat _fmt2 = NumberFormat('#,##0.00', 'en_US');

  // ── Calculation ─────────────────────────────────────────────────
  void _calculate() {
    final width = double.tryParse(_widthController.text.trim());
    final height = double.tryParse(_heightController.text.trim());
    final qty = int.tryParse(_qtyController.text.trim()) ?? 1;

    if (width == null || width <= 0) {
      _showError('Please enter a valid width in mm.');
      return;
    }
    if (height == null || height <= 0) {
      _showError('Please enter a valid height in mm.');
      return;
    }
    if (qty <= 0) {
      _showError('Quantity must be at least 1.');
      return;
    }
    if (_selectedWindowType == null) {
      _showError('Please select a window type.');
      return;
    }
    if (_selectedFrameColor == null) {
      _showError('Please select a frame color.');
      return;
    }
    if (_selectedGlassType == null) {
      _showError('Please select a glass type.');
      return;
    }

    final windowType = _selectedWindowType!;
    final frameColor = _selectedFrameColor!;
    final glassType = _selectedGlassType!;

    // Rate per sq ft
    final rate = _rateCard[windowType]![glassType]!;

    // Color multiplier
    final colorMult = _colorMultipliers[frameColor]!;

    // Area in sq ft = (width * height) / 929030 * quantity
    final areaSqFt = (width * height) / 929030 * qty;

    // Subtotal before color upcharge = area * rate * qty
    final subtotal = areaSqFt * rate;

    // Color upcharge amount
    final upchargeAmount = subtotal * (colorMult - 1.0);

    // Total = subtotal + upcharge = area * rate * colorMultiplier
    final total = subtotal * colorMult;

    setState(() {
      _areaSqFt = areaSqFt;
      _ratePerSqFt = rate;
      _colorMultiplier = colorMult;
      _colorUpchargeAmount = upchargeAmount;
      _subtotal = subtotal;
      _total = total;
      _hasCalculated = true;
    });

    // Dismiss keyboard
    FocusScope.of(context).unfocus();
  }

  void _reset() {
    setState(() {
      _widthController.clear();
      _heightController.clear();
      _qtyController.text = '1';
      _selectedWindowType = null;
      _selectedFrameColor = null;
      _selectedGlassType = null;
      _areaSqFt = 0;
      _ratePerSqFt = 0;
      _colorMultiplier = 0;
      _colorUpchargeAmount = 0;
      _subtotal = 0;
      _total = 0;
      _hasCalculated = false;
    });
    FocusScope.of(context).unfocus();
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        behavior: SnackBarBehavior.floating,
        backgroundColor: Colors.redAccent,
      ),
    );
  }

  @override
  void dispose() {
    _widthController.dispose();
    _heightController.dispose();
    _qtyController.dispose();
    super.dispose();
  }

  // ── Build ───────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primaryColor = theme.colorScheme.primary;

    return Scaffold(
      appBar: AppBar(
        title: const Text('uPVC Window Calculator'),
        centerTitle: true,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header icon
              Center(
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: primaryColor.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.window,
                    size: 48,
                    color: primaryColor,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Center(
                child: Text(
                  'Estimate your uPVC window cost',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: Colors.grey.shade600,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
              const SizedBox(height: 20),

              // ── Input Card ───────────────────────────────────────
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Section: Dimensions
                      Row(
                        children: [
                          Icon(Icons.straighten, color: primaryColor, size: 20),
                          const SizedBox(width: 8),
                          Text(
                            'Dimensions',
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // Width
                      _buildNumberField(
                        controller: _widthController,
                        label: 'Width (mm)',
                        icon: Icons.swap_horiz,
                      ),
                      const SizedBox(height: 12),

                      // Height
                      _buildNumberField(
                        controller: _heightController,
                        label: 'Height (mm)',
                        icon: Icons.swap_vert,
                      ),
                      const SizedBox(height: 12),

                      // Quantity
                      _buildNumberField(
                        controller: _qtyController,
                        label: 'Quantity',
                        icon: Icons.confirmation_number_outlined,
                        isInteger: true,
                      ),
                      const SizedBox(height: 20),

                      // Divider
                      Divider(color: Colors.grey.shade300),
                      const SizedBox(height: 12),

                      // Section: Window Configuration
                      Row(
                        children: [
                          Icon(Icons.tune, color: primaryColor, size: 20),
                          const SizedBox(width: 8),
                          Text(
                            'Configuration',
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // Window type dropdown
                      DropdownButtonFormField<String>(
                        initialValue: _selectedWindowType,
                        decoration: InputDecoration(
                          labelText: 'Window Type',
                          prefixIcon: Icon(Icons.view_agenda, color: primaryColor),
                        ),
                        isExpanded: true,
                        items: _windowTypes.map((type) {
                          final icon = _getWindowTypeIcon(type);
                          return DropdownMenuItem<String>(
                            value: type,
                            child: Row(
                              children: [
                                Icon(icon, size: 18, color: Colors.grey.shade700),
                                const SizedBox(width: 8),
                                Text(type),
                              ],
                            ),
                          );
                        }).toList(),
                        onChanged: (v) => setState(() => _selectedWindowType = v),
                      ),
                      const SizedBox(height: 12),

                      // Frame color dropdown
                      DropdownButtonFormField<String>(
                        initialValue: _selectedFrameColor,
                        decoration: InputDecoration(
                          labelText: 'Frame Color',
                          prefixIcon: Icon(Icons.palette, color: primaryColor),
                        ),
                        isExpanded: true,
                        items: _frameColors.map((color) {
                          final colorValue = _colorDisplay[color]!;
                          final upcharge = _colorUpchargeLabels[color]!;
                          return DropdownMenuItem<String>(
                            value: color,
                            child: Row(
                              children: [
                                Icon(Icons.circle, size: 16, color: colorValue),
                                const SizedBox(width: 8),
                                Text(color),
                                const Spacer(),
                                Text(
                                  upcharge,
                                  style: TextStyle(
                                    color: Colors.grey.shade500,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          );
                        }).toList(),
                        onChanged: (v) => setState(() => _selectedFrameColor = v),
                      ),
                      const SizedBox(height: 12),

                      // Glass type dropdown
                      DropdownButtonFormField<String>(
                        initialValue: _selectedGlassType,
                        decoration: InputDecoration(
                          labelText: 'Glass Type',
                          prefixIcon: Icon(Icons.auto_awesome, color: primaryColor),
                        ),
                        isExpanded: true,
                        items: _glassTypes.map((glass) {
                          return DropdownMenuItem<String>(
                            value: glass,
                            child: Text(glass),
                          );
                        }).toList(),
                        onChanged: (v) => setState(() => _selectedGlassType = v),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // ── Buttons ──────────────────────────────────────────
              Row(
                children: [
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      onPressed: _calculate,
                      icon: const Icon(Icons.calculate),
                      label: const Text('Calculate Cost'),
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _reset,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Reset'),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // ── Results Card ─────────────────────────────────────
              if (_hasCalculated) ...[
                Card(
                  color: primaryColor.withValues(alpha: 0.05),
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.receipt_long,
                                color: primaryColor, size: 20),
                            const SizedBox(width: 8),
                            Text(
                              'Cost Estimate',
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                                color: primaryColor,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),

                        // Area
                        _buildResultRow(
                          'Total Area',
                          '${_fmt2.format(_areaSqFt)} sq ft',
                          Icons.crop_free,
                        ),
                        const Divider(height: 20),

                        // Rate breakdown
                        _buildResultRow(
                          'Rate (per sq ft)',
                          _currencyFormat.format(_ratePerSqFt),
                          Icons.speed,
                        ),
                        const Divider(height: 20),

                        // Subtotal before upcharge
                        _buildResultRow(
                          'Subtotal',
                          _currencyFormat.format(_subtotal),
                          Icons.functions,
                        ),
                        const Divider(height: 20),

                        // Color upcharge
                        _buildResultRow(
                          'Color Upcharge (${_selectedFrameColor ?? ''})',
                          _currencyFormat.format(_colorUpchargeAmount),
                          Icons.palette,
                          valueColor: Colors.orange.shade700,
                        ),
                        const Divider(height: 24),

                        // Total - highlighted
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [
                                primaryColor.withValues(alpha: 0.1),
                                primaryColor.withValues(alpha: 0.05),
                              ],
                              begin: Alignment.centerLeft,
                              end: Alignment.centerRight,
                            ),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                              color: primaryColor.withValues(alpha: 0.3),
                            ),
                          ),
                          child: Row(
                            children: [
                              Icon(Icons.savings, color: primaryColor, size: 24),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  'Total Estimated Cost',
                                  style: theme.textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                              Text(
                                _currencyFormat.format(_total),
                                style: theme.textTheme.headlineSmall?.copyWith(
                                  fontWeight: FontWeight.bold,
                                  color: primaryColor,
                                ),
                              ),
                            ],
                          ),
                        ),

                        const SizedBox(height: 16),

                        // Rate breakdown info
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.grey.shade100,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Icon(Icons.info_outline,
                                      size: 16, color: Colors.grey.shade600),
                                  const SizedBox(width: 6),
                                  Text(
                                    'Breakdown',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 13,
                                      color: Colors.grey.shade700,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                '${_fmt2.format(_areaSqFt)} sq ft × ${_currencyFormat.format(_ratePerSqFt)} × $_colorMultiplier (color) = ${_currencyFormat.format(_total)}',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.grey.shade600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 20),

                // ── Pricing Reference Card ──────────────────────────
                Card(
                  color: Colors.grey.shade50,
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.handyman,
                                color: Colors.grey.shade700, size: 20),
                            const SizedBox(width: 8),
                            Text(
                              'Rate Reference',
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                                color: Colors.grey.shade700,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'Standard rates per sq ft:',
                          style: TextStyle(
                            color: Colors.grey.shade600,
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(height: 8),
                        _buildRateRow('Sliding', '₹350', '₹450', '₹600'),
                        _buildRateRow('Casement', '₹400', '₹520', '₹680'),
                        _buildRateRow('Fixed', '₹280', '₹380', '₹500'),
                        _buildRateRow('Tilt & Turn', '₹500', '₹650', '₹820'),
                        const SizedBox(height: 12),
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: Colors.amber.shade50,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.amber.shade200),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(Icons.lightbulb_outline,
                                  color: Colors.amber.shade700, size: 18),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  'Final pricing may vary based on hardware, mesh, '
                                  'installation charges, and supplier discounts. '
                                  'Use this estimate for initial budget planning.',
                                  style: TextStyle(
                                    color: Colors.amber.shade800,
                                    fontSize: 12,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],

              const SizedBox(height: 32),

              // Footer
              Center(
                child: Text(
                  'Rates shown are indicative estimates for budget planning',
                  style: TextStyle(
                    color: Colors.grey.shade400,
                    fontSize: 11,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  // ── Helper Widgets ──────────────────────────────────────────────

  IconData _getWindowTypeIcon(String type) {
    switch (type) {
      case 'Sliding':
        return Icons.view_column;
      case 'Casement':
        return Icons.open_in_full;
      case 'Fixed':
        return Icons.crop_square;
      case 'Tilt & Turn':
        return Icons.rotate_90_degrees_ccw;
      default:
        return Icons.window;
    }
  }

  Widget _buildNumberField({
    required TextEditingController controller,
    required String label,
    required IconData icon,
    bool isInteger = false,
  }) {
    return TextField(
      controller: controller,
      keyboardType: TextInputType.numberWithOptions(decimal: !isInteger),
      inputFormatters: [
        if (isInteger)
          FilteringTextInputFormatter.digitsOnly
        else
          FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*')),
      ],
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon),
      ),
    );
  }

  Widget _buildResultRow(
    String label,
    String value,
    IconData icon, {
    Color? valueColor,
    bool bold = false,
  }) {
    return Row(
      children: [
        Icon(icon, size: 18, color: Colors.grey.shade600),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            label,
            style: TextStyle(color: Colors.grey.shade700),
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontWeight: bold ? FontWeight.bold : FontWeight.w600,
            fontSize: bold ? 18 : 16,
            color: valueColor ?? Colors.grey.shade900,
          ),
        ),
      ],
    );
  }

  Widget _buildRateRow(
    String windowType,
    String single,
    String double_,
    String triple,
  ) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          SizedBox(
            width: 100,
            child: Text(
              windowType,
              style: TextStyle(
                color: Colors.grey.shade700,
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Expanded(
            child: Text(
              single,
              style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
            ),
          ),
          Expanded(
            child: Text(
              double_,
              style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
            ),
          ),
          Expanded(
            child: Text(
              triple,
              style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}
