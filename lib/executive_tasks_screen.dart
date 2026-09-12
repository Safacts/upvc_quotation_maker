import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app_state.dart';
import 'services/field_task_service.dart';
import 'executive_task_detail_screen.dart';

/// executive_tasks_screen.dart -- ADDITIVE ONLY. Field task list.
class ExecutiveTasksScreen extends StatefulWidget {
  const ExecutiveTasksScreen({super.key});

  @override
  State<ExecutiveTasksScreen> createState() => _ExecutiveTasksScreenState();
}

class _ExecutiveTasksScreenState extends State<ExecutiveTasksScreen> {
  List<FieldTask> _tasks = [];
  bool _loading = true;
  String _filter = 'all';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final cfg =
        Provider.of<AppState>(context, listen: false).clientConfig;
    final rows = await FieldTaskService.instance.fetchMyTasks(
      clientId: cfg.clientId,
      assignee: '',
    );
    await FieldTaskService.instance.flushQueue(cfg.clientId);
    if (mounted) {
      setState(() {
        _tasks = rows;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final shown = _filter == 'all'
        ? _tasks
        : _tasks.where((t) => t.status == _filter).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('My visits')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: Column(
                children: [
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.all(8),
                    child: Row(
                      children: ['all', 'pending', 'in_progress', 'done']
                          .map((s) => Padding(
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 4),
                                child: ChoiceChip(
                                  label: Text(s),
                                  selected: _filter == s,
                                  onSelected: (_) =>
                                      setState(() => _filter = s),
                                ),
                              ))
                          .toList(),
                    ),
                  ),
                  Expanded(
                    child: shown.isEmpty
                        ? const Center(child: Text('No visits assigned yet.'))
                        : ListView.builder(
                            itemCount: shown.length,
                            itemBuilder: (_, i) {
                              final t = shown[i];
                              return Card(
                                margin: const EdgeInsets.symmetric(
                                    horizontal: 12, vertical: 6),
                                child: ListTile(
                                  title: Text(t.title.isEmpty
                                      ? '(Untitled visit)'
                                      : t.title),
                                  subtitle: Text(
                                      '${t.status} • ${t.assignedTo}'),
                                  trailing: const Icon(Icons.chevron_right),
                                  onTap: () async {
                                    await Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) =>
                                            ExecutiveTaskDetailScreen(
                                                task: t),
                                      ),
                                    );
                                    _load();
                                  },
                                ),
                              );
                            },
                          ),
                  ),
                ],
              ),
            ),
    );
  }
}
