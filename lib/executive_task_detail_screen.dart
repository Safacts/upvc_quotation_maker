import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app_state.dart';
import 'quotation_screen.dart';
import 'services/field_task_service.dart';
import 'widgets/checkin_sheet.dart';

/// executive_task_detail_screen.dart -- ADDITIVE ONLY.
class ExecutiveTaskDetailScreen extends StatelessWidget {
  final FieldTask task;
  const ExecutiveTaskDetailScreen({super.key, required this.task});

  @override
  Widget build(BuildContext context) {
    final cfg = Provider.of<AppState>(context, listen: false).clientConfig;
    return Scaffold(
      appBar: AppBar(title: Text(task.title.isEmpty ? 'Visit' : task.title)),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(task.description.isEmpty ? 'No notes.' : task.description),
            const SizedBox(height: 8),
            Text('Status: ${task.status}'),
            if (task.dueAt != null) Text('Due: ${task.dueAt!.toLocal()}'),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                icon: const Icon(Icons.my_location),
                label: const Text('Check-in at site'),
                onPressed: () {
                  showModalBottomSheet(
                    context: context,
                    isScrollControlled: true,
                    shape: const RoundedRectangleBorder(
                      borderRadius:
                          BorderRadius.vertical(top: Radius.circular(20)),
                    ),
                    builder: (_) => CheckinSheet(
                      clientId: cfg.clientId,
                      taskId: task.id ?? '',
                      userId: cfg.clientId,
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                icon: const Icon(Icons.request_quote_outlined),
                label: const Text('New quotation for this visit'),
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => const QuotationScreen()),
                  );
                },
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                icon: const Icon(Icons.check_circle_outline),
                label: const Text('Mark visit done'),
                onPressed: () async {
                  final ok =
                      await FieldTaskService.instance.markDone(
                    clientId: cfg.clientId,
                    taskId: task.id ?? '',
                  );
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                        content: Text(ok
                            ? 'Visit marked done.'
                            : 'Saved on device. Will sync when online.')));
                    Navigator.pop(context);
                  }
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
