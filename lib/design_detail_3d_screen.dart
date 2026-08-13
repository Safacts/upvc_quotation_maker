import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;

class DesignDetail3DScreen extends StatefulWidget {
  final String designId;

  const DesignDetail3DScreen({super.key, required this.designId});

  @override
  State<DesignDetail3DScreen> createState() => _DesignDetail3DScreenState();
}

class _DesignDetail3DScreenState extends State<DesignDetail3DScreen> {
  Map<String, dynamic>? design;
  bool loading = true;
  String errorMsg = '';
  String viewMode = 'solid';

  final List<Map<String, dynamic>> viewModes = [
    {'value': 'solid', 'label': 'Solid', 'icon': Icons.view_in_ar},
    {'value': 'wireframe', 'label': 'Wireframe', 'icon': Icons.view_week},
    {'value': 'shaded', 'label': 'Shaded', 'icon': Icons.blur_on},
  ];

  @override
  void initState() {
    super.initState();
    _loadDesign();
  }

  Future<void> _loadDesign() async {
    setState(() => loading = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('auth_token') ?? '';

      final res = await http.get(
        Uri.parse('https://app.vitharn.com/api/console/3d/designs/${widget.designId}'),
        headers: {
          'Authorization': 'Bearer $token',
          'x-client-id': prefs.getString('portal_client_id') ?? '',
        },
      );

      if (res.statusCode == 200) {
        setState(() => design = jsonDecode(res.body));
      } else {
        setState(() => errorMsg = 'Failed: ${res.statusCode}');
      }
    } catch (e) {
      setState(() => errorMsg = e.toString());
    } finally {
      setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final primaryColor = Theme.of(context).primaryColor;

    return Scaffold(
      appBar: AppBar(
        title: Text(design?['name'] ?? '3D Design'),
        backgroundColor: primaryColor,
        foregroundColor: Colors.white,
        actions: [
          if (design != null) ...[
            DropdownButton<String>(
              value: viewMode,
              items: viewModes.map((vm) {
                return DropdownMenuItem<String>(
                  value: vm['value'] as String?,
                  child: Row(
                    children: [
                      Icon(vm['icon'], size: 18),
                      const SizedBox(width: 8),
                      Text(vm['label']),
                    ],
                  ),
                );
              }).toList(),
              onChanged: (v) => setState(() => viewMode = v!),
              style: const TextStyle(color: Colors.white),
              dropdownColor: primaryColor,
            ),
            const SizedBox(width: 8),
            IconButton(
              icon: const Icon(Icons.download),
              onPressed: () {},
            ),
            IconButton(
              icon: const Icon(Icons.share),
              onPressed: () {},
            ),
          ],
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : errorMsg.isNotEmpty
              ? Center(child: Text(errorMsg, style: const TextStyle(color: Colors.red)))
              : design == null
                  ? const Center(child: Text('Design not found'))
                  : _buildBody(primaryColor),
    );
  }

  Widget _buildBody(Color primaryColor) {
    final dimensions = design!['dimensions'] as Map<String, dynamic>;
    final designData = design!['design'] as Map<String, dynamic>;
    final frames = designData['frames'] as List<dynamic>;
    final panels = designData['panels'] as List<dynamic>;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 250,
            width: double.infinity,
            decoration: BoxDecoration(
              color: Colors.grey[200],
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.grey[300]!),
            ),
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.view_in_ar,
                    size: 80,
                    color: primaryColor.withOpacity(0.3),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '3D View (${viewMode})',
                    style: TextStyle(
                      color: Colors.grey[600],
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${frames.length} frames, ${panels.length} panels',
                    style: TextStyle(color: Colors.grey[600]),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'Design Parameters',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Colors.grey[800],
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  _buildParamRow('Width', '${dimensions['width_mm'] ?? 'N/A'} mm'),
                  _buildParamRow('Height', '${dimensions['height_mm'] ?? 'N/A'} mm'),
                  _buildParamRow('Configuration', dimensions['configuration'] ?? 'sliding'),
                  _buildParamRow('Profile', design!['profile_type'] ?? 'uPVC'),
                  _buildParamRow('Frames', '${frames.length}'),
                  _buildParamRow('Panels', '${panels.length}'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'Frames',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Colors.grey[800],
            ),
          ),
          const SizedBox(height: 8),
          ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: frames.length,
            itemBuilder: (context, i) {
              final frame = frames[i] as Map<String, dynamic>;
              return Card(
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: primaryColor.withOpacity(0.2),
                    child: Text('${i + 1}', style: TextStyle(color: primaryColor)),
                  ),
                  title: Text(frame['profile'] ?? 'Frame ${i + 1}'),
                  subtitle: Text('${frame['length_mm'] ?? 0} mm'),
                  trailing: Text(
                    '${frame['quantity'] ?? 1}x',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 24),
          Text(
            'Panels',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Colors.grey[800],
            ),
          ),
          const SizedBox(height: 8),
          ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: panels.length,
            itemBuilder: (context, i) {
              final panel = panels[i] as Map<String, dynamic>;
              return Card(
                child: ListTile(
                  leading: Icon(
                    panel['type'] == 'glass' ? Icons.window : Icons.square,
                    color: primaryColor,
                  ),
                  title: Text('${panel['width'] ?? 0} × ${panel['height'] ?? 0} mm'),
                  subtitle: Text(panel['type'] ?? 'panel'),
                  trailing: Text(
                    panel['opening'] == true ? 'Opening' : 'Fixed',
                    style: TextStyle(
                      color: panel['opening'] == true ? Colors.green : Colors.grey[600],
                      fontSize: 12,
                    ),
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () {},
              style: ElevatedButton.styleFrom(
                backgroundColor: primaryColor,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              icon: const Icon(Icons.share),
              label: const Text('Share Design'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildParamRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: Colors.grey[600])),
          Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
