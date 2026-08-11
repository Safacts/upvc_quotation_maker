/// OFFLINE TIER — PDF PREVIEW / SHARE / PRINT SCREEN.
///
/// This is the last screen before a quotation reaches a customer, so it has two
/// jobs beyond "show the PDF":
///
///   1. SHARE WITHOUT A SERVER. `Share` writes the rendered bytes to a temp
///      file and hands the path to the OS share sheet. WhatsApp then attaches
///      the real PDF. That is the entire "send the quote" feature of the
///      Rs.10,000 tier — zero backend, zero token, works in airplane mode.
///   2. MAKE DEGRADATION VISIBLE. If the logo failed to embed, the generator
///      reports it through `onWarning` and we show an amber banner. A client
///      once shipped logo-less quotations for months because the failure was
///      swallowed; the owner must see it BEFORE hitting share.
///
/// ZERO NETWORK: nothing here imports supabase, http, or `lib/services/`.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:pdf/pdf.dart';
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';

import '../branding/brand_service.dart';
import '../core/brand_config.dart';
import '../core/models.dart';
import 'offline_pdf_generator.dart';

class PdfPreviewScreen extends StatefulWidget {
  const PdfPreviewScreen({
    super.key,
    required this.quotation,
    required this.brand,
  });

  final OfflineQuotation quotation;
  final BrandConfig brand;

  @override
  State<PdfPreviewScreen> createState() => _PdfPreviewScreenState();
}

class _PdfPreviewScreenState extends State<PdfPreviewScreen> {
  /// Warnings raised by the generator (currently: logo failures). A Set because
  /// `PdfPreview` re-invokes `build` on resize / page-format changes and we do
  /// not want the same message stacking up.
  final Set<String> _warnings = <String>{};

  /// Cached bytes from the most recent render, so Share does not pay for a
  /// second full build of a document the user is already looking at.
  Uint8List? _lastBytes;

  bool _busy = false;

  Future<Uint8List> _build(PdfPageFormat _) async {
    final collected = <String>{};
    final bytes = await OfflinePdfGenerator.build(
      quotation: widget.quotation,
      brand: widget.brand,
      // BrandService caches these bytes in memory, so this is effectively free
      // after the first call and never throws.
      logoBytes: await BrandServiceLogoLoader.load(),
      onWarning: collected.add,
    );
    _lastBytes = bytes;

    // setState during the PdfPreview build callback would re-enter the build
    // phase; defer to the next frame.
    if (collected.isNotEmpty && !setEquals(collected, _warnings)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        setState(() => _warnings.addAll(collected));
      });
    }
    return bytes;
  }

  Future<Uint8List> _ensureBytes() async =>
      _lastBytes ?? await _build(PdfPageFormat.a4);

  Future<void> _share() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final bytes = await _ensureBytes();
      final file = await OfflinePdfGenerator.saveToTemp(
        bytes,
        widget.quotation.quotationNo,
      );
      // NOTE: WhatsApp's Android share receiver takes the file stream and
      // DISCARDS EXTRA_TEXT, so any caption passed here will not survive on
      // that target. The file is the payload, which is exactly what we want.
      await SharePlus.instance.share(
        ShareParams(
          files: <XFile>[XFile(file.path, mimeType: 'application/pdf')],
          subject: 'Quotation ${widget.quotation.quotationNo}',
        ),
      );
    } catch (e) {
      debugPrint('PdfPreviewScreen share failed: $e');
      _toast('Could not open the share sheet.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _print() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final bytes = await _ensureBytes();
      // layoutPdf drives the platform print/save dialog — on Android this is
      // also the "Save as PDF" path, which covers save-to-Downloads without a
      // storage permission dance or a new dependency.
      await Printing.layoutPdf(
        onLayout: (_) async => bytes,
        name: 'Quotation ${widget.quotation.quotationNo}',
      );
    } catch (e) {
      debugPrint('PdfPreviewScreen print failed: $e');
      _toast('Printing is not available on this device.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final quoteNo = widget.quotation.quotationNo.trim();
    return Scaffold(
      appBar: AppBar(
        title: Text(quoteNo.isEmpty ? 'Quotation' : quoteNo),
        actions: [
          IconButton(
            icon: const Icon(Icons.print_outlined),
            tooltip: 'Print / Save as PDF',
            onPressed: _busy ? null : _print,
          ),
          IconButton(
            icon: const Icon(Icons.share_outlined),
            tooltip: 'Share',
            onPressed: _busy ? null : _share,
          ),
        ],
      ),
      body: Column(
        children: [
          if (_warnings.isNotEmpty) _WarningBanner(messages: _warnings.toList()),
          Expanded(
            child: PdfPreview(
              build: _build,
              // A4 is the only format this document is designed for; letting
              // the user pick Letter would reflow the tuned column widths.
              canChangePageFormat: false,
              canChangeOrientation: false,
              canDebug: false,
              // Our own AppBar actions handle share/print, so the built-in
              // toolbar buttons would just be duplicates.
              allowPrinting: false,
              allowSharing: false,
              useActions: false,
              pdfFileName: '${widget.quotation.quotationNo}.pdf',
              loadingWidget: const Center(child: CircularProgressIndicator()),
              onError: (context, error) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    'This quotation could not be rendered.\n\n$error',
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _busy ? null : _print,
                  icon: const Icon(Icons.print_outlined),
                  label: const Text('Print / Save'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  onPressed: _busy ? null : _share,
                  icon: const Icon(Icons.share_outlined),
                  label: const Text('Share PDF'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Amber, inline, and NOT dismissible by accident — a silent logo failure is
/// how one client sent unbranded quotations for months.
class _WarningBanner extends StatelessWidget {
  const _WarningBanner({required this.messages});

  final List<String> messages;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: const Color(0xFFFFF4E5),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.warning_amber_rounded,
              color: Color(0xFFB26A00), size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final m in messages)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 2),
                    child: Text(
                      m,
                      style: const TextStyle(
                        color: Color(0xFF8A5200),
                        fontSize: 12.5,
                        height: 1.3,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Thin indirection over `BrandService.instance.loadLogoBytes()`.
///
/// Kept as a seam so this screen can be pumped in a widget test without the
/// SharedPreferences / path_provider plugins that BrandService needs. In the
/// app it is a straight pass-through.
class BrandServiceLogoLoader {
  const BrandServiceLogoLoader._();

  /// Overridable in tests. Returns null when there is no logo.
  static Future<Uint8List?> Function() loader = _default;

  static Future<Uint8List?> load() => loader();

  static Future<Uint8List?> _default() =>
      BrandService.instance.loadLogoBytes();
}
