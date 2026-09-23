import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app_state.dart';
import 'dashboard_screen.dart';
import 'executive_tasks_screen.dart';
import 'fabricator_switch_screen.dart';
import 'leads_screen.dart';
import 'quotation_screen.dart';
import 'services/field_mode.dart';
import 'services/field_task_service.dart';

/// field_home_screen.dart -- ADDITIVE ONLY.
///
/// Home for the separate Field APK. Reuses 100% of existing screens
/// (Dashboard/Quotation/Leads) so common features stay in sync.
/// No existing file imports this file.
class FieldHomeScreen extends StatefulWidget {
  const FieldHomeScreen({super.key});

  @override
  State<FieldHomeScreen> createState() => _FieldHomeScreenState();
}

class _FieldHomeScreenState extends State<FieldHomeScreen> {
  int _pending = 0;

  @override
  void initState() {
    super.initState();
    FieldMode.isFieldApp = true;
    _refresh();
  }

  Future<void> _refresh() async {
    try {
      final cfg =
          Provider.of<AppState>(context, listen: false).clientConfig;
      final rows = await FieldTaskService.instance.fetchMyTasks(
        clientId: cfg.clientId,
        assignee: '',
      );
      if (mounted) {
        setState(() => _pending =
            rows.where((t) => t.status == 'pending').length);
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final filingUnder =
        Provider.of<AppState>(context).clientConfig.clientId;
    return Scaffold(
      appBar: AppBar(title: const Text('Vitharn Field')),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: ListTile(
                leading: const Icon(Icons.business_outlined),
                title: Text('Filing under: $filingUnder'),
                subtitle:
                    const Text('Supplier exec — switch per fabricator'),
                trailing: const Icon(Icons.swap_horiz),
                onTap: () async {
                  await Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) =>
                            const FabricatorSwitchScreen()),
                  );
                  _refresh();
                },
              ),
            ),
            Card(
              child: ListTile(
                leading: const Icon(Icons.assignment_outlined),
                title: Text('My visits ($_pending pending)'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () async {
                  await Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) => const ExecutiveTasksScreen()),
                  );
                  _refresh();
                },
              ),
            ),
            Card(
              child: ListTile(
                leading: const Icon(Icons.request_quote_outlined),
                title: const Text('New quotation'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => const QuotationScreen()),
                ),
              ),
            ),
            Card(
              child: ListTile(
                leading: const Icon(Icons.people_outline),
                title: const Text('Leads & follow-ups'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const LeadsScreen()),
                ),
              ),
            ),
            Card(
              child: ListTile(
                leading: const Icon(Icons.dashboard_outlined),
                title: const Text('All quotations (owner view)'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => const DashboardScreen()),
                ),
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Field build: same pricing, same PDF, same tenant. '
              'Quotes created here appear instantly in the owner app.',
              style: TextStyle(color: Colors.grey),
            ),
          ],
        ),
      ),
    );
  }
}
