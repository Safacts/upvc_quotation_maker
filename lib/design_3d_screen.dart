import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;

class Design3DScreen extends StatefulWidget {
  final String orderId;
  final String? designId;

  const Design3DScreen({super.key, required this.orderId, this.designId});

  @override
  State<Design3DScreen> createState() => _Design3DScreenState();
}

class _Design3DScreenState extends State<Design3DScreen> {
  Map<String, dynamic>? design;
  List<dynamic> renders = [];
  bool loading = true;
  String errorMsg = '';

  @override
  void initState() {
    super.initState();
    _loadDesign();
  }

  Future<void> _loadDesign() async {
    setState(() => loading = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final clientId = prefs.getString('portal_client_id') ?? '';
      final token = prefs.getString('auth_token') ?? '';

      String url;
      if (widget.designId != null) {
        url = 'https://app.vitharn.com/api/console/3d/designs/${widget.designId}';
      } else {
        url = 'https://app.vitharn.com/api/console/3d/designs?order_id=${widget.orderId}';
      }

      final res = await http.get(
        Uri.parse(url),
        headers: {
          'Authorization': 'Bearer $token',
          'x-client-id': clientId,
        },
      );

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (widget.designId != null) {
          setState(() => design = data['design'] ?? data);
        } else {
          final List designs = data['designs'] ?? data;
          setState(() => design = designs.isNotEmpty ? designs.first : null);
        }

        if (design != null) {
          final rendersRes = await http.get(
            Uri.parse('https://app.vitharn.com/api/console/3d/renders?design_id=${design!['id']}'),
            headers: {
              'Authorization': 'Bearer $token',
              'x-client-id': clientId,
            },
          );
          if (rendersRes.statusCode == 200) {
            setState(() {
              renders = jsonDecode(rendersRes.body)['renders'] ?? jsonDecode(rendersRes.body);
            });
          }
        }
      } else {
        setState(() => errorMsg = 'Failed to load: ${res.statusCode}');
      }
    } catch (e) {
      setState(() => errorMsg = e.toString());
    } finally {
      setState(() => loading = false);
    }
  }

  Future<void> _render3D() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('auth_token') ?? '';

    final res = await http.post(
      Uri.parse('https://app.vitharn.com/api/console/3d/render'),
      headers: {
        'Authorization': 'Bearer $token',
        'x-client-id': prefs.getString('portal_client_id') ?? '',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({'design_id': design!['id']}),
    );

    if (res.statusCode == 200 || res.statusCode == 201) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Render started!')),
      );
      _loadDesign();
    }
  }

  @override
  Widget build(BuildContext context) {
    final primaryColor = Theme.of(context).primaryColor;

    return Scaffold(
      appBar: AppBar(
        title: const Text('3D Design'),
        backgroundColor: primaryColor,
        foregroundColor: Colors.white,
        actions: [
          if (design != null) ...[
            IconButton(
              icon: const Icon(Icons.download),
              onPressed: () {
                final renderUrl = renders.isNotEmpty
                    ? (renders.first as Map<String, dynamic>)['url']
                    : '';
                if (renderUrl.isNotEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Download: $renderUrl')),
                  );
                }
              },
            ),
            IconButton(
              icon: const Icon(Icons.share),
              onPressed: () {
                final renderUrl = renders.isNotEmpty
                    ? (renders.first as Map<String, dynamic>)['url']
                    : '';
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Share: $renderUrl')),
                );
              },
            ),
          ],
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : errorMsg.isNotEmpty
              ? Center(child: Text(errorMsg, style: const TextStyle(color: Colors.red)))
              : design == null
                  ? const Center(child: Text('No design found for this order'))
                  : _buildBody(primaryColor),
      floatingActionButton: design != null
          ? FloatingActionButton.extended(
              onPressed: _render3D,
              backgroundColor: primaryColor,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.image),
              label: const Text('Render 3D'),
            )
          : null,
    );
  }

  Widget _buildBody(Color primaryColor) {
    final dimensions = design!['dimensions'] as Map<String, dynamic>;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    design!['name'] ?? 'Window Design',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text('Profile: ${dimensions['profile_type'] ?? design!['profile_type']}'),
                  Text('Configuration: ${dimensions['configuration'] ?? 'sliding'}'),
                  Text('Width: ${dimensions['width_mm'] ?? 'N/A'} mm'),
                  Text('Height: ${dimensions['height_mm'] ?? 'N/A'} mm'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          if (renders.isNotEmpty) ...[
            const Text('Renders', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 12,
              children: renders.map((r) {
                final render = r as Map<String, dynamic>;
                return Card(
                  child: Column(
                    children: [
                      Container(
                        width: 120,
                        height: 90,
                        decoration: BoxDecoration(
                          color: Colors.grey[300],
                          borderRadius: BorderRadius.circular(8),
                          image: render['url'] != null
                              ? DecorationImage(
                                  image: NetworkImage(render['url']),
                                  fit: BoxFit.cover,
                                )
                              : null,
                        ),
                        child: render['url'] == null
                            ? const Center(child: Icon(Icons.image, size: 40))
                            : null,
                      ),
                      Padding(
                        padding: const EdgeInsets.all(8),
                        child: Text(
                          render['render_type'] ?? 'render',
                          style: const TextStyle(fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
          ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () {
                final designUrl = 'https://app.vitharn.com/upvc/3d-viewer?designId=${design!['id']}';
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Open in browser: $designUrl')),
                );
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: primaryColor,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              icon: const Icon(Icons.open_in_browser),
              label: const Text('Open Full 3D Viewer'),
            ),
          ),
        ],
      ),
    );
  }
}
