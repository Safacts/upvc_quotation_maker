import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'app_state.dart';
import 'supabase_config.dart';
import 'leads_screen.dart';

class LeadActivity {
  String? id;
  String leadId = '';
  String type = 'note';
  String description = '';
  DateTime createdAt;

  LeadActivity({
    this.id,
    this.leadId = '',
    this.type = 'note',
    this.description = '',
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  Map<String, dynamic> toMap({String? clientId}) => {
    if (id != null) 'id': id,
    'lead_id': leadId,
    'type': type,
    'description': description,
    if (clientId != null && clientId.isNotEmpty) 'client_id': clientId,
  };

  static LeadActivity fromMap(Map<String, dynamic> map) {
    return LeadActivity(
      id: map['id'] as String?,
      leadId: (map['lead_id'] ?? '') as String,
      type: (map['type'] ?? 'note') as String,
      description: (map['description'] ?? '') as String,
      createdAt: map['created_at'] != null
          ? DateTime.tryParse(map['created_at'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}

class LeadDetailScreen extends StatefulWidget {
  final LeadData lead;

  const LeadDetailScreen({super.key, required this.lead});

  @override
  State<LeadDetailScreen> createState() => _LeadDetailScreenState();
}

class _LeadDetailScreenState extends State<LeadDetailScreen> {
  late LeadData _lead;
  List<LeadActivity> _activities = [];
  bool _isLoadingActivities = true;

  static const Map<String, Color> _statusColors = {
    'new': Colors.blue,
    'contacted': Colors.teal,
    'qualified': Colors.purple,
    'proposal': Colors.orange,
    'negotiation': Colors.amber,
    'won': Colors.green,
    'lost': Colors.red,
  };

  static const Map<String, IconData> _activityIcons = {
    'note': Icons.notes,
    'call': Icons.phone,
    'email': Icons.email,
    'meeting': Icons.meeting_room,
    'whatsapp': Icons.chat,
    'status_change': Icons.update,
  };

  @override
  void initState() {
    super.initState();
    _lead = widget.lead;
    _loadActivities();
  }

  Future<void> _loadActivities() async {
    setState(() => _isLoadingActivities = true);
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final response = await SupabaseConfig.client
          .from('lead_activities')
          .select()
          .eq('lead_id', _lead.id!)
          .eq('client_id', clientId)
          .order('created_at', ascending: false);

      if (mounted) {
        setState(() {
          _activities = (response as List).map((e) => LeadActivity.fromMap(e)).toList();
          _isLoadingActivities = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoadingActivities = false);
      }
    }
  }

  Future<void> _makeCall() async {
    if (_lead.phone.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No phone number available'), backgroundColor: Colors.orange),
      );
      return;
    }
    final uri = Uri.parse('tel:${_lead.phone}');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Future<void> _openWhatsApp() async {
    if (_lead.phone.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No phone number available'), backgroundColor: Colors.orange),
      );
      return;
    }
    final phone = _lead.phone.replaceAll(RegExp(r'[^0-9]'), '');
    final uri = Uri.parse('https://wa.me/$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  void _showAddActivitySheet() {
    String selectedType = 'note';
    final descController = TextEditingController();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => Padding(
          padding: EdgeInsets.fromLTRB(
            16, 16, 16, MediaQuery.of(ctx).viewInsets.bottom + 16,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Add Activity',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 18,
                    color: Theme.of(context).primaryColor,
                  ),
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _activityIcons.entries.map((entry) {
                    final isSelected = selectedType == entry.key;
                    final color = isSelected ? Theme.of(context).primaryColor : Colors.grey.shade300;
                    return ChoiceChip(
                      avatar: Icon(entry.value, size: 16, color: isSelected ? Colors.white : Colors.grey.shade600),
                      label: Text(entry.key[0].toUpperCase() + entry.key.substring(1).replaceAll('_', ' ')),
                      selected: isSelected,
                      selectedColor: Theme.of(context).primaryColor,
                      labelStyle: TextStyle(
                        color: isSelected ? Colors.white : Colors.grey.shade700,
                        fontSize: 12,
                      ),
                      onSelected: (_) => setModalState(() => selectedType = entry.key),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: descController,
                  decoration: const InputDecoration(
                    labelText: 'Description *',
                    border: OutlineInputBorder(),
                  ),
                  maxLines: 3,
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () async {
                      if (descController.text.isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Description is required'), backgroundColor: Colors.red),
                        );
                        return;
                      }
                      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
                      final activity = LeadActivity(
                        leadId: _lead.id!,
                        type: selectedType,
                        description: descController.text.trim(),
                      );

                      try {
                        await SupabaseConfig.client
                            .from('lead_activities')
                            .insert(activity.toMap(clientId: clientId));
                        // Update last_activity on lead
                        await SupabaseConfig.client
                            .from('leads')
                            .update({'last_activity': DateTime.now().toIso8601String()})
                            .eq('id', _lead.id!)
                            .eq('client_id', clientId);
                        Navigator.pop(ctx);
                        _loadActivities();
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Activity added'), backgroundColor: Colors.green),
                        );
                      } catch (e) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Failed to add: $e'), backgroundColor: Colors.red),
                        );
                      }
                    },
                    child: const Text('Save Activity'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showUpdateStatusSheet() {
    String newStatus = _lead.status;
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
                  'Update Status — ${_lead.name}',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                ),
              ),
              const SizedBox(height: 16),
              ...['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'].map((status) {
                final color = _statusColors[status]!;
                return RadioListTile<String>(
                  value: status,
                  groupValue: newStatus,
                  onChanged: (val) => setModalState(() => newStatus = val ?? status),
                  title: Text(status[0].toUpperCase() + status.substring(1)),
                  activeColor: color,
                );
              }),
              const SizedBox(height: 8),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: newStatus == _lead.status
                        ? null
                        : () async {
                            try {
                              final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
                              await SupabaseConfig.client
                                  .from('leads')
                                  .update({'status': newStatus})
                                  .eq('id', _lead.id!)
                                  .eq('client_id', clientId);
                              setState(() => _lead.status = newStatus);
                              Navigator.pop(ctx);
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('Status updated to $newStatus'), backgroundColor: Colors.green),
                              );
                            } catch (e) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('Failed to update: $e'), backgroundColor: Colors.red),
                              );
                            }
                          },
                    child: const Text('Update'),
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final color = _statusColors[_lead.status] ?? Colors.grey;

    return Scaffold(
      appBar: AppBar(
        title: Text(_lead.name),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit),
            onPressed: _showUpdateStatusSheet,
            tooltip: 'Update Status',
          ),
        ],
      ),
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Status banner
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              color: color.withValues(alpha: 0.1),
              child: Row(
                children: [
                  Icon(_activityIcons['status_change'], color: color, size: 20),
                  const SizedBox(width: 8),
                  Text(
                    'Status: ${_lead.status[0].toUpperCase() + _lead.status.substring(1)}',
                    style: TextStyle(fontWeight: FontWeight.bold, color: color, fontSize: 14),
                  ),
                  const Spacer(),
                  if (_lead.value > 0)
                    Text(
                      '₹${_lead.value.toStringAsFixed(0)}',
                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Colors.grey.shade800),
                    ),
                ],
              ),
            ),

            // Quick actions
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _makeCall,
                      icon: const Icon(Icons.phone, size: 18),
                      label: const Text('Call'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _openWhatsApp,
                      icon: const FaIcon(FontAwesomeIcons.whatsapp, size: 18),
                      label: const Text('WhatsApp'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.green,
                        side: const BorderSide(color: Colors.green),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _showUpdateStatusSheet,
                      icon: const Icon(Icons.update, size: 18),
                      label: const Text('Status'),
                    ),
                  ),
                ],
              ),
            ),

            // Contact info
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Contact Information',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Theme.of(context).primaryColor),
                      ),
                      const SizedBox(height: 12),
                      if (_lead.company.isNotEmpty)
                        _infoRow(Icons.business, 'Company', _lead.company),
                      if (_lead.phone.isNotEmpty)
                        _infoRow(Icons.phone, 'Phone', _lead.phone),
                      if (_lead.email.isNotEmpty)
                        _infoRow(Icons.email, 'Email', _lead.email),
                      if (_lead.source.isNotEmpty)
                        _infoRow(Icons.source, 'Source', _lead.source),
                      _infoRow(Icons.calendar_today, 'Created', DateFormat('dd MMM yyyy').format(_lead.createdAt)),
                    ],
                  ),
                ),
              ),
            ),

            // Notes
            if (_lead.notes.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Notes',
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Theme.of(context).primaryColor),
                        ),
                        const SizedBox(height: 8),
                        Text(_lead.notes, style: TextStyle(color: Colors.grey.shade700)),
                      ],
                    ),
                  ),
                ),
              ),

            // Activity timeline
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Text(
                'Activity Timeline',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Theme.of(context).primaryColor),
              ),
            ),

            if (_isLoadingActivities)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_activities.isEmpty)
              Padding(
                padding: const EdgeInsets.all(24),
                child: Center(
                  child: Text(
                    'No activities yet',
                    style: TextStyle(color: Colors.grey.shade500),
                  ),
                ),
              )
            else
              ..._activities.map((activity) => _buildActivityTile(activity)),

            const SizedBox(height: 80),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showAddActivitySheet,
        child: const Icon(Icons.add),
      ),
    );
  }

  Widget _infoRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 16, color: Colors.grey.shade500),
          const SizedBox(width: 8),
          Text('$label: ', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActivityTile(LeadActivity activity) {
    final icon = _activityIcons[activity.type] ?? Icons.notes;
    final color = activity.type == 'call'
        ? Colors.blue
        : activity.type == 'whatsapp'
            ? Colors.green
            : activity.type == 'email'
                ? Colors.orange
                : Colors.grey;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              CircleAvatar(
                radius: 14,
                backgroundColor: color.withValues(alpha: 0.1),
                child: Icon(icon, color: color, size: 16),
              ),
              Container(
                width: 1,
                height: 30,
                color: Colors.grey.shade300,
              ),
            ],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Card(
              margin: const EdgeInsets.only(bottom: 4),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          activity.type[0].toUpperCase() + activity.type.substring(1).replaceAll('_', ' '),
                          style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12, color: color),
                        ),
                        const Spacer(),
                        Text(
                          _timeAgo(activity.createdAt),
                          style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      activity.description,
                      style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    ).animate().fade();
  }

  String _timeAgo(DateTime dateTime) {
    final diff = DateTime.now().difference(dateTime);
    if (diff.inDays > 30) return DateFormat('dd MMM').format(dateTime);
    if (diff.inDays > 0) return '${diff.inDays}d ago';
    if (diff.inHours > 0) return '${diff.inHours}h ago';
    if (diff.inMinutes > 0) return '${diff.inMinutes}m ago';
    return 'Just now';
  }
}
