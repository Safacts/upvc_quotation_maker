/// OFFLINE TIER — EXPORT SCREEN (Tally XML + CSV).
///
/// ZERO-SERVER CONTRACT: no `supabase_flutter`, no `http`, no
/// `connectivity_plus`, nothing from `lib/services/**`. The export leaves the
/// device only when the OWNER picks a target in the system share sheet.
///
/// WHY EVERYTHING HERE IS PAGED
/// ----------------------------
/// A three-year install holds thousands of quotations. `list(limit: 999999)`
/// works on the developer's dataset and out-of-memory-kills the app on the
/// client's phone with no error the owner can report. Every export walks the
/// repository in pages of [_pageSize] and accumulates into a `StringBuffer`,
/// so peak memory is one page plus the text built so far.
///
/// The line-items export additionally needs `getById` per quotation (child rows
/// are not on the summary), so it is the slowest one — which is exactly why the
/// progress bar is determinate and the cancel button is real.
library;

import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';

import '../branding/brand_service.dart';
import '../core/brand_config.dart';
import '../core/models.dart';
import '../core/payment_models.dart';
import '../data/customer_repository.dart';
import '../data/payment_repository.dart';
import '../data/quotation_repository.dart';
import 'csv_exporter.dart';
import 'tally_xml_exporter.dart';

/// Which artefact a card produces.
enum _ExportKind {
  tallySales,
  tallyReceipts,
  quotationsCsv,
  lineItemsCsv,
  customersCsv,
  paymentsCsv,
}

/// Date-range presets. Indian FY starts 1 April — see [_boundsFor].
enum _RangePreset { thisMonth, lastMonth, thisFy, lastFy, allTime, custom }

extension _RangePresetX on _RangePreset {
  String get label => switch (this) {
        _RangePreset.thisMonth => 'This month',
        _RangePreset.lastMonth => 'Last month',
        _RangePreset.thisFy => 'This FY',
        _RangePreset.lastFy => 'Last FY',
        _RangePreset.allTime => 'All time',
        _RangePreset.custom => 'Custom',
      };
}

@immutable
class _DateBounds {
  const _DateBounds(this.from, this.to);

  /// Null on both ends means "everything".
  final DateTime? from;
  final DateTime? to;

  bool get isAllTime => from == null && to == null;

  bool contains(DateTime d) {
    final day = DateTime(d.year, d.month, d.day);
    if (from != null && day.isBefore(from!)) return false;
    if (to != null && day.isAfter(to!)) return false;
    return true;
  }
}

class ExportScreen extends StatefulWidget {
  const ExportScreen({super.key});

  @override
  State<ExportScreen> createState() => _ExportScreenState();
}

class _ExportScreenState extends State<ExportScreen> {
  /// Rows fetched per repository round-trip. Large enough that a 5,000-row
  /// export is 10 queries, small enough that one page is trivial memory.
  static const int _pageSize = 500;

  /// Hard stop so a corrupt `offset` can never spin forever. 200 pages of 500
  /// is 100,000 rows — an order of magnitude beyond any real install.
  static const int _maxPages = 200;

  final QuotationRepository _quotations = QuotationRepository();
  final CustomerRepository _customers = CustomerRepository();
  final PaymentRepository _payments = PaymentRepository();

  final DateFormat _fileStamp = DateFormat('yyyyMMdd');
  final DateFormat _uiDate = DateFormat('dd MMM yyyy');

  _RangePreset _preset = _RangePreset.thisFy;
  DateTimeRange? _customRange;

  /// Non-null while an export is running — also the cancel token.
  _ExportKind? _running;
  bool _cancelRequested = false;
  double _progress = 0;
  String _progressLabel = '';

  bool _brandLoading = true;

  @override
  void initState() {
    super.initState();
    _ensureBrand();
  }

  Future<void> _ensureBrand() async {
    if (!BrandService.instance.isLoaded) {
      try {
        await BrandService.instance.load();
      } catch (_) {
        // BrandService.load() is documented never to throw, but an export
        // screen must not be the thing that takes the app down if that ever
        // regresses — the config has safe defaults.
      }
    }
    if (!mounted) return;
    setState(() => _brandLoading = false);
  }

  // -------------------------------------------------------------------------
  // Date ranges
  // -------------------------------------------------------------------------

  /// Indian financial year runs 1 April -> 31 March.
  ///
  /// On or after 1 April: this FY is Apr-1 of THIS year to Mar-31 of NEXT year.
  /// Before 1 April: we are still inside the FY that started LAST April.
  /// Getting this wrong hands the accountant a file that is three months short
  /// every January — and they will not notice until filing.
  static _DateBounds boundsFor(_RangePreset preset, DateTime now,
      {DateTimeRange? custom}) {
    final today = DateTime(now.year, now.month, now.day);

    switch (preset) {
      case _RangePreset.thisMonth:
        return _DateBounds(
          DateTime(today.year, today.month, 1),
          DateTime(today.year, today.month + 1, 0),
        );
      case _RangePreset.lastMonth:
        return _DateBounds(
          DateTime(today.year, today.month - 1, 1),
          DateTime(today.year, today.month, 0),
        );
      case _RangePreset.thisFy:
        final startYear = today.month >= 4 ? today.year : today.year - 1;
        return _DateBounds(
          DateTime(startYear, 4, 1),
          DateTime(startYear + 1, 3, 31),
        );
      case _RangePreset.lastFy:
        final startYear = today.month >= 4 ? today.year - 1 : today.year - 2;
        return _DateBounds(
          DateTime(startYear, 4, 1),
          DateTime(startYear + 1, 3, 31),
        );
      case _RangePreset.allTime:
        return const _DateBounds(null, null);
      case _RangePreset.custom:
        if (custom == null) return const _DateBounds(null, null);
        return _DateBounds(
          DateTime(custom.start.year, custom.start.month, custom.start.day),
          DateTime(custom.end.year, custom.end.month, custom.end.day),
        );
    }
  }

  _DateBounds get _bounds =>
      boundsFor(_preset, DateTime.now(), custom: _customRange);

  String get _rangeLabel {
    final b = _bounds;
    if (b.isAllTime) return 'All time';
    final from = b.from == null ? '...' : _uiDate.format(b.from!);
    final to = b.to == null ? '...' : _uiDate.format(b.to!);
    return '$from  to  $to';
  }

  Future<void> _pickCustomRange() async {
    final now = DateTime.now();
    final initial = _customRange ??
        DateTimeRange(
          start: DateTime(now.year, now.month, 1),
          end: now,
        );
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2015),
      lastDate: DateTime(now.year + 2, 12, 31),
      initialDateRange: initial,
    );
    if (!mounted || picked == null) return;
    setState(() {
      _customRange = picked;
      _preset = _RangePreset.custom;
    });
  }

  // -------------------------------------------------------------------------
  // Paged fetch helpers
  // -------------------------------------------------------------------------

  /// Walks `QuotationRepository.list` and returns every summary inside [b].
  ///
  /// The repository has no date filter, so the range is applied here. Paging is
  /// still on the repository call, so memory stays bounded even when the range
  /// keeps only a handful of rows out of thousands.
  Future<List<QuotationSummary>> _fetchQuotationSummaries(
    _DateBounds b, {
    required void Function(int fetched) onPage,
  }) async {
    final out = <QuotationSummary>[];
    var offset = 0;

    for (var page = 0; page < _maxPages; page++) {
      if (_cancelRequested) break;
      final rows =
          await _quotations.list(limit: _pageSize, offset: offset);
      if (rows.isEmpty) break;

      for (final r in rows) {
        if (b.contains(r.date)) out.add(r);
      }
      onPage(out.length);

      if (rows.length < _pageSize) break;
      offset += rows.length;
    }
    return out;
  }

  Future<List<OfflinePayment>> _fetchPayments(_DateBounds b) async {
    final out = <OfflinePayment>[];
    var offset = 0;

    for (var page = 0; page < _maxPages; page++) {
      if (_cancelRequested) break;
      // PaymentRepository filters dates in SQL, so this really is a narrow read.
      final rows = await _payments.list(
        from: b.from,
        to: b.to,
        limit: _pageSize,
        offset: offset,
      );
      if (rows.isEmpty) break;
      out.addAll(rows);
      if (rows.length < _pageSize) break;
      offset += rows.length;
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Export runners
  // -------------------------------------------------------------------------

  Future<void> _run(_ExportKind kind) async {
    if (_running != null) return;

    setState(() {
      _running = kind;
      _cancelRequested = false;
      _progress = 0;
      _progressLabel = 'Preparing...';
    });

    try {
      final brand = BrandService.instance.config;
      final b = _bounds;

      final _Artefact? artefact = switch (kind) {
        _ExportKind.tallySales => await _buildTallySales(b, brand),
        _ExportKind.tallyReceipts => await _buildTallyReceipts(b, brand),
        _ExportKind.quotationsCsv => await _buildQuotationsCsv(b),
        _ExportKind.lineItemsCsv => await _buildLineItemsCsv(b),
        _ExportKind.customersCsv => await _buildCustomersCsv(),
        _ExportKind.paymentsCsv => await _buildPaymentsCsv(b),
      };

      if (!mounted) return;

      if (_cancelRequested) {
        _toast('Export cancelled.');
        return;
      }
      if (artefact == null) {
        // Never write a 0-byte file — the owner shares it, the accountant opens
        // an empty sheet, and everyone concludes the app lost the data.
        _toast('Nothing to export in this period.');
        return;
      }

      _setProgress(1, 'Saving...');
      final file = artefact.isXml
          ? await TallyXmlExporter.saveToTemp(artefact.content, artefact.name)
          : await CsvExporter.saveToTemp(artefact.content, artefact.name);

      if (!mounted) return;
      await _share(file, artefact);
      if (!mounted) return;
      _toast('${artefact.rowCount} records exported.');
    } on TallyExportException catch (e) {
      if (!mounted) return;
      // Naming the voucher is the whole point: "it failed" sends the owner back
      // to us, "SVU/25-26/0007 does not balance" sends them to that quotation.
      _toast(
        e.voucherNumber == null || e.voucherNumber!.isEmpty
            ? 'Tally export failed: ${e.message}'
            : 'Tally export stopped at ${e.voucherNumber}: ${e.message}',
        error: true,
      );
    } on FileSystemException catch (e) {
      if (!mounted) return;
      _toast('Could not write the file: ${e.message}', error: true);
    } catch (e) {
      if (!mounted) return;
      _toast('Export failed: $e', error: true);
    } finally {
      if (mounted) {
        setState(() {
          _running = null;
          _progress = 0;
          _progressLabel = '';
          _cancelRequested = false;
        });
      }
    }
  }

  Future<_Artefact?> _buildTallySales(_DateBounds b, BrandConfig brand) async {
    _setProgress(0, 'Finding quotations...');
    final summaries = await _fetchQuotationSummaries(
      b,
      onPage: (n) => _setProgress(0, 'Found $n quotations...'),
    );
    if (summaries.isEmpty || _cancelRequested) return null;

    // Vouchers need line totals, which live on the child rows -> getById.
    // Batched so the buffer never holds more than one batch of full objects.
    final buffer = StringBuffer();
    var done = 0;
    var written = 0;

    for (var i = 0; i < summaries.length; i += 50) {
      if (_cancelRequested) return null;
      final slice = summaries.skip(i).take(50).toList(growable: false);
      final loaded = <OfflineQuotation>[];
      for (final s in slice) {
        final q = await _quotations.getById(s.id);
        if (q != null) loaded.add(q);
        done++;
      }
      _setProgress(
        done / summaries.length,
        'Building vouchers $done/${summaries.length}...',
      );

      if (loaded.isEmpty) continue;
      // One envelope per batch would be invalid, so extract just the
      // TALLYMESSAGE payload from each batch and wrap once at the end.
      final chunk = TallyXmlExporter.buildSalesVouchers(
        quotations: loaded,
        brand: brand,
      );
      buffer.write(_innerRequestData(chunk));
      written += loaded.length;
    }

    if (written == 0 || _cancelRequested) return null;

    return _Artefact(
      content: _wrapEnvelope(buffer.toString(), brand),
      name: 'tally-sales-${_stamp()}.xml',
      mime: 'application/xml',
      subject: 'Tally sales vouchers ($_rangeLabel)',
      rowCount: written,
      isXml: true,
    );
  }

  Future<_Artefact?> _buildTallyReceipts(
      _DateBounds b, BrandConfig brand) async {
    _setProgress(0, 'Finding receipts...');
    final payments = await _fetchPayments(b);
    if (payments.isEmpty || _cancelRequested) return null;

    _setProgress(0.4, 'Resolving quotations...');
    final maps = await _lookupsFor(payments);
    if (_cancelRequested) return null;

    _setProgress(0.7, 'Building vouchers...');
    final xml = TallyXmlExporter.buildReceiptVouchers(
      payments: payments,
      quotationNoById: maps.quotationNoById,
      customerNameById: maps.customerNameById,
      brand: brand,
    );

    return _Artefact(
      content: xml,
      name: 'tally-receipts-${_stamp()}.xml',
      mime: 'application/xml',
      subject: 'Tally receipt vouchers ($_rangeLabel)',
      rowCount: payments.length,
      isXml: true,
    );
  }

  Future<_Artefact?> _buildQuotationsCsv(_DateBounds b) async {
    _setProgress(0, 'Reading quotations...');
    final rows = await _fetchQuotationSummaries(
      b,
      onPage: (n) => _setProgress(0.5, 'Read $n quotations...'),
    );
    if (rows.isEmpty || _cancelRequested) return null;

    _setProgress(0.8, 'Writing CSV...');
    return _Artefact(
      content: CsvExporter.quotations(rows),
      name: 'quotations-${_stamp()}.csv',
      mime: 'text/csv',
      subject: 'Quotations ($_rangeLabel)',
      rowCount: rows.length,
      isXml: false,
    );
  }

  Future<_Artefact?> _buildLineItemsCsv(_DateBounds b) async {
    _setProgress(0, 'Finding quotations...');
    final summaries = await _fetchQuotationSummaries(
      b,
      onPage: (n) => _setProgress(0, 'Found $n quotations...'),
    );
    if (summaries.isEmpty || _cancelRequested) return null;

    // Header once, then one batch of rows at a time. Building 5,000 full
    // OfflineQuotation objects (each with its item lists) before writing
    // anything is the memory spike this batching exists to avoid.
    final buffer = StringBuffer();
    var done = 0;
    var lines = 0;
    var wroteHeader = false;

    for (var i = 0; i < summaries.length; i += 50) {
      if (_cancelRequested) return null;
      final slice = summaries.skip(i).take(50).toList(growable: false);
      final loaded = <OfflineQuotation>[];
      for (final s in slice) {
        final q = await _quotations.getById(s.id);
        if (q != null) loaded.add(q);
        done++;
      }
      _setProgress(
        done / summaries.length,
        'Reading items $done/${summaries.length}...',
      );
      if (loaded.isEmpty) continue;

      final csv = CsvExporter.quotationLineItems(loaded);
      if (wroteHeader) {
        buffer.write(_withoutCsvHeader(csv));
      } else {
        buffer.write(csv);
        wroteHeader = true;
      }
      lines += loaded.fold<int>(0, (s, q) => s + q.itemCount);
    }

    if (!wroteHeader || lines == 0 || _cancelRequested) return null;

    return _Artefact(
      content: buffer.toString(),
      name: 'line-items-${_stamp()}.csv',
      mime: 'text/csv',
      subject: 'Quotation line items ($_rangeLabel)',
      rowCount: lines,
      isXml: false,
    );
  }

  Future<_Artefact?> _buildCustomersCsv() async {
    // The address book has no date dimension — a customer is not "in" a period.
    _setProgress(0.3, 'Reading customers...');
    final rows = await _customers.list();
    if (rows.isEmpty || _cancelRequested) return null;

    _setProgress(0.8, 'Writing CSV...');
    return _Artefact(
      content: CsvExporter.customers(rows),
      name: 'customers-${_stamp()}.csv',
      mime: 'text/csv',
      subject: 'Customers',
      rowCount: rows.length,
      isXml: false,
    );
  }

  Future<_Artefact?> _buildPaymentsCsv(_DateBounds b) async {
    _setProgress(0, 'Reading receipts...');
    final payments = await _fetchPayments(b);
    if (payments.isEmpty || _cancelRequested) return null;

    _setProgress(0.5, 'Resolving quotations...');
    final maps = await _lookupsFor(payments);
    if (_cancelRequested) return null;

    _setProgress(0.8, 'Writing CSV...');
    return _Artefact(
      content: CsvExporter.payments(
        payments: payments,
        quotationNoById: maps.quotationNoById,
      ),
      name: 'payments-${_stamp()}.csv',
      mime: 'text/csv',
      subject: 'Payments received ($_rangeLabel)',
      rowCount: payments.length,
      isXml: false,
    );
  }

  /// Quote-number and customer-name lookups for a set of payments.
  ///
  /// Deduplicated first: a job paid in six instalments must not cause six
  /// identical `getById` calls.
  Future<_PaymentLookups> _lookupsFor(List<OfflinePayment> payments) async {
    final quotationNoById = <String, String>{};
    final customerNameById = <String, String>{};

    final ids = payments
        .map((p) => p.quotationId)
        .where((id) => id.isNotEmpty)
        .toSet();

    for (final id in ids) {
      if (_cancelRequested) break;
      final q = await _quotations.getById(id);
      if (q == null) continue;
      quotationNoById[id] = q.quotationNo;
      if (q.customerId.isNotEmpty && q.customerName.isNotEmpty) {
        customerNameById[q.customerId] = q.customerName;
      }
    }

    return _PaymentLookups(quotationNoById, customerNameById);
  }

  // -------------------------------------------------------------------------
  // Envelope stitching (batched Tally builds)
  // -------------------------------------------------------------------------

  static const String _requestDataOpen = '<REQUESTDATA>';
  static const String _requestDataClose = '</REQUESTDATA>';

  /// Pulls the `<TALLYMESSAGE>...` payload out of a complete envelope so several
  /// batches can share ONE envelope. Two stacked envelopes in one file is not
  /// valid XML (two root elements) and Tally rejects it outright.
  static String _innerRequestData(String envelope) {
    final start = envelope.indexOf(_requestDataOpen);
    final end = envelope.lastIndexOf(_requestDataClose);
    if (start < 0 || end < 0 || end <= start) return '';
    return envelope.substring(start + _requestDataOpen.length, end);
  }

  /// Rebuilds a single envelope around already-built `<TALLYMESSAGE>` blocks by
  /// asking the exporter for an EMPTY envelope and splicing the payload in — so
  /// the envelope shape lives in exactly one place.
  static String _wrapEnvelope(String payload, BrandConfig brand) {
    final empty = TallyXmlExporter.buildSalesVouchers(
      quotations: const <OfflineQuotation>[],
      brand: brand,
    );
    final at = empty.indexOf(_requestDataOpen);
    if (at < 0) return empty;
    final insertAt = at + _requestDataOpen.length;
    return empty.substring(0, insertAt) + payload + empty.substring(insertAt);
  }

  /// Drops the BOM + header line from a subsequent CSV chunk.
  ///
  /// Concatenating raw chunks would repeat the header row every 50 quotations,
  /// and a stray BOM mid-file shows up as a `?` in the first cell of that row.
  static String _withoutCsvHeader(String csv) {
    var body = csv;
    if (body.startsWith(CsvExporter.utf8Bom)) {
      body = body.substring(CsvExporter.utf8Bom.length);
    }
    final nl = body.indexOf('\n');
    return nl < 0 ? '' : body.substring(nl + 1);
  }

  // -------------------------------------------------------------------------
  // Share + feedback
  // -------------------------------------------------------------------------

  Future<void> _share(File file, _Artefact artefact) async {
    // share_plus 11: `Share.shareXFiles` is deprecated in favour of
    // `SharePlus.instance`. Using the old call still compiles but emits a
    // deprecation info that fails our "No issues found!" bar.
    await SharePlus.instance.share(
      ShareParams(
        files: <XFile>[XFile(file.path, mimeType: artefact.mime)],
        subject: artefact.subject,
      ),
    );
  }

  void _setProgress(double value, String label) {
    if (!mounted) return;
    setState(() {
      _progress = value.clamp(0.0, 1.0);
      _progressLabel = label;
    });
  }

  void _toast(String message, {bool error = false}) {
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        duration: Duration(seconds: error ? 6 : 3),
        backgroundColor:
            error ? Theme.of(context).colorScheme.error : null,
      ),
    );
  }

  String _stamp() => _fileStamp.format(DateTime.now());

  // -------------------------------------------------------------------------
  // UI
  // -------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final busy = _running != null;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Export'),
        bottom: busy
            ? PreferredSize(
                preferredSize: const Size.fromHeight(4),
                child: LinearProgressIndicator(value: _progress),
              )
            : null,
      ),
      body: _brandLoading
          ? const Center(child: CircularProgressIndicator())
          : AbsorbPointer(
              // Blocks a second export starting mid-run without hiding the
              // list — the owner can still see what they picked.
              absorbing: busy,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                children: <Widget>[
                  _rangeCard(theme),
                  const SizedBox(height: 16),
                  _sectionTitle(theme, 'Tally'),
                  _card(
                    theme,
                    kind: _ExportKind.tallySales,
                    icon: Icons.receipt_long_outlined,
                    title: 'Tally Sales Vouchers',
                    subtitle:
                        'One Sales voucher per quotation, with GST and transport '
                        'as their own ledgers. Import via Gateway > Import Data.',
                  ),
                  _card(
                    theme,
                    kind: _ExportKind.tallyReceipts,
                    icon: Icons.payments_outlined,
                    title: 'Tally Receipts',
                    subtitle:
                        'One Receipt voucher per payment. Cash goes to Cash, '
                        'everything else to Bank.',
                  ),
                  const SizedBox(height: 8),
                  _sectionTitle(theme, 'Spreadsheets (CSV)'),
                  _card(
                    theme,
                    kind: _ExportKind.quotationsCsv,
                    icon: Icons.table_chart_outlined,
                    title: 'Quotations CSV',
                    subtitle: 'One row per quotation with its total and status.',
                  ),
                  _card(
                    theme,
                    kind: _ExportKind.lineItemsCsv,
                    icon: Icons.list_alt_outlined,
                    title: 'Line Items CSV',
                    subtitle:
                        'One row per window or item, with SFT and T.SFT as '
                        'separate columns.',
                  ),
                  _card(
                    theme,
                    kind: _ExportKind.customersCsv,
                    icon: Icons.people_outline,
                    title: 'Customers CSV',
                    subtitle:
                        'The whole address book. Not affected by the date range.',
                  ),
                  _card(
                    theme,
                    kind: _ExportKind.paymentsCsv,
                    icon: Icons.account_balance_wallet_outlined,
                    title: 'Payments CSV',
                    subtitle: 'Every receipt in the selected period.',
                  ),
                  const SizedBox(height: 16),
                  _footerNote(theme),
                ],
              ),
            ),
      bottomNavigationBar: busy ? _progressBar(theme) : null,
    );
  }

  Widget _sectionTitle(ThemeData theme, String text) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 8, 4, 8),
        child: Text(
          text.toUpperCase(),
          style: theme.textTheme.labelSmall?.copyWith(
            letterSpacing: 1.1,
            fontWeight: FontWeight.w700,
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      );

  Widget _rangeCard(ThemeData theme) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Icon(Icons.date_range_outlined,
                    size: 18, color: theme.colorScheme.primary),
                const SizedBox(width: 8),
                Text('Period', style: theme.textTheme.titleSmall),
              ],
            ),
            const SizedBox(height: 4),
            Text(_rangeLabel, style: theme.textTheme.bodySmall),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: _RangePreset.values.map((p) {
                return ChoiceChip(
                  label: Text(p.label),
                  selected: _preset == p,
                  onSelected: (_) {
                    if (p == _RangePreset.custom) {
                      _pickCustomRange();
                    } else {
                      setState(() => _preset = p);
                    }
                  },
                );
              }).toList(growable: false),
            ),
          ],
        ),
      ),
    );
  }

  Widget _card(
    ThemeData theme, {
    required _ExportKind kind,
    required IconData icon,
    required String title,
    required String subtitle,
  }) {
    final isThisRunning = _running == kind;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        contentPadding: const EdgeInsets.fromLTRB(16, 8, 12, 8),
        leading: CircleAvatar(
          backgroundColor: theme.colorScheme.primaryContainer,
          child: Icon(icon, color: theme.colorScheme.onPrimaryContainer),
        ),
        title: Text(title, style: theme.textTheme.titleSmall),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(subtitle, style: theme.textTheme.bodySmall),
        ),
        trailing: isThisRunning
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.ios_share),
        onTap: _running == null ? () => _run(kind) : null,
      ),
    );
  }

  Widget _progressBar(ThemeData theme) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
        child: Row(
          children: <Widget>[
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    _progressLabel.isEmpty ? 'Working...' : _progressLabel,
                    style: theme.textTheme.bodySmall,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 6),
                  LinearProgressIndicator(value: _progress),
                ],
              ),
            ),
            TextButton(
              // Cancellation is cooperative: the flag is checked between pages
              // and between batches, so a tap always lands within one page of
              // work rather than killing a half-written file.
              onPressed: _cancelRequested
                  ? null
                  : () => setState(() => _cancelRequested = true),
              child: Text(_cancelRequested ? 'Cancelling...' : 'Cancel'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _footerNote(ThemeData theme) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(Icons.info_outline,
              size: 18, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Exports are built on this phone and never uploaded anywhere. '
              'The file is handed to your share sheet, so you choose where it '
              'goes. Tally vouchers are checked for balance before the file is '
              'written.',
              style: theme.textTheme.bodySmall,
            ),
          ),
        ],
      ),
    );
  }
}

/// A built, not-yet-saved export.
@immutable
class _Artefact {
  const _Artefact({
    required this.content,
    required this.name,
    required this.mime,
    required this.subject,
    required this.rowCount,
    required this.isXml,
  });

  final String content;
  final String name;
  final String mime;
  final String subject;
  final int rowCount;
  final bool isXml;
}

@immutable
class _PaymentLookups {
  const _PaymentLookups(this.quotationNoById, this.customerNameById);

  final Map<String, String> quotationNoById;
  final Map<String, String> customerNameById;
}
