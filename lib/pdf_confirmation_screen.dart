import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:printing/printing.dart' deferred as printLib;
import 'package:flutter_animate/flutter_animate.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';
import 'config/client_config.dart';
import 'models.dart';
import 'quote_share.dart';
import 'supabase_config.dart';
import 'file_helper.dart';

import 'notification_service.dart';

class PdfConfirmationScreen extends StatefulWidget {
  final QuotationData data;
  final Uint8List pdfBytes;
  final Future<void>? emailTask;

  const PdfConfirmationScreen({
    super.key,
    required this.data,
    required this.pdfBytes,
    this.emailTask,
  });

  @override
  _PdfConfirmationScreenState createState() => _PdfConfirmationScreenState();
}

class _PdfConfirmationScreenState extends State<PdfConfirmationScreen> {
  String _emailStatus = 'Pending';
  IconData _emailIcon = Icons.hourglass_empty;
  Color _emailColor = Colors.orange;

  /// Share-as-PDF toggle (Aadi, 24-08-2026): ON = WhatsApp sends ONLY the PDF
  /// file; OFF = link mode, WhatsApp receives the confirmation + review link
  /// message. Initialised from AppState (Settings > Quotation Maker keeps the
  /// same value; both write through `setEnablePdfLink` so they never diverge).
  bool _shareAsPdf = true;

  @override
  void initState() {
    super.initState();
    _shareAsPdf =
        Provider.of<AppState>(context, listen: false).enablePdfLink;
    _handleEmailTask();
  }

  Future<void> _handleEmailTask() async {
    if (widget.emailTask == null) {
      setState(() {
        _emailStatus = 'Email not provided';
        _emailIcon = Icons.info_outline;
        _emailColor = Colors.grey;
      });
      return;
    }

    setState(() {
      _emailStatus = 'Sending email...';
      _emailIcon = Icons.hourglass_top;
      _emailColor = Colors.blue;
    });

    try {
      await widget.emailTask!;
      if (mounted) {
        setState(() {
          _emailStatus = 'Email sent successfully';
          _emailIcon = Icons.check_circle;
          _emailColor = Colors.green;
        });
      }
      NotificationService().showImportantNotification(title: "Email Sent", body: "Quotation ${widget.data.quotationNo} email has been sent successfully.");
    } catch (e) {
      if (mounted) {
        setState(() {
          _emailStatus = 'Failed to send email';
          _emailIcon = Icons.error;
          _emailColor = Colors.red;
        });
      }
      NotificationService().showImportantNotification(title: "Email Failed", body: "Failed to send email for quotation ${widget.data.quotationNo}.");
    }
  }

  Future<void> _savePdfToDevice() async {
    try {
      final helper = FileHelper();
      await helper.downloadPdf(widget.pdfBytes, 'Quotation_${widget.data.quotationNo}.pdf');
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Saved: Quotation_${widget.data.quotationNo}.pdf')));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error saving PDF: $e')));
    }
  }

  ClientConfig get _config =>
      Provider.of<AppState>(context, listen: false).clientConfig;

  String _reviewUrl() =>
      QuoteShare.reviewUrl(widget.data, config: _config);

  /// The customer-facing quote link, or `null` when no valid token could be
  /// minted. See `quote_share.dart` for why this is nullable — a tokenless
  /// `/quote/<id>` URL renders "Access Denied" for the customer, so we would
  /// rather send no link than a broken one.
  Future<String?> _quoteLink() async {
    // Ensure the quotation is persisted to cloud before minting a token.
    // New offline UUID drafts (e.g. JVUPVC-24082026-0166) live only in
    // SharedPreferences until the 2s debounce fires. If the user hits Share
    // immediately, the token endpoint would 404 (quotation not found) and
    // QuoteShare would return null -> the "Review & confirm online" line
    // disappears (staging bug reported 24-08-2026). Upsert here best-effort.
    try {
      final clientId = _config.clientId;
      final qId = widget.data.id;
      if (qId != null && qId.isNotEmpty) {
        final qMap = widget.data.toMap(clientId: clientId, includeStatus: true);
        await SupabaseConfig.client.from('quotations').upsert(qMap, onConflict: 'id');
        // Upsert line items best-effort so DB stays consistent; token check
        // only needs the quotation row, but future PDF routes read items.
        try {
          await SupabaseConfig.client
              .from('measured_items')
              .delete()
              .eq('quotation_id', qId)
              .eq('client_id', clientId);
          await SupabaseConfig.client
              .from('unmeasured_items')
              .delete()
              .eq('quotation_id', qId)
              .eq('client_id', clientId);
          if (widget.data.measuredItems.isNotEmpty) {
            await SupabaseConfig.client.from('measured_items').insert(
                widget.data.measuredItems.map((e) => e.toMap(qId, clientId: clientId)).toList());
          }
          if (widget.data.unmeasuredItems.isNotEmpty) {
            await SupabaseConfig.client.from('unmeasured_items').insert(
                widget.data.unmeasuredItems.map((e) => e.toMap(qId, clientId: clientId)).toList());
          }
        } catch (_) {}
      }
    } catch (e) {
      debugPrint('Ensure save before share failed: $e');
    }
    return QuoteShare.quoteLink(widget.data, config: _config);
  }

  /// Message body shared to WhatsApp / Telegram / the OS share sheet.
  Future<String> _shareMessage() async {
    final companyName =
        Provider.of<AppState>(context, listen: false).companyName;
    return QuoteShare.buildMessage(
      data: widget.data,
      companyName: companyName,
      quoteLink: await _quoteLink(),
      reviewUrl: _reviewUrl(),
    );
  }

  /// Writes the PDF to a temp file so it can ride along on the share sheet.
  /// Returns null on web (no temp dir) — callers fall back to in-memory bytes.
  Future<String?> _writeTempPdf() async {
    final helper = FileHelper();
    final dir = await helper.getTempDir();
    if (dir == null) return null;
    final path = '$dir/Quotation_${widget.data.quotationNo}.pdf';
    await helper.writeFile(path, widget.pdfBytes);
    return path;
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _markAsSent() async {
    final d = widget.data;
    if (d.status != QuotationStatus.sent && d.id != null) {
      try {
        final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
        await SupabaseConfig.client
            .from('quotations')
            .update({'status': QuotationStatus.sent.value})
            .eq('id', d.id!)
            .eq('client_id', clientId);
      } catch (_) {}
    }
  }

  Future<void> _sharePdf() async {
    final text = await _shareMessage();
    await Clipboard.setData(ClipboardData(text: text));
    await Share.share(text);
    await _markAsSent();
    _toast('Message copied & shared!');
  }

  /// Opens WhatsApp following the Share-as-PDF toggle:
  ///  ON  -> ONLY the PDF rides out (no caption — WhatsApp drops captions on
  ///          files anyway, so a "link message" here would be lost text).
  ///  OFF -> link mode: deep link with the confirm + review URLs (deep link
  ///          because the share sheet silently drops EXTRA_TEXT). Falls back
  ///          to PDF + text via the OS sheet when WhatsApp is unavailable.
  Future<void> _shareToWhatsApp() async {
    final contactNo = widget.data.contactNo;

    if (_shareAsPdf) {
      final path = await _writeTempPdf();
      if (path != null) {
        await Share.shareXFiles([XFile(path)]);
      } else {
        await Share.shareXFiles([
          XFile.fromData(
            widget.pdfBytes,
            name: 'Quotation_${widget.data.quotationNo}.pdf',
            mimeType: 'application/pdf',
          ),
        ]);
      }
      await _markAsSent();
      _toast('PDF shared!');
      return;
    }

    final text = await _shareMessage();
    await Clipboard.setData(ClipboardData(text: text));

    final launched = await QuoteShare.openWhatsApp(text: text, phone: contactNo);
    if (!launched) {
      final path = await _writeTempPdf();
      if (path != null) {
        await Share.shareXFiles([XFile(path)], text: text);
      } else {
        await Share.share(text);
      }
    }

    await _markAsSent();
    _toast('Message shared & copied to clipboard!');
  }

  Future<void> _shareToTelegram() async {
    final link = await _quoteLink();
    final text = await _shareMessage();
    if (link == null) debugPrint('PdfConfirmationScreen: no quote link — t.me will share review URL only');

    final url = Uri.parse(
      link == null
          ? 'https://t.me/share/url?url=${Uri.encodeComponent(_reviewUrl())}&text=${Uri.encodeComponent(text)}'
          : 'https://t.me/share/url?url=${Uri.encodeComponent(link)}&text=${Uri.encodeComponent(text)}',
    );
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } else {
      await Share.share(text);
    }
    await _markAsSent();
  }

  Future<void> _printPdf() async {
    await printLib.loadLibrary();
    await printLib.Printing.layoutPdf(onLayout: (format) async => widget.pdfBytes);
  }

  Widget _buildShareModeToggle() {
    return Container(
      margin: const EdgeInsets.only(bottom: 24),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade300),
      ),
      child: SwitchListTile(
        value: _shareAsPdf,
        onChanged: (v) {
          setState(() => _shareAsPdf = v);
          // Persist so Settings > Quotation Maker shows the same value.
          Provider.of<AppState>(context, listen: false).setEnablePdfLink(v);
        },
        title: const Text('Share as PDF',
            style: TextStyle(fontWeight: FontWeight.bold)),
        subtitle: Text(
          _shareAsPdf
              ? 'WhatsApp sends only the PDF file'
              : 'WhatsApp sends confirmation + review links',
          style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
        ),
        activeColor: const Color(0xFF25D366),
      ),
    ).animate().fade(delay: 250.ms);
  }

  Widget _buildActionButton(String label, IconData icon, Color color, VoidCallback onTap, int delay, {Widget? brandIcon}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        width: 100,
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          border: Border.all(color: color.withValues(alpha: 0.3)),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          children: [
            brandIcon ?? Icon(icon, size: 32, color: color),
            const SizedBox(height: 8),
            Text(label, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 12)),
          ],
        ),
      ),
    ).animate().fade(delay: Duration(milliseconds: delay)).scale();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Confirmation'),
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(20),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                  boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 10)],
                ),
                child: const Icon(Icons.check_circle, size: 60, color: Colors.green),
              ).animate().scale(curve: Curves.easeOutBack),
              
              const SizedBox(height: 24),
              Text('Quotation Generated', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text(widget.data.quotationNo, style: TextStyle(color: Colors.grey.shade600, fontSize: 16)),
              
              const SizedBox(height: 32),
              
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: _emailColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: _emailColor.withValues(alpha: 0.3)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(_emailIcon, color: _emailColor),
                    const SizedBox(width: 12),
                    Text(_emailStatus, style: TextStyle(color: _emailColor, fontWeight: FontWeight.bold)),
                  ],
                ),
              ).animate().fade(delay: 200.ms).slideY(begin: 0.2),

              const SizedBox(height: 24),
              _buildShareModeToggle(),

              Wrap(
                spacing: 16,
                runSpacing: 16,
                alignment: WrapAlignment.center,
                children: [
                  _buildActionButton('WhatsApp', Icons.chat, Color(0xFF25D366), _shareToWhatsApp, 300, brandIcon: const FaIcon(FontAwesomeIcons.whatsapp, size: 32, color: Color(0xFF25D366))),
                  _buildActionButton('Share', Icons.share, Colors.blue, _sharePdf, 400),
                  _buildActionButton('Save', Icons.download, Colors.indigo, _savePdfToDevice, 500),
                  _buildActionButton('Print', Icons.print, Colors.deepPurple, _printPdf, 600),
                  _buildActionButton('Telegram', Icons.send, Colors.lightBlue, _shareToTelegram, 700),
                ],
              ),
              
              const SizedBox(height: 40),
              TextButton(
                onPressed: () => Navigator.of(context).popUntil((route) => route.isFirst),
                child: const Text('Back to Dashboard', style: TextStyle(fontSize: 16)),
              ).animate().fade(delay: 800.ms),
            ],
          ),
        ),
      ),
    );
  }
}
