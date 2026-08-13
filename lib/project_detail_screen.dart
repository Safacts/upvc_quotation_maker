import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import 'app_state.dart';
import 'project_screen.dart';
import 'order_screen.dart';
import 'order_detail_screen.dart';

class ProjectDetailScreen extends StatefulWidget {
  final ProjectData project;

  const ProjectDetailScreen({super.key, required this.project});

  @override
  State<ProjectDetailScreen> createState() => _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends State<ProjectDetailScreen> {
  late ProjectData _project;
  Map<String, dynamic>? _lead;
  Map<String, dynamic>? _order;
  bool _isLoading = true;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _project = widget.project;
    _loadDetail();
  }

  /// Same-origin on web (browser attaches the session cookie), production on
  /// mobile — mirrors `QuoteShare.origin()`.
  static String get _apiBase =>
      kIsWeb ? Uri.base.origin : 'https://app.vitharn.com';

  Future<Map<String, String>> _headers() async {
    // Read the tenant synchronously before any await so the lint rule stays
    // clean; the client id is immutable for the lifetime of this screen.
    final clientId =
        Provider.of<AppState>(context, listen: false).clientConfig.clientId;
    final prefs = await SharedPreferences.getInstance();
    return {
      'Authorization': 'Bearer ${prefs.getString('auth_token') ?? ''}',
      'x-client-id': clientId,
      'Content-Type': 'application/json',
    };
  }

  Future<void> _loadDetail() async {
    setState(() => _isLoading = true);
    try {
      final res = await http.get(
        Uri.parse('$_apiBase/api/console/projects/${_project.id}'),
        headers: await _headers(),
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        if (mounted) {
          setState(() {
            _project = ProjectData.fromMap(
              (data['project'] as Map<String, dynamic>?) ?? {},
            );
            _lead = data['lead'] is Map<String, dynamic>
                ? (data['lead'] as Map<String, dynamic>)
                : _project.lead;
            _order = data['order'] is Map<String, dynamic>
                ? (data['order'] as Map<String, dynamic>)
                : _project.order;
            _isLoading = false;
          });
        }
      } else {
        if (mounted) {
          setState(() => _isLoading = false);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Failed to load project (HTTP ${res.statusCode})'),
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load project: $e')),
        );
      }
    }
  }

  Future<void> _patch(Map<String, dynamic> body) async {
    setState(() => _isSaving = true);
    try {
      final res = await http.patch(
        Uri.parse('$_apiBase/api/console/projects/${_project.id}'),
        headers: await _headers(),
        body: jsonEncode(body),
      );
      if (res.statusCode == 200) {
        await _loadDetail();
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Project updated'),
            backgroundColor: Colors.green,
          ),
        );
      } else {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to update (HTTP ${res.statusCode})'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to update: $e'), backgroundColor: Colors.red),
      );
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  void _showUpdateStatusSheet() {
    String newStatus = _project.status;
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  'Update Status — ${_project.projectName}',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              RadioGroup<String>(
                groupValue: newStatus,
                onChanged: (val) =>
                    setModalState(() => newStatus = val ?? 'planning'),
                child: Column(
                  children: kProjectStatuses.map((status) {
                    final color = kProjectStatusColors[status] ?? Colors.grey;
                    final icon = kProjectStatusIcons[status] ?? Icons.circle;
                    return RadioListTile<String>(
                      value: status,
                      activeColor: color,
                      secondary: Icon(icon, color: color),
                      title: Text(kProjectStatusLabels[status] ?? status),
                    );
                  }).toList(),
                ),
              ),
              const SizedBox(height: 8),
              Padding(
                padding: const EdgeInsets.all(16),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _isSaving
                        ? null
                        : () async {
                            Navigator.pop(ctx);
                            await _patch({'status': newStatus});
                          },
                    child: const Text('Save Status'),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showProgressSheet() {
    int newProgress = _project.progress;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => Padding(
          padding: EdgeInsets.fromLTRB(
            16,
            16,
            16,
            MediaQuery.of(ctx).viewInsets.bottom + 16,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Update Progress',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 18,
                  color: Theme.of(context).primaryColor,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                '$newProgress%',
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              ),
              Slider(
                value: newProgress.toDouble(),
                min: 0,
                max: 100,
                divisions: 20,
                label: '$newProgress%',
                onChanged: (val) =>
                    setModalState(() => newProgress = val.round()),
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _isSaving
                      ? null
                      : () async {
                          Navigator.pop(ctx);
                          await _patch({'progress': newProgress});
                        },
                  child: const Text('Save Progress'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showEditSheet() {
    final nameController = TextEditingController(text: _project.projectName);
    final budgetController = TextEditingController(
      text: _project.budget > 0 ? _project.budget.toStringAsFixed(0) : '',
    );
    final actualController = TextEditingController(
      text: _project.actualCost > 0
          ? _project.actualCost.toStringAsFixed(0)
          : '',
    );
    final notesController = TextEditingController(text: _project.notes);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => Padding(
          padding: EdgeInsets.fromLTRB(
            16,
            16,
            16,
            MediaQuery.of(ctx).viewInsets.bottom + 16,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Edit Project',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 18,
                    color: Theme.of(context).primaryColor,
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: nameController,
                  decoration: const InputDecoration(
                    labelText: 'Project Name *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.folder_copy),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: budgetController,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Budget (₹)',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.currency_rupee),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: actualController,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Actual Cost (₹)',
                          border: OutlineInputBorder(),
                          prefixIcon: Icon(Icons.receipt_long),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: notesController,
                  decoration: const InputDecoration(
                    labelText: 'Notes',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.notes),
                  ),
                  maxLines: 3,
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _isSaving
                        ? null
                        : () async {
                            final name = nameController.text.trim();
                            if (name.isEmpty) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('Project name is required'),
                                  backgroundColor: Colors.red,
                                ),
                              );
                              return;
                            }
                            Navigator.pop(ctx);
                            await _patch({
                              'project_name': name,
                              'budget':
                                  double.tryParse(budgetController.text.trim()) ?? 0,
                              'actual_cost':
                                  double.tryParse(actualController.text.trim()) ?? 0,
                              'notes': notesController.text.trim(),
                            });
                          },
                    child: const Text('Save Changes'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _confirmDelete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Project'),
        content: Text(
          'Delete "${_project.projectName}"? This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _isSaving = true);
    try {
      final res = await http.delete(
        Uri.parse('$_apiBase/api/console/projects/${_project.id}'),
        headers: await _headers(),
      );
      if (res.statusCode == 200) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Project deleted'),
            backgroundColor: Colors.green,
          ),
        );
        if (mounted) Navigator.pop(context, true);
      } else {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to delete (HTTP ${res.statusCode})'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to delete: $e'), backgroundColor: Colors.red),
      );
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  String _formatDate(DateTime? date) =>
      date == null ? '—' : DateFormat('dd MMM yyyy').format(date);

  Widget _detailRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: Colors.grey.shade600),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                ),
                const SizedBox(height: 2),
                Text(value, style: const TextStyle(fontSize: 14)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final color = kProjectStatusColors[_project.status] ?? Colors.grey;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Project Detail'),
        actions: [
          IconButton(
            icon: const Icon(Icons.delete_outline),
            tooltip: 'Delete',
            onPressed: _isSaving ? null : _confirmDelete,
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: _loadDetail,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _isSaving
              ? const Center(child: CircularProgressIndicator())
              : SingleChildScrollView(
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
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      _project.projectName,
                                      style: const TextStyle(
                                        fontSize: 20,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 10,
                                      vertical: 4,
                                    ),
                                    decoration: BoxDecoration(
                                      color: color.withValues(alpha: 0.1),
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: Text(
                                      (kProjectStatusLabels[_project.status] ??
                                              _project.status)
                                          .toUpperCase(),
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.bold,
                                        color: color,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 16),
                              Row(
                                children: [
                                  Expanded(
                                    child: ClipRRect(
                                      borderRadius: BorderRadius.circular(8),
                                      child: LinearProgressIndicator(
                                        value: (_project.progress / 100)
                                            .clamp(0.0, 1.0),
                                        minHeight: 10,
                                        backgroundColor: Colors.grey.shade200,
                                        color: color,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Text(
                                    '${_project.progress}%',
                                    style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.bold,
                                      color: color,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 16),
                              Row(
                                children: [
                                  Expanded(
                                    child: OutlinedButton.icon(
                                      onPressed: _showUpdateStatusSheet,
                                      icon: const Icon(Icons.flag, size: 18),
                                      label: const Text('Status'),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: OutlinedButton.icon(
                                      onPressed: _showProgressSheet,
                                      icon: const Icon(
                                        Icons.percent,
                                        size: 18,
                                      ),
                                      label: const Text('Progress'),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: OutlinedButton.icon(
                                      onPressed: _showEditSheet,
                                      icon: const Icon(Icons.edit, size: 18),
                                      label: const Text('Edit'),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ).animate().fade().slideY(begin: -0.1),

                      const SizedBox(height: 12),

                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Details',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 8),
                              _detailRow(
                                Icons.calendar_today,
                                'Start Date',
                                _formatDate(_project.startDate),
                              ),
                              _detailRow(
                                Icons.event,
                                'End Date',
                                _formatDate(_project.endDate),
                              ),
                              _detailRow(
                                Icons.currency_rupee,
                                'Budget',
                                '₹${_project.budget.toStringAsFixed(0)}',
                              ),
                              _detailRow(
                                Icons.receipt_long,
                                'Actual Cost',
                                '₹${_project.actualCost.toStringAsFixed(0)}',
                              ),
                              _detailRow(
                                Icons.percent,
                                'Budget Utilisation',
                                '${_project.budgetUtilisation.toStringAsFixed(0)}%',
                              ),
                            ],
                          ),
                        ),
                      ).animate().fade(delay: 100.ms),

                      const SizedBox(height: 12),

                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Linked Records',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 8),
                              if (_lead != null) ...[
                                ListTile(
                                  contentPadding: EdgeInsets.zero,
                                  leading: CircleAvatar(
                                    backgroundColor: Colors.teal.withValues(
                                      alpha: 0.1,
                                    ),
                                    child: const Icon(
                                      Icons.person,
                                      color: Colors.teal,
                                    ),
                                  ),
                                  title: Text(
                                    _lead!['name']?.toString() ?? 'Lead',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  subtitle: Text(
                                    [
                                      if (_lead!['company'] != null)
                                        _lead!['company'].toString(),
                                      if (_lead!['phone'] != null)
                                        _lead!['phone'].toString(),
                                    ].join(' • '),
                                  ),
                                ),
                              ] else
                                Text(
                                  'No linked lead',
                                  style: TextStyle(
                                    color: Colors.grey.shade500,
                                  ),
                                ),
                              const SizedBox(height: 4),
                              if (_order != null) ...[
                                ListTile(
                                  contentPadding: EdgeInsets.zero,
                                  leading: CircleAvatar(
                                    backgroundColor: Colors.indigo.withValues(
                                      alpha: 0.1,
                                    ),
                                    child: const Icon(
                                      Icons.local_shipping,
                                      color: Colors.indigo,
                                    ),
                                  ),
                                  title: Text(
                                    _order!['order_number']?.toString() ??
                                        'Order',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  subtitle: Text(
                                    _order!['status']?.toString() ?? '',
                                  ),
                                  trailing: const Icon(Icons.chevron_right),
                                  onTap: () => Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (context) => OrderDetailScreen(
                                        order: OrderData.fromMap({
                                          'id': _order!['id'],
                                          'order_no':
                                              _order!['order_number'] ?? '',
                                          'status': _order!['status'] ?? '',
                                          'total_amount':
                                              _order!['total_amount'] ?? 0,
                                        }),
                                      ),
                                    ),
                                  ),
                                ),
                              ] else
                                Text(
                                  'No linked order',
                                  style: TextStyle(
                                    color: Colors.grey.shade500,
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ).animate().fade(delay: 150.ms),

                      if (_project.notes.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'Notes',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(_project.notes),
                              ],
                            ),
                          ),
                        ).animate().fade(delay: 200.ms),
                      ],
                    ],
                  ),
                ),
    );
  }
}
