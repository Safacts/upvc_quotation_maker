import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import 'app_state.dart';
import 'project_detail_screen.dart';

/// Backend project statuses (mirrors `PROJECT_STATUSES` in
/// `app/api/console/projects/route.ts`).
const List<String> kProjectStatuses = [
  'planning',
  'in_progress',
  'on_hold',
  'completed',
  'cancelled',
];

const Map<String, String> kProjectStatusLabels = {
  'planning': 'Planning',
  'in_progress': 'In Progress',
  'on_hold': 'On Hold',
  'completed': 'Completed',
  'cancelled': 'Cancelled',
};

const Map<String, Color> kProjectStatusColors = {
  'planning': Colors.blue,
  'in_progress': Colors.orange,
  'on_hold': Colors.amber,
  'completed': Colors.green,
  'cancelled': Colors.red,
};

const Map<String, IconData> kProjectStatusIcons = {
  'planning': Icons.edit_calendar,
  'in_progress': Icons.construction,
  'on_hold': Icons.pause_circle,
  'completed': Icons.task_alt,
  'cancelled': Icons.cancel,
};

class ProjectData {
  String? id;
  String projectName = '';
  String status = 'planning';
  String? leadId;
  String? orderId;
  DateTime? startDate;
  DateTime? endDate;
  double budget = 0;
  double actualCost = 0;
  int progress = 0;
  String notes = '';
  DateTime createdAt;
  DateTime updatedAt;

  /// Denormalised linked entities returned by the list endpoint.
  Map<String, dynamic>? lead;
  Map<String, dynamic>? order;

  ProjectData({
    this.id,
    this.projectName = '',
    this.status = 'planning',
    this.leadId,
    this.orderId,
    this.startDate,
    this.endDate,
    this.budget = 0,
    this.actualCost = 0,
    this.progress = 0,
    this.notes = '',
    DateTime? createdAt,
    DateTime? updatedAt,
    this.lead,
    this.order,
  })  : createdAt = createdAt ?? DateTime.now(),
        updatedAt = updatedAt ?? DateTime.now();

  double get budgetUtilisation =>
      budget > 0 ? ((actualCost / budget) * 100).clamp(0, 999) : 0;

  Map<String, dynamic> toMap({String? clientId}) => {
        if (id != null) 'id': id,
        'project_name': projectName,
        'status': status,
        if (leadId != null && leadId!.isNotEmpty) 'lead_id': leadId,
        if (orderId != null && orderId!.isNotEmpty) 'order_id': orderId,
        'start_date': startDate?.toIso8601String(),
        'end_date': endDate?.toIso8601String(),
        'budget': budget,
        'actual_cost': actualCost,
        'progress': progress,
        'notes': notes,
        if (clientId != null && clientId.isNotEmpty) 'client_id': clientId,
      };

  static DateTime? _parseDate(dynamic value) {
    if (value == null) return null;
    final s = value.toString();
    if (s.isEmpty || s == 'null') return null;
    return DateTime.tryParse(s);
  }

  static ProjectData fromMap(Map<String, dynamic> map) {
    return ProjectData(
      id: map['id'] as String?,
      projectName: (map['project_name'] ?? '') as String,
      status: (map['status'] ?? 'planning') as String,
      leadId: map['lead_id'] as String?,
      orderId: map['order_id'] as String?,
      startDate: _parseDate(map['start_date']),
      endDate: _parseDate(map['end_date']),
      budget: (map['budget'] as num?)?.toDouble() ?? 0,
      actualCost: (map['actual_cost'] as num?)?.toDouble() ?? 0,
      progress: (map['progress'] as num?)?.toInt() ?? 0,
      notes: (map['notes'] ?? '') as String,
      createdAt:
          _parseDate(map['created_at']) ?? DateTime.now(),
      updatedAt:
          _parseDate(map['updated_at']) ?? DateTime.now(),
      lead: map['lead'] is Map<String, dynamic>
          ? (map['lead'] as Map<String, dynamic>)
          : null,
      order: map['order'] is Map<String, dynamic>
          ? (map['order'] as Map<String, dynamic>)
          : null,
    );
  }
}

class ProjectScreen extends StatefulWidget {
  const ProjectScreen({super.key});

  @override
  State<ProjectScreen> createState() => _ProjectScreenState();
}

class _ProjectScreenState extends State<ProjectScreen> {
  List<ProjectData> _projects = [];
  bool _isLoading = true;
  String _searchQuery = '';
  String _selectedStatus = 'all';

  @override
  void initState() {
    super.initState();
    _loadProjects();
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

  Future<void> _loadProjects() async {
    setState(() => _isLoading = true);
    try {
      final query = _searchQuery.trim();
      final url = Uri.parse('$_apiBase/api/console/projects').replace(
        queryParameters: {
          if (query.isNotEmpty) 'q': query,
          if (_selectedStatus != 'all') 'status': _selectedStatus,
          'page_size': '200',
        },
      );
      final res = await http.get(url, headers: await _headers());
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final rows = (data['rows'] as List? ?? [])
            .cast<Map<String, dynamic>>()
            .map(ProjectData.fromMap)
            .toList();
        if (mounted) {
          setState(() {
            _projects = rows;
            _isLoading = false;
          });
        }
      } else {
        if (mounted) {
          setState(() => _isLoading = false);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Failed to load projects (HTTP ${res.statusCode})'),
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load projects: $e')),
        );
      }
    }
  }

  List<ProjectData> get _filteredProjects {
    final query = _searchQuery.toLowerCase();
    return _projects.where((p) {
      final matchesSearch =
          query.isEmpty || p.projectName.toLowerCase().contains(query);
      final matchesStatus =
          _selectedStatus == 'all' || p.status == _selectedStatus;
      return matchesSearch && matchesStatus;
    }).toList();
  }

  int get _inProgressCount =>
      _projects.where((p) => p.status == 'in_progress').length;
  int get _completedCount =>
      _projects.where((p) => p.status == 'completed').length;
  double get _totalBudget =>
      _projects.fold(0.0, (sum, p) => sum + p.budget);

  void _showCreateSheet() {
    final nameController = TextEditingController();
    final budgetController = TextEditingController();
    final actualController = TextEditingController();
    final notesController = TextEditingController();
    String selectedStatus = 'planning';

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
                  'New Project',
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
                DropdownButtonFormField<String>(
                  initialValue: selectedStatus,
                  decoration: const InputDecoration(
                    labelText: 'Status',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.flag),
                  ),
                  items: kProjectStatuses
                      .map(
                        (s) => DropdownMenuItem(
                          value: s,
                          child: Text(kProjectStatusLabels[s] ?? s),
                        ),
                      )
                      .toList(),
                  onChanged: (val) =>
                      setModalState(() => selectedStatus = val ?? 'planning'),
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
                  maxLines: 2,
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () async {
                      if (nameController.text.trim().isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Project name is required'),
                            backgroundColor: Colors.red,
                          ),
                        );
                        return;
                      }
                      final project = ProjectData(
                        projectName: nameController.text.trim(),
                        status: selectedStatus,
                        budget:
                            double.tryParse(budgetController.text.trim()) ?? 0,
                        actualCost:
                            double.tryParse(actualController.text.trim()) ?? 0,
                        notes: notesController.text.trim(),
                      );
                      try {
                        final res = await http.post(
                          Uri.parse('$_apiBase/api/console/projects'),
                          headers: await _headers(),
                          body: jsonEncode(project.toMap()),
                        );
                        if (res.statusCode == 201 || res.statusCode == 200) {
                          if (!ctx.mounted) return;
                          Navigator.pop(ctx);
                          _loadProjects();
                          if (!mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Project created'),
                              backgroundColor: Colors.green,
                            ),
                          );
                        } else {
                          if (!ctx.mounted) return;
                          ScaffoldMessenger.of(ctx).showSnackBar(
                            SnackBar(
                              content: Text(
                                'Failed to create (HTTP ${res.statusCode})',
                              ),
                              backgroundColor: Colors.red,
                            ),
                          );
                        }
                      } catch (e) {
                        if (!ctx.mounted) return;
                        ScaffoldMessenger.of(ctx).showSnackBar(
                          SnackBar(
                            content: Text('Failed to create: $e'),
                            backgroundColor: Colors.red,
                          ),
                        );
                      }
                    },
                    child: const Text('Create Project'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Projects'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadProjects,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: Row(
                    children: [
                      _buildSummaryCard(
                        'Total',
                        _projects.length.toString(),
                        Icons.folder_copy,
                        Colors.indigo,
                      ),
                      const SizedBox(width: 8),
                      _buildSummaryCard(
                        'In Progress',
                        _inProgressCount.toString(),
                        Icons.construction,
                        Colors.orange,
                      ),
                      const SizedBox(width: 8),
                      _buildSummaryCard(
                        'Completed',
                        _completedCount.toString(),
                        Icons.task_alt,
                        Colors.green,
                      ),
                      const SizedBox(width: 8),
                      _buildSummaryCard(
                        'Budget',
                        '₹${_totalBudget.toStringAsFixed(0)}',
                        Icons.currency_rupee,
                        Colors.purple,
                      ),
                    ],
                  ),
                ).animate().fade().slideY(begin: -0.1),

                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: TextField(
                    decoration: const InputDecoration(
                      hintText: 'Search projects...',
                      prefixIcon: Icon(Icons.search, size: 20),
                    ),
                    onChanged: (val) => setState(() => _searchQuery = val),
                  ),
                ).animate().fade(delay: 100.ms),

                SizedBox(
                  height: 48,
                  child: ListView.builder(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    itemCount: kProjectStatuses.length + 1,
                    itemBuilder: (context, index) {
                      final status =
                          index == 0 ? 'all' : kProjectStatuses[index - 1];
                      final isSelected = _selectedStatus == status;
                      final label = status == 'all'
                          ? 'All'
                          : (kProjectStatusLabels[status] ?? status);
                      final color = status == 'all'
                          ? Colors.grey
                          : (kProjectStatusColors[status] ?? Colors.grey);
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(label),
                          selected: isSelected,
                          selectedColor: color,
                          labelStyle: TextStyle(
                            color: isSelected
                                ? Colors.white
                                : Colors.grey.shade700,
                            fontSize: 13,
                          ),
                          onSelected: (_) => setState(
                            () => _selectedStatus = status,
                          ),
                        ),
                      );
                    },
                  ),
                ),

                Expanded(
                  child: _filteredProjects.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.folder_open,
                                size: 60,
                                color: Colors.grey.shade400,
                              ),
                              const SizedBox(height: 16),
                              Text(
                                'No projects found',
                                style: TextStyle(
                                  color: Colors.grey.shade500,
                                  fontSize: 18,
                                ),
                              ),
                            ],
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: _loadProjects,
                          child: ListView.builder(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            itemCount: _filteredProjects.length,
                            itemBuilder: (context, index) => _buildProjectCard(
                              _filteredProjects[index],
                            ),
                          ),
                        ),
                ),
              ],
            ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showCreateSheet,
        child: const Icon(Icons.add),
      ),
    );
  }

  Widget _buildSummaryCard(
    String label,
    String value,
    IconData icon,
    Color color,
  ) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(height: 6),
            Text(
              value,
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: color),
              overflow: TextOverflow.ellipsis,
            ),
            Text(
              label,
              style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProjectCard(ProjectData project) {
    final color = kProjectStatusColors[project.status] ?? Colors.grey;
    final icon = kProjectStatusIcons[project.status] ?? Icons.circle;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => ProjectDetailScreen(project: project),
            ),
          ).then((_) => _loadProjects());
        },
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    backgroundColor: color.withValues(alpha: 0.1),
                    child: Icon(icon, color: color, size: 20),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      project.projectName,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      (kProjectStatusLabels[project.status] ?? project.status)
                          .toUpperCase(),
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: color,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: LinearProgressIndicator(
                        value: project.progress / 100,
                        minHeight: 6,
                        backgroundColor: Colors.grey.shade200,
                        color: color,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${project.progress}%',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: color,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  if (project.lead != null)
                    Padding(
                      padding: const EdgeInsets.only(right: 12),
                      child: Text(
                        '👤 ${project.lead!['name'] ?? ''}',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade600,
                        ),
                      ),
                    ),
                  if (project.order != null)
                    Padding(
                      padding: const EdgeInsets.only(right: 12),
                      child: Text(
                        '📦 ${project.order!['order_number'] ?? ''}',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade600,
                        ),
                      ),
                    ),
                  if (project.budget > 0)
                    Text(
                      '₹${project.budget.toStringAsFixed(0)}',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: Colors.grey.shade800,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                'Updated ${DateFormat('dd MMM yyyy').format(project.updatedAt)}',
                style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
              ),
            ],
          ),
        ),
      ),
    ).animate().fade(delay: Duration(milliseconds: 30 * _filteredProjects.indexOf(project))).slideX(begin: 0.05);
  }
}
