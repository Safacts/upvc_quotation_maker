import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app_state.dart';
import 'supabase_config.dart';
import 'utils/http_rate_card.dart';

String get _apiBase => kIsWeb ? '' : 'https://app.vitharn.com';

class RateCardSection extends StatelessWidget {
  const RateCardSection({super.key});

  @override
  Widget build(BuildContext context) {
    return const Card(
      child: Padding(
        padding: EdgeInsets.all(16.0),
        child: RateCardBody(),
      ),
    );
  }
}

class RateCardBody extends StatefulWidget {
  const RateCardBody({super.key});

  @override
  State<RateCardBody> createState() => _RateCardBodyState();
}

class _RateCardBodyState extends State<RateCardBody> {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _loadItems();
  }

  String get _clientId =>
      Provider.of<AppState>(context, listen: false).clientConfig.clientId;

  Future<void> _loadItems() async {
    setState(() => _loading = true);
    try {
      final response = await SupabaseConfig.client
          .from('rate_card_items')
          .select()
          .eq('client_id', _clientId)
          .eq('is_active', true)
          .order('item_type');
      if (!mounted) return;
      setState(() {
        _items = (response as List)
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Could not load rate card: $e'),
      ));
    }
  }

  Future<void> _downloadTemplate() async {
    setState(() => _busy = true);
    try {
      final bytes =
          await fetchCsvTemplate('$_apiBase/api/rate-card/template');
      downloadBytes(bytes, 'rate_card_template.csv');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Template downloaded — open it, replace sample rates, save as CSV'),
      ));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Template download failed: $e'),
      ));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _importCsv() async {
    try {
      final picked = await pickCsvFile();
      if (picked == null) return;
      if (!mounted) return;
      setState(() => _busy = true);
      final validationRes = await postMultipartCsv(
        '$_apiBase/api/rate-card/import',
        picked.name,
        picked.content,
        dryRun: true,
      );
      if (!mounted) return;
      Map<String, dynamic> report;
      try {
        report = jsonDecode(validationRes.body) as Map<String, dynamic>;
      } catch (_) {
        throw StateError('Import service returned an invalid response (${validationRes.status})');
      }
      if (validationRes.status != 200) {
        throw StateError((report['error'] as String?) ?? 'Validation failed (${validationRes.status})');
      }
      final confirmed = await _showDryRunReport(report);
      if (!confirmed || !mounted) {
        setState(() => _busy = false);
        return;
      }
      final commitRes = await postMultipartCsv(
        '$_apiBase/api/rate-card/import',
        picked.name,
        picked.content,
      );
      if (!mounted) return;
      Map<String, dynamic> result;
      try {
        result = jsonDecode(commitRes.body) as Map<String, dynamic>;
      } catch (_) {
        throw StateError('Import service returned an invalid response (${commitRes.status})');
      }
      final inserted = result['inserted'] ?? 0;
      final updated = result['updated'] ?? 0;
      final skipped = result['skipped_errors'] ?? 0;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
          'Rate card imported: $inserted added, $updated updated${skipped > 0 ? ', $skipped invalid rows skipped' : ''}',
        ),
      ));
      await _loadItems();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Import failed: $e'),
      ));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<bool> _showDryRunReport(Map<String, dynamic> report) async {
    final totalRows = report['total_rows'] ?? 0;
    final validRows = report['valid_rows'] ?? 0;
    final errorCount = report['error_count'] ?? 0;
    final errors = (report['errors'] as List?) ?? [];
    return showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Validation report'),
        content: SizedBox(
          width: double.maxFinite,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$totalRows data rows found'),
                Text('$validRows rows are valid and ready to import'),
                Text(
                  '$errorCount rows have problems that will be skipped:',
                  style: errorCount > 0
                      ? const TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold)
                      : null,
                ),
                const SizedBox(height: 8),
                ...errors.map<Widget>((e) {
                  final rowNo = e is Map && e['row'] != null ? e['row'] : '?';
                  final message = e is Map && e['message'] != null ? e['message'] : e.toString();
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text(
                      'Row $rowNo: $message',
                      style: const TextStyle(fontSize: 12, color: Colors.redAccent),
                    ),
                  );
                }),
                if (validRows == 0) ...[
                  const SizedBox(height: 8),
                  const Text('Nothing to import.', style: TextStyle(fontWeight: FontWeight.bold)),
                ],
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: validRows > 0 ? () => Navigator.of(dialogContext).pop(true) : null,
            child: Text('Import $validRows rows'),
          ),
        ],
      ),
    ).then((value) => value ?? false);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Your per-sqft rates power automatic quote pricing.',
          style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _busy ? null : _downloadTemplate,
                icon: const Icon(Icons.download),
                label: const Text('Download Template'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton.icon(
                onPressed: _busy ? null : _importCsv,
                icon: const Icon(Icons.upload_file),
                label: const Text('Import CSV'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (_loading)
          const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()))
        else if (_items.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(
              'No rate card rows yet. Download the template, fill your rates, then import.',
              style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
            ),
          )
        else
          ..._items.map((item) {
            final itemType = (item['item_type'] ?? '').toString().replaceAll('_', ' ');
            final glass = (item['glass_spec'] ?? '').toString();
            final mesh = (item['mesh_type'] ?? '').toString();
            final tier = (item['hardware_tier'] ?? '').toString();
            final price = item['price_per_sqft'];
            final details = [
              if (glass.isNotEmpty) glass,
              if (mesh.isNotEmpty && mesh != 'none') '$mesh mesh',
              if (tier.isNotEmpty) tier,
            ].join(' · ');
            return ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.receipt_long),
              title: Text(itemType.isEmpty ? '(unknown type)' : itemType,
                  style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: details.isEmpty ? null : Text(details, style: const TextStyle(fontSize: 12)),
              trailing: Text(
                price == null ? '-' : '₹$price/sqft',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            );
          }),
      ],
    );
  }
}
