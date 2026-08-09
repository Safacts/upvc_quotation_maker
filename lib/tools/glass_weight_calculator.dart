import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

/// Glass Weight Calculator — a free tool for UPVC installers.
///
/// Computes the weight of glass panels from dimensions and thickness,
/// helping installers plan safe lifting and transportation.
class GlassWeightCalculator extends StatefulWidget {
  const GlassWeightCalculator({super.key});

  @override
  State<GlassWeightCalculator> createState() => _GlassWeightCalculatorState();
}

class _GlassWeightCalculatorState extends State<GlassWeightCalculator> {
  // ── Controllers ──────────────────────────────────────────────────
  final _widthController = TextEditingController();
  final _heightController = TextEditingController();
  final _qtyController = TextEditingController(text: '1');

  // ── State ───────────────────────────────────────────────────────
  double? _selectedThickness;
  String? _selectedGlassType;

  // Results
  double _areaSqFt = 0;
  double _areaM2 = 0;
  double _weightPerPanel = 0;
  double _totalWeight = 0;
  bool _hasCalculated = false;

  // ── Constants ───────────────────────────────────────────────────
  static const List<double> _thicknessOptions = [4, 5, 5.5, 6, 8, 10, 12];

  static const List<String> _glassTypes = [
    'Clear Float',
    'Toughened',
    'Laminated (2 layers)',
    'Tinted',
    'Reflective',
  ];

  // Density in kg/m³
  static const Map<String, double> _densityMap = {
    'Clear Float': 2500,
    'Toughened': 2500,
    'Laminated (2 layers)': 2500,
    'Tinted': 2500,
    'Reflective': 2500,
  };

  // Number formatter
  final NumberFormat _fmt2 = NumberFormat('#,##0.00', 'en_US');
  final NumberFormat _fmt3 = NumberFormat('#,##0.000', 'en_US');

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
    if (_selectedThickness == null) {
      _showError('Please select a glass thickness.');
      return;
    }
    if (_selectedGlassType == null) {
      _showError('Please select a glass type.');
      return;
    }

    final thickness = _selectedThickness!;
    final glassType = _selectedGlassType!;
    final density = _densityMap[glassType]!;

    // Area in m² per panel
    final areaPerPanelM2 = (width / 1000) * (height / 1000);
    final totalAreaM2 = areaPerPanelM2 * qty;

    // Weight = Area(m²) * thickness(m) * density(kg/m³)
    final weightPerPanel = areaPerPanelM2 * (thickness / 1000) * density;

    // Laminated glass has 2 layers — double the weight
    final multiplier = (glassType == 'Laminated (2 layers)') ? 2 : 1;
    final adjustedWeightPerPanel = weightPerPanel * multiplier;

    setState(() {
      _areaM2 = totalAreaM2;
      _areaSqFt = totalAreaM2 * 10.7639; // 1 m² = 10.7639 sq ft
      _weightPerPanel = adjustedWeightPerPanel;
      _totalWeight = adjustedWeightPerPanel * qty;
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
      _selectedThickness = null;
      _selectedGlassType = null;
      _areaSqFt = 0;
      _areaM2 = 0;
      _weightPerPanel = 0;
      _totalWeight = 0;
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
        title: const Text('Glass Weight Calculator'),
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
                    Icons.crop_square_rounded,
                    size: 48,
                    color: primaryColor,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Center(
                child: Text(
                  'Calculate glass panel weight',
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
                      Row(
                        children: [
                          Icon(Icons.straighten, color: primaryColor, size: 20),
                          const SizedBox(width: 8),
                          Text(
                            'Panel Dimensions',
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

                      // Thickness dropdown
                      DropdownButtonFormField<double>(
                        value: _selectedThickness,
                        decoration: InputDecoration(
                          labelText: 'Thickness (mm)',
                          prefixIcon: Icon(Icons.layers, color: primaryColor),
                        ),
                        items: _thicknessOptions.map((t) {
                          final isToughened = t == 5.5;
                          return DropdownMenuItem<double>(
                            value: t,
                            child: Text(
                              isToughened ? '$t mm (Toughened)' : '$t mm',
                            ),
                          );
                        }).toList(),
                        onChanged: (v) => setState(() => _selectedThickness = v),
                      ),
                      const SizedBox(height: 12),

                      // Glass type dropdown
                      DropdownButtonFormField<String>(
                        value: _selectedGlassType,
                        decoration: InputDecoration(
                          labelText: 'Glass Type',
                          prefixIcon:
                              Icon(Icons.auto_awesome, color: primaryColor),
                        ),
                        items: _glassTypes.map((type) {
                          return DropdownMenuItem<String>(
                            value: type,
                            child: Text(type),
                          );
                        }).toList(),
                        onChanged: (v) => setState(() => _selectedGlassType = v),
                      ),
                      const SizedBox(height: 12),

                      // Quantity
                      _buildNumberField(
                        controller: _qtyController,
                        label: 'Quantity',
                        icon: Icons.confirmation_number_outlined,
                        isInteger: true,
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
                      label: const Text('Calculate'),
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
                            Icon(Icons.analytics_outlined,
                                color: primaryColor, size: 20),
                            const SizedBox(width: 8),
                            Text(
                              'Results',
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                                color: primaryColor,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),

                        _buildResultRow(
                          'Total Area',
                          '${_fmt2.format(_areaSqFt)} sq ft',
                          Icons.crop_free,
                        ),
                        const Divider(height: 20),
                        _buildResultRow(
                          'Total Area',
                          '${_fmt3.format(_areaM2)} m²',
                          Icons.square_foot,
                        ),
                        const Divider(height: 20),
                        _buildResultRow(
                          'Weight per Panel',
                          '${_fmt2.format(_weightPerPanel)} kg',
                          Icons.fitness_center,
                          valueColor: primaryColor,
                        ),
                        const Divider(height: 20),
                        _buildResultRow(
                          'Total Weight',
                          '${_fmt2.format(_totalWeight)} kg',
                          Icons.scale,
                          valueColor: primaryColor,
                          bold: true,
                        ),

                        // Safety warning for heavy panels
                        if (_totalWeight > 50) ...[
                          const SizedBox(height: 16),
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.orange.shade50,
                              borderRadius: BorderRadius.circular(12),
                              border:
                                  Border.all(color: Colors.orange.shade200),
                            ),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(Icons.warning_amber_rounded,
                                    color: Colors.orange.shade700, size: 22),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'Heavy Load Warning',
                                        style: TextStyle(
                                          fontWeight: FontWeight.bold,
                                          color: Colors.orange.shade800,
                                          fontSize: 14,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        'Total weight exceeds 50 kg. Mechanical lifting equipment (crane, vacuum lifter) is recommended. Ensure proper PPE and trained personnel.',
                                        style: TextStyle(
                                          color: Colors.orange.shade700,
                                          fontSize: 13,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],

                        // Per-panel safety warning
                        if (_weightPerPanel > 25 && _totalWeight <= 50) ...[
                          const SizedBox(height: 16),
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.blue.shade50,
                              borderRadius: BorderRadius.circular(12),
                              border:
                                  Border.all(color: Colors.blue.shade200),
                            ),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(Icons.info_outline,
                                    color: Colors.blue.shade700, size: 22),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'Handling Note',
                                        style: TextStyle(
                                          fontWeight: FontWeight.bold,
                                          color: Colors.blue.shade800,
                                          fontSize: 14,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        'Each panel weighs ${_fmt2.format(_weightPerPanel)} kg. A two-person lift is recommended for panels over 25 kg.',
                                        style: TextStyle(
                                          color: Colors.blue.shade700,
                                          fontSize: 13,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 20),

                // ── Installer Reference Card ───────────────────────
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
                              'Installer Reference',
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                                color: Colors.grey.shade700,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'Approximate load bearing capacity for mounting:',
                          style: TextStyle(
                            color: Colors.grey.shade600,
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(height: 8),
                        _buildReferenceRow(
                            'Window frame (standard)', '≤ 50 kg per panel'),
                        _buildReferenceRow(
                            'Sliding door track', '≤ 80 kg per panel'),
                        _buildReferenceRow(
                            'Heavy-duty pivot hinge', '≤ 120 kg per panel'),
                        _buildReferenceRow(
                            'Structural silicone glazing',
                            '≤ 200 kg per panel'),
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
                                  'Always verify with the hardware manufacturer. '
                                  'Weight limits depend on frame material, wall type, and fixing method.',
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
                  'Density used: 2,500 kg/m³ • Laminated = 2 layers',
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

  Widget _buildReferenceRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Icon(Icons.check_circle_outline,
              size: 16, color: Colors.grey.shade500),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              label,
              style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              color: Colors.grey.shade600,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
