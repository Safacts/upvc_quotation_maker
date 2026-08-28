import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import 'app_state.dart';
import 'services/connectivity_service.dart';
import 'services/quotation_recovery_service.dart';

class RecoveryCenterScreen extends StatefulWidget {
  const RecoveryCenterScreen({super.key});

  @override
  State<RecoveryCenterScreen> createState() => _RecoveryCenterScreenState();
}

class _RecoveryCenterScreenState extends State<RecoveryCenterScreen> {
  bool _loading = true;
  bool _syncing = false;
  int _pending = 0;
  int _conflicts = 0;
  DateTime? _lastBackup;
  List<Map<String, dynamic>> _cloud = const [];

  String get _clientId =>
      context.read<AppState>().clientConfig.clientId;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    final service = QuotationRecoveryService.instance;
    final pending = await service.pendingEnvelopes(_clientId);
    final conflicts = await service.conflicts(_clientId);
    final lastBackup = await service.lastCloudBackup(_clientId);
    final cloud = await service.cloudSnapshots(_clientId);
    if (!mounted) return;
    setState(() {
      _pending = pending.length;
      _conflicts = conflicts.length;
      _lastBackup = lastBackup;
      _cloud = cloud;
      _loading = false;
    });
  }

  Future<void> _syncNow() async {
    if (_syncing) return;
    setState(() => _syncing = true);
    await QuotationRecoveryService.instance.flushPending(_clientId);
    await _refresh();
    if (!mounted) return;
    setState(() => _syncing = false);
    final message = _pending == 0
        ? 'Everything on this device is backed up.'
        : 'Your work is safe here. $_pending item${_pending == 1 ? '' : 's'} will retry automatically.';
    ScaffoldMessenger.of(context)
      ..clearSnackBars()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _exportBackup() async {
    final raw = await QuotationRecoveryService.instance.exportBundle(_clientId);
    final date = DateTime.now().toIso8601String().split('T').first;
    await Share.shareXFiles(
      [
        XFile.fromData(
          utf8.encode(raw),
          mimeType: 'application/json',
          name: 'vitharn-recovery-$_clientId-$date.json',
        ),
      ],
      text: 'Vitharn quotation recovery backup for $_clientId',
    );
  }

  Future<void> _importFromClipboard() async {
    final clipboard = await Clipboard.getData(Clipboard.kTextPlain);
    final raw = clipboard?.text?.trim() ?? '';
    if (raw.isEmpty) {
      _show('Copy the recovery backup text first, then tap Import again.');
      return;
    }
    try {
      final count = await QuotationRecoveryService.instance
          .importBundle(_clientId, raw);
      await _refresh();
      _show('$count recovery item${count == 1 ? '' : 's'} imported safely.');
    } on FormatException catch (error) {
      _show(error.message);
    } catch (_) {
      _show('Could not read this backup. The existing device data was not changed.');
    }
  }

  void _show(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..clearSnackBars()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  String _relative(DateTime? value) {
    if (value == null) return 'Not backed up from this installation yet';
    final age = DateTime.now().difference(value);
    if (age.inMinutes < 1) return 'Just now';
    if (age.inMinutes < 60) return '${age.inMinutes} minutes ago';
    if (age.inHours < 24) return '${age.inHours} hours ago';
    return '${age.inDays} days ago';
  }

  @override
  Widget build(BuildContext context) {
    final online = ConnectivityService.instance.isOnline;
    return Scaffold(
      appBar: AppBar(title: const Text('Data Safety & Recovery')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Card(
                    color: _pending == 0
                        ? Colors.green.withValues(alpha: .08)
                        : Colors.amber.withValues(alpha: .10),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(
                                _pending == 0
                                    ? Icons.verified_user
                                    : Icons.offline_pin,
                                color: _pending == 0
                                    ? Colors.green
                                    : Colors.amber.shade800,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  _pending == 0
                                      ? 'Your work is protected'
                                      : '$_pending item${_pending == 1 ? '' : 's'} safe on this device',
                                  style: const TextStyle(
                                    fontSize: 17,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Text(online
                              ? 'Cloud backup: ${_relative(_lastBackup)}'
                              : 'No internet right now. Nothing will be lost; backup resumes automatically.'),
                          if (_conflicts > 0) ...[
                            const SizedBox(height: 8),
                            Text(
                              '$_conflicts protected version${_conflicts == 1 ? '' : 's'} need review.',
                              style: TextStyle(color: Colors.amber.shade900),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: _syncing ? null : _syncNow,
                    icon: _syncing
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.cloud_sync),
                    label: Text(_syncing ? 'Backing up…' : 'Back Up Everything Now'),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: _exportBackup,
                    icon: const Icon(Icons.ios_share),
                    label: const Text('Export Emergency Backup'),
                  ),
                  TextButton.icon(
                    onPressed: _importFromClipboard,
                    icon: const Icon(Icons.content_paste),
                    label: const Text('Import Backup from Clipboard'),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    'Recent protected copies',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                  const SizedBox(height: 8),
                  if (!online)
                    const Card(
                      child: ListTile(
                        leading: Icon(Icons.cloud_off),
                        title: Text('Cloud history is available when connected'),
                      ),
                    )
                  else if (_cloud.isEmpty)
                    const Card(
                      child: ListTile(
                        leading: Icon(Icons.history),
                        title: Text('No cloud recovery copies yet'),
                        subtitle: Text('They are created automatically while you work.'),
                      ),
                    )
                  else
                    ..._cloud.take(20).map((row) {
                      final snapshot = row['snapshot'];
                      final quotation = snapshot is Map
                          ? snapshot['quotation'] as Map?
                          : null;
                      final quoteNo =
                          (quotation?['quote_no'] ?? row['quotation_id'] ?? '')
                              .toString();
                      final customer =
                          (quotation?['customer_name'] ?? '').toString();
                      final state = (row['state'] ?? 'pending').toString();
                      return Card(
                        child: ListTile(
                          leading: Icon(
                            state == 'synced'
                                ? Icons.cloud_done
                                : state == 'conflict'
                                    ? Icons.copy_all
                                    : Icons.cloud_upload,
                            color: state == 'conflict'
                                ? Colors.amber.shade800
                                : Colors.green,
                          ),
                          title: Text(quoteNo),
                          subtitle: Text(
                            customer.isEmpty ? 'Protected copy • $state' : '$customer • $state',
                          ),
                          trailing: IconButton(
                            tooltip: 'Copy recovery data',
                            icon: const Icon(Icons.copy),
                            onPressed: () async {
                              await Clipboard.setData(
                                ClipboardData(text: jsonEncode(row)),
                              );
                              _show('Recovery data copied for support.');
                            },
                          ),
                        ),
                      );
                    }),
                  const SizedBox(height: 24),
                  Text(
                    'Emergency backups contain business quotation data. Keep exported files private.',
                    style: Theme.of(context).textTheme.bodySmall,
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
    );
  }
}
