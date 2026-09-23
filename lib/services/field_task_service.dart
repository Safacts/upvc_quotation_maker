import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../supabase_config.dart';

/// field_task_service.dart -- ADDITIVE ONLY.
///
/// CRUD for the 055 field tables. Uses the same tenant header pattern as the
/// rest of the app (`x-client-id`) and queues offline writes in
/// SharedPreferences (NOT SQLite) so `offline_database.dart` stays untouched.
///
/// Tables: executive_tasks, task_checkins, followup_reminders, whatsapp_logs.
class FieldTask {
  final String? id;
  final String title;
  final String description;
  final String? leadId;
  final String? quotationId;
  final String assignedTo;
  final String status;
  final int priority;
  final DateTime? dueAt;

  const FieldTask({
    this.id,
    this.title = '',
    this.description = '',
    this.leadId,
    this.quotationId,
    this.assignedTo = '',
    this.status = 'pending',
    this.priority = 1,
    this.dueAt,
  });

  factory FieldTask.fromMap(Map<String, dynamic> m) => FieldTask(
        id: m['id'] as String?,
        title: (m['title'] ?? '').toString(),
        description: (m['description'] ?? '').toString(),
        leadId: m['lead_id'] as String?,
        quotationId: m['quotation_id'] as String?,
        assignedTo: (m['assigned_to'] ?? '').toString(),
        status: (m['status'] ?? 'pending').toString(),
        priority: (m['priority'] as num?)?.toInt() ?? 1,
        dueAt: m['due_at'] != null
            ? DateTime.tryParse(m['due_at'].toString())
            : null,
      );

  Map<String, dynamic> toInsert(String clientId) => {
        'client_id': clientId,
        'title': title,
        'description': description,
        if (leadId != null && leadId!.isNotEmpty) 'lead_id': leadId,
        if (quotationId != null && quotationId!.isNotEmpty)
          'quotation_id': quotationId,
        'assigned_to': assignedTo,
        'status': status,
        'priority': priority,
        if (dueAt != null) 'due_at': dueAt!.toUtc().toIso8601String(),
      };
}

class FieldTaskService {
  FieldTaskService._();
  static final FieldTaskService instance = FieldTaskService._();

  static const _queuePrefix = 'field_task_queue_v1_';

  Future<List<FieldTask>> fetchMyTasks({
    required String clientId,
    required String assignee,
  }) async {
    try {
      dynamic q = SupabaseConfig.client
          .from('executive_tasks')
          .select()
          .eq('client_id', clientId)
          .order('created_at', ascending: false)
          .limit(200);
      if (assignee.isNotEmpty) {
        q = q.eq('assigned_to', assignee);
      }
      final res = await q as List;
      return res
          .map((e) => FieldTask.fromMap(Map<String, dynamic>.from(e as Map)))
          .toList();
    } catch (e) {
      debugPrint('[FieldTask] fetch failed: $e');
      return [];
    }
  }

  Future<bool> createTask({
    required String clientId,
    required FieldTask task,
  }) async {
    final body = task.toInsert(clientId);
    try {
      await SupabaseConfig.client.from('executive_tasks').insert(body);
      return true;
    } catch (e) {
      debugPrint('[FieldTask] offline, queueing: $e');
      await _enqueue(clientId, {'kind': 'task', 'body': body});
      return false;
    }
  }

  Future<bool> markDone({
    required String clientId,
    required String taskId,
    double? lat,
    double? lng,
    double? accuracyM,
    String address = '',
  }) async {
    try {
      await SupabaseConfig.client.from('executive_tasks').update({
        'status': 'done',
        'done_at': DateTime.now().toUtc().toIso8601String(),
        if (lat != null) 'location_lat': lat,
        if (lng != null) 'location_lng': lng,
        if (address.isNotEmpty) 'location_address': address,
      }).eq('id', taskId).eq('client_id', clientId);
      return true;
    } catch (e) {
      debugPrint('[FieldTask] markDone queued: $e');
      await _enqueue(clientId, {
        'kind': 'done',
        'task_id': taskId,
        'lat': lat,
        'lng': lng,
        'accuracy_m': accuracyM,
        'address': address,
      });
      return false;
    }
  }

  Future<bool> checkIn({
    required String clientId,
    required String taskId,
    required String userId,
    double? lat,
    double? lng,
    double? accuracyM,
    String address = '',
    String note = '',
  }) async {
    final body = {
      'client_id': clientId,
      'task_id': taskId,
      'user_id': userId,
      'lat': lat,
      'lng': lng,
      'accuracy_m': accuracyM,
      'address': address,
      'note': note,
    };
    try {
      await SupabaseConfig.client.from('task_checkins').insert(body);
      return true;
    } catch (e) {
      debugPrint('[FieldTask] checkin queued: $e');
      await _enqueue(clientId, {'kind': 'checkin', 'body': body});
      return false;
    }
  }

  Future<bool> scheduleFollowup({
    required String clientId,
    String? leadId,
    String? quotationId,
    String assignedTo = '',
    required DateTime remindAt,
    String channel = 'push',
  }) async {
    try {
      await SupabaseConfig.client.from('followup_reminders').insert({
        'client_id': clientId,
        if (leadId != null && leadId.isNotEmpty) 'lead_id': leadId,
        if (quotationId != null && quotationId.isNotEmpty)
          'quotation_id': quotationId,
        'assigned_to': assignedTo,
        'remind_at': remindAt.toUtc().toIso8601String(),
        'channel': channel,
      });
      return true;
    } catch (e) {
      debugPrint('[FieldTask] followup queued: $e');
      await _enqueue(clientId, {
        'kind': 'followup',
        'lead_id': leadId,
        'quotation_id': quotationId,
        'assigned_to': assignedTo,
        'remind_at': remindAt.toUtc().toIso8601String(),
        'channel': channel,
      });
      return false;
    }
  }

  Future<bool> logShare({
    required String clientId,
    required String toPhone,
    required String message,
    String template = 'field_quote_sent',
    String channel = 'wa.me',
    String relatedId = '',
  }) async {
    try {
      await SupabaseConfig.client.from('whatsapp_logs').insert({
        'client_id': clientId,
        'to_phone': toPhone,
        'template': template,
        'message': message.length > 2000 ? message.substring(0, 2000) : message,
        if (relatedId.isNotEmpty) 'related_id': relatedId,
        'channel': channel,
        'status': 'logged',
      });
      return true;
    } catch (e) {
      debugPrint('[FieldTask] logShare skipped offline: $e');
      return false;
    }
  }

  Future<void> flushQueue(String clientId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final key = '$_queuePrefix$clientId';
      final raw = prefs.getStringList(key) ?? [];
      if (raw.isEmpty) return;
      final remaining = <String>[];
      for (final s in raw) {
        try {
          final m = Map<String, dynamic>.from(
              jsonDecode(s) as Map<String, dynamic>);
          final kind = (m['kind'] ?? '').toString();
          if (kind == 'task') {
            await SupabaseConfig.client
                .from('executive_tasks')
                .insert(Map<String, dynamic>.from(m['body'] as Map));
          } else if (kind == 'checkin') {
            await SupabaseConfig.client
                .from('task_checkins')
                .insert(Map<String, dynamic>.from(m['body'] as Map));
          } else if (kind == 'followup') {
            await SupabaseConfig.client.from('followup_reminders').insert({
              'client_id': clientId,
              if ((m['lead_id'] ?? '').toString().isNotEmpty)
                'lead_id': m['lead_id'],
              if ((m['quotation_id'] ?? '').toString().isNotEmpty)
                'quotation_id': m['quotation_id'],
              'assigned_to': (m['assigned_to'] ?? '').toString(),
              'remind_at': m['remind_at'],
              'channel': (m['channel'] ?? 'push').toString(),
            });
          } else if (kind == 'done') {
            await SupabaseConfig.client
                .from('executive_tasks')
                .update({'status': 'done'}).eq('id', m['task_id']);
          }
        } catch (_) {
          remaining.add(s);
        }
      }
      await prefs.setStringList(key, remaining);
    } catch (_) {}
  }

  Future<void> _enqueue(String clientId, Map<String, dynamic> item) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final key = '$_queuePrefix$clientId';
      final raw = prefs.getStringList(key) ?? [];
      raw.add(jsonEncode({...item, 'op': const Uuid().v4()}));
      await prefs.setStringList(key, raw);
    } catch (_) {}
  }
}
