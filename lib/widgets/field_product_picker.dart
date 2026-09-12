import 'package:flutter/material.dart';

/// field_product_picker.dart -- ADDITIVE ONLY.
///
/// Sales-executive friendly selectors that MAP to existing MeasuredItem
/// fields (code/description/glass/rate). No schema change:
/// - window type + profile + hardware compose `code`/`description`
/// - glass selector fills `glass`
/// - rate suggestion fills `rate` (rate-card/preset compatible)
///
/// The caller still saves via the existing quotation flow, so pricing math
/// (sft/total in models.dart) and PDF stay byte-identical.
class FieldProductChoice {
  final String code;
  final String description;
  final String glass;
  final double suggestedRate;

  const FieldProductChoice({
    this.code = '',
    this.description = '',
    this.glass = '',
    this.suggestedRate = 0,
  });
}

class FieldProductPicker extends StatefulWidget {
  final ValueChanged<FieldProductChoice> onChoice;
  const FieldProductPicker({super.key, required this.onChoice});

  @override
  State<FieldProductPicker> createState() => _FieldProductPickerState();
}

class _FieldProductPickerState extends State<FieldProductPicker> {
  static const types = [
    '2-Track Sliding',
    '3-Track Sliding',
    'Casement',
    'Fixed',
    'Tilt & Turn',
    'French Door',
  ];
  static const profiles = ['2-track profile', '2.5-track profile', '3-track profile'];
  static const glasses = ['5mm clear', '5mm toughened', 'DGU 24mm', 'Laminated'];
  static const hardwares = ['Basic', 'Standard', 'Premium'];

  String _type = types[0];
  String _profile = profiles[1];
  String _glass = glasses[0];
  String _hw = hardwares[1];

  void _emit() {
    widget.onChoice(FieldProductChoice(
      code: _type,
      description: '$_type • $_profile • $_hw hardware',
      glass: _glass,
      suggestedRate: 0,
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Field product (fills quote line)',
                style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _type,
              items: types
                  .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                  .toList(),
              onChanged: (v) {
                setState(() => _type = v ?? _type);
                _emit();
              },
              decoration: const InputDecoration(
                  labelText: 'Product type', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _profile,
              items: profiles
                  .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                  .toList(),
              onChanged: (v) {
                setState(() => _profile = v ?? _profile);
                _emit();
              },
              decoration: const InputDecoration(
                  labelText: 'Profile', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _glass,
                    items: glasses
                        .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                        .toList(),
                    onChanged: (v) {
                      setState(() => _glass = v ?? _glass);
                      _emit();
                    },
                    decoration: const InputDecoration(
                        labelText: 'Glass', border: OutlineInputBorder()),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _hw,
                    items: hardwares
                        .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                        .toList(),
                    onChanged: (v) {
                      setState(() => _hw = v ?? _hw);
                      _emit();
                    },
                    decoration: const InputDecoration(
                        labelText: 'Hardware', border: OutlineInputBorder()),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
