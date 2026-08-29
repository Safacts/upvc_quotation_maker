import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;

class DesignConfigurator extends StatefulWidget {
  final String orderId;

  const DesignConfigurator({super.key, required this.orderId});

  @override
  State<DesignConfigurator> createState() => _DesignConfiguratorState();
}

class _DesignConfiguratorState extends State<DesignConfigurator> {
  double widthMm = 1200;
  double heightMm = 1500;
  String windowType = 'sliding';
  String profileType = '3925-60x45';
  bool isLoading = false;

  final List<Map<String, dynamic>> windowTypes = [
    {'value': 'sliding', 'label': 'Sliding'},
    {'value': 'casement', 'label': 'Casement'},
    {'value': 'tilt_turn', 'label': 'Tilt & Turn'},
    {'value': 'fixed', 'label': 'Fixed'},
  ];

  final List<Map<String, dynamic>> profiles = [
    {'value': '3925-60x45', 'label': 'Standard uPVC 60x45'},
    {'value': '3925-70x45', 'label': 'Thermal uPVC 70x45'},
    {'value': 'aluminum-50x45', 'label': 'Aluminum 50x45'},
  ];

  Future<void> _generateDesign() async {
    setState(() => isLoading = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('auth_token') ?? '';

      final res = await http.post(
        Uri.parse('https://app.vitharn.com/api/console/3d/configurator'),
        headers: {
          'Authorization': 'Bearer $token',
          'x-client-id': prefs.getString('portal_client_id') ?? '',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'width_mm': widthMm.toInt(),
          'height_mm': heightMm.toInt(),
          'type': windowType,
          'profile_type': profileType,
        }),
      );

      if (res.statusCode == 200 || res.statusCode == 201) {
        final result = jsonDecode(res.body);
        if (mounted) Navigator.of(context).pop(result);
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed: ${res.statusCode}')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final primaryColor = Theme.of(context).primaryColor;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Configure Window'),
        backgroundColor: primaryColor,
        foregroundColor: Colors.white,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Dimensions',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 20),
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Width: ${widthMm.toInt()} mm',
                                  style: const TextStyle(fontWeight: FontWeight.w600)),
                              Slider(
                                value: widthMm,
                                min: 300,
                                max: 3200,
                                divisions: 29,
                                label: '${widthMm.toInt()} mm',
                                onChanged: (v) => setState(() => widthMm = v),
                              ),
                              const Text('300 mm', style: TextStyle(fontSize: 12)),
                            ],
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Height: ${heightMm.toInt()} mm',
                                  style: const TextStyle(fontWeight: FontWeight.w600)),
                              Slider(
                                value: heightMm,
                                min: 300,
                                max: 2400,
                                divisions: 21,
                                label: '${heightMm.toInt()} mm',
                                onChanged: (v) => setState(() => heightMm = v),
                              ),
                              const Text('300 mm', style: TextStyle(fontSize: 12)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Window Type',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      children: windowTypes.map((type) {
                        final selected = windowType == type['value'];
                        return ChoiceChip(
                          label: Text(type['label']),
                          selected: selected,
                          onSelected: (_) => setState(() => windowType = type['value']),
                          selectedColor: primaryColor.withValues(alpha: 0.2),
                          backgroundColor: Colors.grey[200],
                          labelStyle: TextStyle(
                            color: selected ? primaryColor : Colors.black87,
                            fontWeight: selected ? FontWeight.bold : FontWeight.normal,
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Profile System',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: profileType,
                      decoration: InputDecoration(
                        border: const OutlineInputBorder(),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      ),
                      items: profiles.map((p) {
                        return DropdownMenuItem<String>(
                          value: p['value'] as String?,
                          child: Text(p['label'] as String? ?? ''),
                        );
                      }).toList(),
                      onChanged: (v) => setState(() => profileType = v!),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: isLoading ? null : _generateDesign,
                style: ElevatedButton.styleFrom(
                  backgroundColor: primaryColor,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
                child: isLoading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Generate 3D Design', style: TextStyle(fontSize: 16)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
