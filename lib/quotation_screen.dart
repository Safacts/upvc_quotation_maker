import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';
import 'models.dart';
import 'models_extra.dart';
import 'app_state.dart';
import 'pdf_generator.dart' deferred as pdfGen;
import 'supabase_config.dart';
import 'crafted_widget.dart';
import 'theme.dart';
import 'client_logo.dart';
import 'package:toastification/toastification.dart';
import 'pdf_confirmation_screen.dart';
import 'quote_share.dart';
import 'umami_tracker.dart';
import 'quotation_export.dart' deferred as exportLib;
import 'package:permission_handler/permission_handler.dart';
import 'services/catalog_service.dart';

class QuotationScreen extends StatefulWidget {
  final QuotationData? existingData;

  const QuotationScreen({super.key, this.existingData});

  @override
  _QuotationScreenState createState() => _QuotationScreenState();
}

class _QuotationScreenState extends State<QuotationScreen> {
  late QuotationData data;
  bool _isLoading = false;
  bool _isSaving = false;
  bool _isExporting = false;
  Timer? _debounce;
  List<QuotationData> _pastQuotations = [];
  bool _usePresets = false;
  DateTime? _lastSaved;
  String? _lastSaveError;

  // Product Catalog
  List<Product> _measuredProducts = [];
  List<Product> _unmeasuredProducts = [];
  bool _isLoadingCatalog = false;

  // Site Photos
  List<QuotationPhoto> _photos = [];
  bool _isUploading = false;

  final _nameFocus = FocusNode();
  final _referenceFocus = FocusNode();
  final _addressFocus = FocusNode();
  final _contactFocus = FocusNode();
  final _emailFocus = FocusNode();
  final _transportFocus = FocusNode();
  final _gstFocus = FocusNode();

  final Map<String, FocusNode> _itemFocusNodes = {};

  FocusNode _node(String key) {
    return _itemFocusNodes.putIfAbsent(key, () => FocusNode());
  }

  void _nextField(String currentKey) {
    if (currentKey.startsWith('m_')) {
      final parts = currentKey.split('_');
      final idx = int.parse(parts[1]);
      final field = int.parse(parts[2]);
      if (field < 6) {
        _node('m_${idx}_${field + 1}').requestFocus();
      } else if (idx < data.measuredItems.length - 1) {
        _node('m_${idx + 1}_0').requestFocus();
      } else if (data.unmeasuredItems.isNotEmpty) {
        _node('u_0_0').requestFocus();
      } else {
        _transportFocus.requestFocus();
      }
      return;
    }
    if (currentKey.startsWith('u_')) {
      final parts = currentKey.split('_');
      final idx = int.parse(parts[1]);
      final field = int.parse(parts[2]);
      if (field < 2) {
        _node('u_${idx}_${field + 1}').requestFocus();
      } else if (idx < data.unmeasuredItems.length - 1) {
        _node('u_${idx + 1}_0').requestFocus();
      } else {
        _transportFocus.requestFocus();
      }
      return;
    }
  }

  @override
  void initState() {
    super.initState();
    _usePresets = Provider.of<AppState>(context, listen: false).clientConfig.enablePricePresets;
    if (widget.existingData != null) {
      data = widget.existingData!;
      _loadItems();
      if (data.id != null) {
        _loadPhotos();
      }
    } else {
      data = QuotationData();
      _initQuoteNumber();
    }
    _fetchPastQuotations();
    _loadCatalog();
    unawaited(_prefetchGenerationLibs());
  }

  Future<void> _prefetchGenerationLibs() async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
    try {
      await Future.wait([pdfGen.loadLibrary(), exportLib.loadLibrary()]);
    } catch (_) {
      return;
    }
  }

  Future<void> _fetchPastQuotations() async {
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final response = await SupabaseConfig.client
          .from('quotations')
          .select()
          .eq('client_id', clientId);
      if (mounted) {
        setState(() {
          _pastQuotations = (response as List).map((e) => QuotationData.fromMap(e)).toList();
        });
      }
    } catch (e) {
      debugPrint('Failed to load past quotes: $e');
    }
  }

  Future<void> _loadCatalog({bool forceRefresh = false}) async {
    setState(() => _isLoadingCatalog = true);
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final catalogService = CatalogService.instance;
      
      if (forceRefresh) {
        catalogService.invalidate(clientId);
      }
      
      final measured = await catalogService.fetchMeasuredProducts(clientId);
      final unmeasured = await catalogService.fetchUnmeasuredProducts(clientId);
      
      if (mounted) {
        setState(() {
          _measuredProducts = measured;
          _unmeasuredProducts = unmeasured;
          _isLoadingCatalog = false;
        });
      }
    } catch (e) {
      debugPrint('Failed to load catalog: $e');
      if (mounted) {
        setState(() {
          _isLoadingCatalog = false;
          _measuredProducts = [];
          _unmeasuredProducts = [];
        });
        toastification.show(
          context: context,
          title: const Text('Catalog load failed'),
          description: Text(e.toString()),
          type: ToastificationType.warning,
          style: ToastificationStyle.fillColored,
          autoCloseDuration: const Duration(seconds: 4),
          alignment: Alignment.bottomCenter,
        );
      }
    }
  }

  // ===== SITE PHOTOS =====

  Future<void> _loadPhotos() async {
    if (data.id == null) return;
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final response = await SupabaseConfig.client
          .from('quotation_photos')
          .select()
          .eq('quotation_id', data.id!)
          .eq('client_id', clientId)
          .order('created_at', ascending: false);
      
      if (mounted) {
        setState(() {
          _photos = (response as List).map((e) => QuotationPhoto.fromMap(e)).toList();
        });
      }
    } catch (e) {
      debugPrint('Failed to load photos: $e');
    }
  }

  Future<PermissionStatus> _requestPhotoPermission(ImageSource source) async {
    if (source == ImageSource.camera) {
      final status = await Permission.camera.request();
      if (status.isGranted) return status;
      if (status.isPermanentlyDenied) {
        await openAppSettings();
      }
      return status;
    } else {
      if (Platform.isAndroid) {
        // Android 13+ uses READ_MEDIA_IMAGES
        final status = await Permission.photos.request();
        if (status.isGranted) return status;
        if (status.isPermanentlyDenied) {
          await openAppSettings();
        }
        return status;
      } else {
        // iOS
        final status = await Permission.photos.request();
        if (status.isGranted) return status;
        if (status.isPermanentlyDenied) {
          await openAppSettings();
        }
        return status;
      }
    }
  }

  Future<void> _pickImage(ImageSource source) async {
    final permission = await _requestPhotoPermission(source);
    if (!permission.isGranted) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Permission denied for ${source == ImageSource.camera ? 'camera' : 'gallery'}')),
        );
      }
      return;
    }

    final picker = ImagePicker();
    final XFile? pickedFile = await picker.pickImage(
      source: source,
      maxWidth: 1600,
      maxHeight: 1600,
      imageQuality: 75,
      preferredCameraDevice: CameraDevice.rear,
    );

    if (pickedFile == null) return;

    final bytes = await pickedFile.readAsBytes();
    if (bytes.length > 200 * 1024) {
      // If still too large, compress further
      final compressedFile = await picker.pickImage(
        source: source,
        maxWidth: 1200,
        maxHeight: 1200,
        imageQuality: 60,
      );
      if (compressedFile != null) {
        final compressedBytes = await compressedFile.readAsBytes();
        if (compressedBytes.length <= 200 * 1024) {
          await _uploadPhoto(compressedBytes);
        } else {
          await _uploadPhoto(bytes); // Upload anyway, let server handle it
        }
      } else {
        await _uploadPhoto(bytes);
      }
    } else {
      await _uploadPhoto(bytes);
    }
  }

  Future<void> _uploadPhoto(Uint8List imageBytes) async {
    if (data.id == null) {
      // Auto-save first to get an ID
      await _autoSaveToDatabase();
      if (data.id == null) return;
    }

    setState(() => _isUploading = true);

    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final uuid = const Uuid().v4();
      final storagePath = '$clientId/${data.id}/$uuid.jpg';
      
      // Upload to Supabase Storage
      await SupabaseConfig.client.storage
          .from('site-photos')
          .uploadBinary(storagePath, imageBytes, fileOptions: const FileOptions(
            contentType: 'image/jpeg',
            upsert: false,
          ));

      // Get public URL
      final publicUrl = SupabaseConfig.client.storage
          .from('site-photos')
          .getPublicUrl(storagePath);

      // Get image dimensions
      int? width;
      int? height;
      try {
        final codec = await instantiateImageCodec(imageBytes);
        final frame = await codec.getNextFrame();
        width = frame.image.width;
        height = frame.image.height;
      } catch (_) {}

      // Insert metadata row
      final photo = QuotationPhoto(
        quotationId: data.id!,
        storagePath: storagePath,
        publicUrl: publicUrl,
        caption: '',
        width: width,
        height: height,
        bytes: imageBytes.length,
      );

      await SupabaseConfig.client
          .from('quotation_photos')
          .insert(photo.toMap(clientId: clientId));

      // Refresh photo list
      await _loadPhotos();

      if (mounted) {
        toastification.show(
          context: context,
          title: const Text('Photo uploaded'),
          type: ToastificationType.success,
          style: ToastificationStyle.fillColored,
          autoCloseDuration: const Duration(seconds: 2),
          alignment: Alignment.bottomCenter,
        );
      }
    } catch (e) {
      debugPrint('Photo upload error: $e');
      if (mounted) {
        toastification.show(
          context: context,
          title: const Text('Upload failed'),
          description: Text(e.toString()),
          type: ToastificationType.error,
          style: ToastificationStyle.fillColored,
          autoCloseDuration: const Duration(seconds: 5),
          alignment: Alignment.bottomCenter,
        );
      }
    } finally {
      if (mounted) setState(() => _isUploading = false);
    }
  }

  Future<void> _deletePhoto(QuotationPhoto photo) async {
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;

      // Delete from storage
      await SupabaseConfig.client.storage
          .from('site-photos')
          .remove([photo.storagePath]);

      // Delete from database
      await SupabaseConfig.client
          .from('quotation_photos')
          .delete()
          .eq('id', photo.id!)
          .eq('client_id', clientId);

      // Refresh photo list
      await _loadPhotos();

      if (mounted) {
        toastification.show(
          context: context,
          title: const Text('Photo deleted'),
          type: ToastificationType.success,
          style: ToastificationStyle.fillColored,
          autoCloseDuration: const Duration(seconds: 2),
          alignment: Alignment.bottomCenter,
        );
      }
    } catch (e) {
      debugPrint('Photo delete error: $e');
      if (mounted) {
        toastification.show(
          context: context,
          title: const Text('Delete failed'),
          description: Text(e.toString()),
          type: ToastificationType.error,
          style: ToastificationStyle.fillColored,
          autoCloseDuration: const Duration(seconds: 5),
          alignment: Alignment.bottomCenter,
        );
      }
    }
  }

  void _showPhotoSourceDialog() {
    showModalBottomSheet(
      context: context,
      builder: (context) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.camera_alt),
                title: const Text('Take Photo'),
                onTap: () {
                  Navigator.pop(context);
                  _pickImage(ImageSource.camera);
                },
              ),
              ListTile(
                leading: const Icon(Icons.photo_library),
                title: const Text('Choose from Gallery'),
                onTap: () {
                  Navigator.pop(context);
                  _pickImage(ImageSource.gallery);
                },
              ),
            ],
          ),
        );
      },
    );
  }

  void _confirmDeletePhoto(QuotationPhoto photo) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Photo'),
        content: const Text('Are you sure you want to delete this photo? This action cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _deletePhoto(photo);
            },
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _nameFocus.dispose();
    _referenceFocus.dispose();
    _addressFocus.dispose();
    _contactFocus.dispose();
    _emailFocus.dispose();
    _transportFocus.dispose();
    _gstFocus.dispose();
    for (final n in _itemFocusNodes.values) {
      n.dispose();
    }
    super.dispose();
  }

  void _onDataChanged() {
    if (_debounce?.isActive ?? false) _debounce!.cancel();
    _debounce = Timer(const Duration(seconds: 2), () {
      _autoSaveToDatabase();
    });
  }

  Future<void> _loadItems() async {
    setState(() => _isLoading = true);
    try {
      if (data.id != null) {
        final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
        final measuredRes = await SupabaseConfig.client
            .from('measured_items')
            .select()
            .eq('quotation_id', data.id!)
            .eq('client_id', clientId);
        final unmeasuredRes = await SupabaseConfig.client
            .from('unmeasured_items')
            .select()
            .eq('quotation_id', data.id!)
            .eq('client_id', clientId);

        setState(() {
          data.measuredItems = (measuredRes as List).map((e) => MeasuredItem.fromMap(e)).toList();
          data.unmeasuredItems = (unmeasuredRes as List).map((e) => UnmeasuredItem.fromMap(e)).toList();
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to load items: $e')));
    }
  }

  Future<void> _initQuoteNumber() async {
    final prefix = Provider.of<AppState>(context, listen: false).quotePrefix;
    final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
    String nextNo = await QuotationData.generateNextQuoteNumber(prefix: prefix, clientId: clientId);
    setState(() => data.quotationNo = nextNo);
    _autoSaveToDatabase();
  }

  Future<void> _autoSaveToDatabase() async {
    setState(() => _isSaving = true);
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final quotationMap = data.toMap(clientId: clientId);
      if (data.id == null) {
        final res = await SupabaseConfig.client.from('quotations').insert(quotationMap).select().single();
        data.id = res['id'];
      } else {
        await SupabaseConfig.client
            .from('quotations')
            .update(quotationMap)
            .eq('id', data.id!)
            .eq('client_id', clientId);
        await SupabaseConfig.client
            .from('measured_items')
            .delete()
            .eq('quotation_id', data.id!)
            .eq('client_id', clientId);
        await SupabaseConfig.client
            .from('unmeasured_items')
            .delete()
            .eq('quotation_id', data.id!)
            .eq('client_id', clientId);
      }

      if (data.measuredItems.isNotEmpty) {
        await SupabaseConfig.client.from('measured_items').insert(data.measuredItems.map((e) => e.toMap(data.id!, clientId: clientId)).toList());
      }
      if (data.unmeasuredItems.isNotEmpty) {
        await SupabaseConfig.client.from('unmeasured_items').insert(data.unmeasuredItems.map((e) => e.toMap(data.id!, clientId: clientId)).toList());
      }
      if (mounted) {
        setState(() { _lastSaved = DateTime.now(); _lastSaveError = null; });
        toastification.show(
          context: context,
          title: Text('Saved ${data.quotationNo}'),
          type: ToastificationType.success,
          style: ToastificationStyle.fillColored,
          autoCloseDuration: const Duration(seconds: 2),
          alignment: Alignment.bottomCenter,
        );
      }
    } catch (e) {
      debugPrint('Auto-save error: $e');
      if (mounted) {
        setState(() => _lastSaveError = e.toString());
        toastification.show(
          context: context,
          title: const Text('Save failed'),
          description: Text(e.toString()),
          type: ToastificationType.error,
          style: ToastificationStyle.fillColored,
          autoCloseDuration: const Duration(seconds: 5),
          alignment: Alignment.bottomCenter,
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  Future<void> _sendEmail(String targetEmail) async {
    try {
      final appState = Provider.of<AppState>(context, listen: false);
      await pdfGen.loadLibrary();
      final pdfBytes = await pdfGen.generatePdfBytes(data, appState, photos: _photos);
      final logoBytes = await loadLogoBytes(appState.clientConfig);
      final reviewUrl = QuoteShare.reviewUrl(data, config: appState.clientConfig);
      final quoteLink = await _quoteLink(data);

      // Only render the "Review & Confirm" CTA when we hold a working token.
      // A tokenless /quote link 403s, so an always-on button was actively
      // harmful — it taught customers the link was broken.
      final reviewCta = quoteLink == null
          ? ''
          : '''
        <p style="color: #475569; font-size: 14px; margin: 16px 0 0 0;">Please review and confirm your quotation:</p>
        <p style="margin: 6px 0 0 0;"><a href="$quoteLink" style="display: inline-block; background-color: #16a34a; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px;">Review &amp; Confirm Quotation</a></p>''';

      final htmlBody = '''
      <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #f8fafc;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="cid:logo" alt="${appState.companyName}" style="max-height: 100px; margin-bottom: 10px;" />
        </div>
        <h2 style="color: #1E3A5F; text-align: center; margin-top: 0;">Quotation from ${appState.companyName}</h2>
        <p style="color: #334155; font-size: 16px;">Dear <b>${data.customerName}</b>,</p>
        <p style="color: #475569; font-size: 15px; line-height: 1.6;">Please find attached the quotation <b>${data.quotationNo}</b> for your requested UPVC windows and doors.</p>
        <div style="background-color: white; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #e2e8f0;">
          <p style="margin: 5px 0; color: #1E3A5F;"><strong>Quote No:</strong> ${data.quotationNo}</p>
          <p style="margin: 5px 0; color: #1E3A5F;"><strong>Date:</strong> ${DateFormat('dd-MMM-yyyy').format(data.date)}</p>
          <p style="margin: 5px 0; color: #1E3A5F;"><strong>Total Amount:</strong> Rs. ${data.grandTotal.toStringAsFixed(2)}</p>
        </div>
$reviewCta
        <p style="color: #475569; font-size: 14px; margin: 16px 0 0 0;">We'd love your feedback! Please rate your experience with us here:</p>
        <p style="margin: 6px 0 0 0;"><a href="$reviewUrl" style="display: inline-block; background-color: #1E3A5F; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px;">Rate Your Experience</a></p>
        <p style="color: #475569; font-size: 14px;">If you have any questions, please feel free to reach out.</p>
        <hr style="border: none; border-top: 1px solid #cbd5e1; margin: 20px 0;">
        <p style="color: #64748b; font-size: 12px; text-align: center;">Prop: ${appState.companyProprietor} | ${appState.companyContact}</p>
      </div>
      ''';

      final url = kIsWeb
          ? '/api/send_email'
          : 'https://app.vitharn.com/api/send_email';
      final res = await http.post(
        Uri.parse(url),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'to': targetEmail.trim(),
          'subject': 'Quotation ${data.quotationNo} from ${appState.companyName}',
          'html': htmlBody,
          'attachments': [
            {
              'filename': '${data.quotationNo}.pdf',
              'content': base64Encode(pdfBytes),
            },
            {
              'filename': 'logo.png',
              'cid': 'logo',
              'content': base64Encode(logoBytes),
            },
          ],
        }),
      );
      if (res.statusCode != 200) {
        throw Exception('Server returned ${res.statusCode}: ${res.body}');
      }
      await _markAsSent();
    } catch (e) {
      throw Exception('Failed to send email: $e');
    }
  }

  Future<void> _markAsSent() async {
    if (data.status != QuotationStatus.sent && data.id != null) {
      setState(() => data.status = QuotationStatus.sent);
      try {
        final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
        await SupabaseConfig.client
            .from('quotations')
            .update({'status': QuotationStatus.sent.value})
            .eq('id', data.id!)
            .eq('client_id', clientId);
      } catch (_) {}
    }
  }

  /// Customer-facing quote link, or `null` when no valid token could be minted.
  ///
  /// This used to be a private `_fetchQuoteToken()` that returned `''` on
  /// failure, which produced `/quote/<id>?token=` — a URL that always answers
  /// 403 for the customer. The shared helper in `quote_share.dart` now returns
  /// null instead, so the email can omit the button rather than embed a dead
  /// one. See that file for the full root-cause write-up.
  Future<String?> _quoteLink(QuotationData q) => QuoteShare.quoteLink(
        q,
        config: Provider.of<AppState>(context, listen: false).clientConfig,
      );

  Future<void> _manualEmailPrompt() async {
    final emailController = TextEditingController(text: data.email);
    showDialog(
      context: context,
      builder: (context) {
        bool isSending = false;
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('Email Quotation'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(controller: emailController, decoration: const InputDecoration(labelText: 'Customer Email'), keyboardType: TextInputType.emailAddress),
                ],
              ),
              actions: [
                TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
                ElevatedButton(
                  onPressed: isSending ? null : () async {
                    if (emailController.text.isEmpty) return;
                    setDialogState(() => isSending = true);
                    try {
                      await _sendEmail(emailController.text);
                      Navigator.pop(context);
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Email sent successfully!')));
                    } catch (e) {
                      setDialogState(() => isSending = false);
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
                    }
                  },
                  child: isSending ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator()) : const Text('Send'),
                ),
              ],
            );
          }
        );
      }
    );
  }

  Future<void> _generateAndProcessPdf() async {
    // 1. Force Save
    umamiTrack('generate_pdf');
    await _autoSaveToDatabase();
    
    // Generate PDF bytes
    final appState = Provider.of<AppState>(context, listen: false);
    await pdfGen.loadLibrary();
    final pdfBytes = await pdfGen.generatePdfBytes(data, appState, photos: _photos);
    
    // 2. If email exists, send automatically in background
    Future<void>? emailTask;
    if (data.email.isNotEmpty && data.email.contains('@')) {
      emailTask = _sendEmail(data.email);
    }

    // 3. Navigate to Confirmation Screen
    if (!mounted) return;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => PdfConfirmationScreen(
          data: data,
          pdfBytes: pdfBytes,
          emailTask: emailTask,
        ),
      ),
    );
  }

  Widget _buildSectionTitle(String title, {Widget? trailing}) {
    return Padding(
      padding: const EdgeInsets.only(top: 24, bottom: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold, color: Theme.of(context).primaryColor)),
          if (trailing != null) trailing,
        ],
      ),
    );
  }

  Color _statusColor(QuotationStatus s) {
    switch (s) {
      case QuotationStatus.draft: return Colors.grey.shade400;
      case QuotationStatus.sent:  return Colors.blue.shade400;
      case QuotationStatus.won:   return Colors.green.shade500;
      case QuotationStatus.lost:  return Colors.red.shade400;
    }
  }

  Widget _statusChip(String label, QuotationStatus status) {
    final isSelected = data.status == status;
    return GestureDetector(
      onTap: () async {
        if (data.status != status) {
          setState(() => data.status = status);
          await _updateStatus(data, status);
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? _statusColor(status) : Colors.transparent,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _statusColor(status), width: 1.5),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
            color: isSelected ? Colors.white : _statusColor(status),
          ),
        ),
      ),
    );
  }

  Future<void> _updateStatus(QuotationData q, QuotationStatus newStatus) async {
    try {
      final clientId = Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      await SupabaseConfig.client
          .from('quotations')
          .update({'status': newStatus.value})
          .eq('id', q.id!)
          .eq('client_id', clientId);
    } catch (e) {
      debugPrint('Status update error: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Scaffold(body: Center(child: CircularProgressIndicator()));

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.existingData == null ? 'New Quotation' : 'Edit Quotation'),
        actions: [
          if (_isSaving)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16.0),
              child: Center(child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))),
            )
          else if (_lastSaveError != null)
            Tooltip(
              message: 'Save error: $_lastSaveError',
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 12.0),
                child: Center(child: Icon(Icons.error, color: Colors.red, size: 18)),
              ),
            )
          else if (_lastSaved != null)
            Tooltip(
              message: 'Last saved ${DateFormat('HH:mm:ss').format(_lastSaved!)}',
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 12.0),
                child: Center(child: Icon(Icons.cloud_done, color: Colors.green, size: 18)),
              ),
            ),
          IconButton(icon: const Icon(Icons.email), onPressed: _manualEmailPrompt, tooltip: 'Send to custom email'),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Quote No', style: TextStyle(fontSize: 12, color: Colors.grey)),
                            Text(data.quotationNo, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                          ],
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            const Text('Date', style: TextStyle(fontSize: 12, color: Colors.grey)),
                            Text(DateFormat('dd-MMM-yyyy').format(data.date), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Icon(
                          _lastSaveError != null ? Icons.error : (_isSaving ? Icons.sync : Icons.cloud_done),
                          size: 14,
                          color: _lastSaveError != null ? Colors.red : Colors.green,
                        ),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            _lastSaveError != null
                                ? 'Save ERROR: $_lastSaveError'
                                : (_isSaving ? 'Saving...' : (_lastSaved != null ? 'Saved to ${Provider.of<AppState>(context, listen: false).clientConfig.clientId} at ${DateFormat('HH:mm:ss').format(_lastSaved!)}' : 'Not saved yet')),
                            style: TextStyle(fontSize: 11, color: _lastSaveError != null ? Colors.red : Colors.green.shade700),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ).animate().fade().slideY(begin: -0.1),

            // Status selector
            if (widget.existingData != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  children: [
                    const Text('Status: ', style: TextStyle(fontSize: 13, color: Colors.grey)),
                    Expanded(
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: [
                            _statusChip('Draft', QuotationStatus.draft),
                            const SizedBox(width: 6),
                            _statusChip('Sent', QuotationStatus.sent),
                            const SizedBox(width: 6),
                            _statusChip('Won', QuotationStatus.won),
                            const SizedBox(width: 6),
                            _statusChip('Lost', QuotationStatus.lost),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ).animate().fade().slideY(begin: -0.1),

            _buildSectionTitle('Customer Details').animate().fade().fade(delay: 100.ms),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Autocomplete<QuotationData>(
                      initialValue: TextEditingValue(text: data.customerName),
                      displayStringForOption: (option) => option.customerName,
                      optionsBuilder: (TextEditingValue textEditingValue) {
                        if (textEditingValue.text.isEmpty) return const Iterable<QuotationData>.empty();
                        final uniqueCustomers = <String, QuotationData>{};
                        for (var q in _pastQuotations) {
                          if (q.customerName.toLowerCase().contains(textEditingValue.text.toLowerCase())) {
                            uniqueCustomers.putIfAbsent(q.customerName, () => q);
                          }
                        }
                        return uniqueCustomers.values;
                      },
                      onSelected: (QuotationData selection) {
                        setState(() {
                          data.customerName = selection.customerName;
                          data.address = selection.address;
                          data.contactNo = selection.contactNo;
                          data.email = selection.email;
                        });
                        _onDataChanged();
                      },
                      fieldViewBuilder: (context, textEditingController, focusNode, onFieldSubmitted) {
                        return TextFormField(
                          controller: textEditingController,
                          focusNode: focusNode,
                          textInputAction: TextInputAction.next,
                          onFieldSubmitted: (_) {
                            onFieldSubmitted();
                            _referenceFocus.requestFocus();
                          },
                          decoration: const InputDecoration(labelText: 'Name'),
                          onChanged: (val) { data.customerName = val; _onDataChanged(); },
                        );
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      focusNode: _referenceFocus,
                      initialValue: data.reference,
                      textInputAction: TextInputAction.next,
                      onFieldSubmitted: (_) => _addressFocus.requestFocus(),
                      decoration: const InputDecoration(labelText: 'Reference'),
                      onChanged: (val) { data.reference = val; _onDataChanged(); }
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      focusNode: _addressFocus,
                      initialValue: data.address,
                      textInputAction: TextInputAction.next,
                      onFieldSubmitted: (_) => _contactFocus.requestFocus(),
                      decoration: const InputDecoration(labelText: 'Address'),
                      onChanged: (val) { data.address = val; _onDataChanged(); }
                    ),
                    const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: TextFormField(
                              focusNode: _contactFocus,
                              initialValue: data.contactNo,
                              keyboardType: TextInputType.phone,
                              textInputAction: TextInputAction.next,
                              onFieldSubmitted: (_) => _emailFocus.requestFocus(),
                              inputFormatters: [
                                LengthLimitingTextInputFormatter(10)
                              ],
                              decoration: const InputDecoration(labelText: 'Contact No'),
                              onChanged: (val) { data.contactNo = val; _onDataChanged(); }
                            )
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextFormField(
                              focusNode: _emailFocus,
                              initialValue: data.email,
                              keyboardType: TextInputType.emailAddress,
                              textInputAction: TextInputAction.done,
                              decoration: const InputDecoration(labelText: 'Email (Optional)'),
                               onChanged: (val) { data.email = val; _onDataChanged(); }
                            )
                          ),
                        ],
                      ),
                     if (Provider.of<AppState>(context, listen: false).clientConfig.clientId == 'kprupvc' &&
                         Provider.of<AppState>(context, listen: false).supplierCompanies.isNotEmpty) ...[
                       const SizedBox(height: 12),
                       DropdownButtonFormField<String>(
                         initialValue: data.supplierCompany.isEmpty ? null : data.supplierCompany,
                         decoration: InputDecoration(
                           labelText: 'Supplier Company',
                           labelStyle: TextStyle(color: Theme.of(context).primaryColor),
                           border: const OutlineInputBorder(),
                         ),
                         isExpanded: true,
                         items: [
                           const DropdownMenuItem<String>(
                             value: null,
                             child: Text('-- Select Supplier --'),
                           ),
                           ...Provider.of<AppState>(context, listen: false).supplierCompanies.map((c) {
                             return DropdownMenuItem<String>(value: c, child: Text(c));
                           }),
                         ],
                         onChanged: (val) {
                           setState(() {
                             data.supplierCompany = val ?? '';
                           });
                           _onDataChanged();
                         },
                       ),
                     ],
                  ],
                ),
              ),
            ).animate().fade(delay: 200.ms),

            SwitchListTile(
              title: const Text('Enable Presets (Autofill from Catalog)', style: TextStyle(fontWeight: FontWeight.bold)),
              value: _usePresets,
              activeThumbColor: Theme.of(context).colorScheme.primary,
              onChanged: (val) => setState(() => _usePresets = val),
            ).animate().fade(delay: 250.ms),

            _buildSectionTitle('Measured Items', trailing: IconButton(
              icon: const Icon(Icons.refresh, size: 20),
              onPressed: _isLoadingCatalog ? null : () => _loadCatalog(forceRefresh: true),
              tooltip: 'Refresh product catalog',
            )).animate().fade(delay: 300.ms),
            ...data.measuredItems.asMap().entries.map((entry) {
              int index = entry.key;
              MeasuredItem item = entry.value;
              return Card(
                key: item.cardKey,
                margin: const EdgeInsets.only(bottom: 12),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Item #${index + 1}', style: const TextStyle(fontWeight: FontWeight.bold)),
                          IconButton(icon: const Icon(Icons.delete, color: Colors.redAccent), padding: EdgeInsets.zero, constraints: const BoxConstraints(), onPressed: () { setState(() => data.measuredItems.removeAt(index)); _onDataChanged(); }),
                        ],
                      ),
                      const SizedBox(height: 12),
if (_usePresets) ...[
                          Row(
                            children: [
                              Expanded(
                                child: DropdownButtonFormField<Product>(
                                  decoration: InputDecoration(
                                    labelText: 'Select from Product Catalog (Autofills fields)',
                                    prefixIcon: _isLoadingCatalog
                                        ? const SizedBox(
                                            width: 20,
                                            height: 20,
                                            child: Padding(
                                              padding: EdgeInsets.all(12.0),
                                              child: CircularProgressIndicator(strokeWidth: 2),
                                            ),
                                          )
                                        : null,
                                  ),
                                  initialValue: null,
                                  isExpanded: true,
                                  hint: Text(_isLoadingCatalog ? 'Loading catalog...' : 'Choose a product...'),
                                  items: _measuredProducts.map((p) {
                                    return DropdownMenuItem<Product>(
                                      value: p,
                                      child: Text(p.displayLabel),
                                    );
                                  }).toList(),
                                  onChanged: _isLoadingCatalog ? null : (Product? product) {
                                    if (product != null) {
                                      setState(() {
                                        if (product.name.isNotEmpty) item.code = product.name;
                                        item.description = product.description.isNotEmpty ? product.description : product.name;
                                        item.glass = '';
                                        item.width = 0;
                                        item.height = 0;
                                        item.rate = product.price;
                                        item.cardKey = UniqueKey();
                                      });
                                      _onDataChanged();
                                    }
                                  },
                                ),
                              ),
                              IconButton(
                                icon: const Icon(Icons.refresh, size: 20),
                                onPressed: _isLoadingCatalog ? null : () => _loadCatalog(forceRefresh: true),
                                tooltip: 'Refresh product catalog',
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                        ],
                      Row(children: [
                        Expanded(child: TextFormField(focusNode: _node('m_${index}_0'), initialValue: item.code, textInputAction: TextInputAction.next, onFieldSubmitted: (_) => _nextField('m_${index}_0'), decoration: const InputDecoration(labelText: 'Code'), onChanged: (val) { item.code = val; _onDataChanged(); })),
                        const SizedBox(width: 12),
                        Expanded(flex: 2, child: 
                          TextFormField(
                            focusNode: _node('m_${index}_1'), 
                            initialValue: item.description, 
                            textInputAction: TextInputAction.next, 
                            onFieldSubmitted: (_) => _nextField('m_${index}_1'), 
                            decoration: const InputDecoration(labelText: 'Description'), 
                            onChanged: (val) { item.description = val; _onDataChanged(); }
                          )
                        ),
                      ]),
                      const SizedBox(height: 12),
                      Row(children: [
                        Expanded(child: TextFormField(focusNode: _node('m_${index}_2'), initialValue: item.width == 0 ? '' : item.width.toString(), keyboardType: TextInputType.number, textInputAction: TextInputAction.next, onFieldSubmitted: (_) => _nextField('m_${index}_2'), decoration: const InputDecoration(labelText: 'W (MM)'), onChanged: (val) { item.width = double.tryParse(val) ?? 0; setState((){}); _onDataChanged(); })),
                        const SizedBox(width: 12),
                        Expanded(child: TextFormField(focusNode: _node('m_${index}_3'), initialValue: item.height == 0 ? '' : item.height.toString(), keyboardType: TextInputType.number, textInputAction: TextInputAction.next, onFieldSubmitted: (_) => _nextField('m_${index}_3'), decoration: const InputDecoration(labelText: 'H (MM)'), onChanged: (val) { item.height = double.tryParse(val) ?? 0; setState((){}); _onDataChanged(); })),
                        const SizedBox(width: 12),
                        Expanded(child: TextFormField(focusNode: _node('m_${index}_4'), initialValue: item.units.toString(), keyboardType: TextInputType.number, textInputAction: TextInputAction.next, onFieldSubmitted: (_) => _nextField('m_${index}_4'), decoration: const InputDecoration(labelText: 'Units'), onChanged: (val) { item.units = int.tryParse(val) ?? 1; setState((){}); _onDataChanged(); })),
                      ]),
                      const SizedBox(height: 12),
                      Row(children: [
                        Expanded(child: TextFormField(focusNode: _node('m_${index}_5'), initialValue: item.glass, textInputAction: TextInputAction.next, onFieldSubmitted: (_) => _nextField('m_${index}_5'), decoration: const InputDecoration(labelText: 'Glass'), onChanged: (val) { item.glass = val; _onDataChanged(); })),
                        const SizedBox(width: 12),
                        Expanded(child: TextFormField(focusNode: _node('m_${index}_6'), initialValue: item.rate == 0 ? '' : item.rate.toString(), keyboardType: TextInputType.number, textInputAction: TextInputAction.next, onFieldSubmitted: (_) => _nextField('m_${index}_6'), decoration: const InputDecoration(labelText: 'Rate (Rs)'), onChanged: (val) { item.rate = double.tryParse(val) ?? 0; setState((){}); _onDataChanged(); })),
                      ]),
                    ],
                  ),
                ),
              ).animate().fade(delay: 300.ms).slideX(begin: 0.1);
            }),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(icon: const Icon(Icons.add), label: const Text('Add Measured Item'), onPressed: () { setState(() => data.measuredItems.add(MeasuredItem())); _onDataChanged(); }),
            ).animate().fade(delay: 400.ms),

            _buildSectionTitle('Unmeasured Items', trailing: IconButton(
              icon: const Icon(Icons.refresh, size: 20),
              onPressed: _isLoadingCatalog ? null : () => _loadCatalog(forceRefresh: true),
              tooltip: 'Refresh product catalog',
            )).animate().fade(delay: 500.ms),
            ...data.unmeasuredItems.asMap().entries.map((entry) {
              int index = entry.key;
              UnmeasuredItem item = entry.value;
              return Card(
                key: item.cardKey,
                margin: const EdgeInsets.only(bottom: 12),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Unmeasured #${index + 1}', style: const TextStyle(fontWeight: FontWeight.bold)),
                          IconButton(icon: const Icon(Icons.delete, color: Colors.redAccent), padding: EdgeInsets.zero, constraints: const BoxConstraints(), onPressed: () { setState(() => data.unmeasuredItems.removeAt(index)); _onDataChanged(); }),
                        ],
                      ),
                      const SizedBox(height: 12),
if (_usePresets) ...[
                          Row(
                            children: [
                              Expanded(
                                child: DropdownButtonFormField<Product>(
                                  decoration: InputDecoration(
                                    labelText: 'Select from Product Catalog (Autofills fields)',
                                    prefixIcon: _isLoadingCatalog
                                        ? const SizedBox(
                                            width: 20,
                                            height: 20,
                                            child: Padding(
                                              padding: EdgeInsets.all(12.0),
                                              child: CircularProgressIndicator(strokeWidth: 2),
                                            ),
                                          )
                                        : null,
                                  ),
                                  initialValue: null,
                                  isExpanded: true,
                                  hint: Text(_isLoadingCatalog ? 'Loading catalog...' : 'Choose a product...'),
                                  items: _unmeasuredProducts.map((p) {
                                    return DropdownMenuItem<Product>(
                                      value: p,
                                      child: Text(p.displayLabel),
                                    );
                                  }).toList(),
                                  onChanged: _isLoadingCatalog ? null : (Product? product) {
                                    if (product != null) {
                                      setState(() {
                                        item.description = product.description.isNotEmpty ? product.description : product.name;
                                        item.rate = product.price;
                                        item.cardKey = UniqueKey();
                                      });
                                      _onDataChanged();
                                    }
                                  },
                                ),
                              ),
                              IconButton(
                                icon: const Icon(Icons.refresh, size: 20),
                                onPressed: _isLoadingCatalog ? null : () => _loadCatalog(forceRefresh: true),
                                tooltip: 'Refresh product catalog',
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                        ],
                      TextFormField(
                        focusNode: _node('u_${index}_0'), 
                        initialValue: item.description, 
                        textInputAction: TextInputAction.next, 
                        onFieldSubmitted: (_) => _nextField('u_${index}_0'), 
                        decoration: const InputDecoration(labelText: 'Description'), 
                        onChanged: (val) { item.description = val; _onDataChanged(); }
                      ),
                      const SizedBox(height: 12),
                      Row(children: [
                        Expanded(child: TextFormField(focusNode: _node('u_${index}_1'), initialValue: item.units.toString(), keyboardType: TextInputType.number, textInputAction: TextInputAction.next, onFieldSubmitted: (_) => _nextField('u_${index}_1'), decoration: const InputDecoration(labelText: 'Units'), onChanged: (val) { item.units = int.tryParse(val) ?? 1; setState((){}); _onDataChanged(); })),
                        const SizedBox(width: 12),
                        Expanded(child: TextFormField(focusNode: _node('u_${index}_2'), initialValue: item.rate == 0 ? '' : item.rate.toString(), keyboardType: TextInputType.number, textInputAction: TextInputAction.next, onFieldSubmitted: (_) => _nextField('u_${index}_2'), decoration: const InputDecoration(labelText: 'Rate (Rs)'), onChanged: (val) { item.rate = double.tryParse(val) ?? 0; setState((){}); _onDataChanged(); })),
                      ]),
                    ],
                  ),
                ),
              ).animate().fade(delay: 500.ms).slideX(begin: 0.1);
            }),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(icon: const Icon(Icons.add), label: const Text('Add Unmeasured Item'), onPressed: () { setState(() => data.unmeasuredItems.add(UnmeasuredItem())); _onDataChanged(); }),
            ).animate().fade(delay: 600.ms),

            // ===== SITE PHOTOS SECTION =====
            _buildSectionTitle('Site Photos').animate().fade(delay: 650.ms),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_photos.isNotEmpty) ...[
                      GridView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          childAspectRatio: 1,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                        ),
                        itemCount: _photos.length,
                        itemBuilder: (context, index) {
                          final photo = _photos[index];
                          return Stack(
                            fit: StackFit.expand,
                            children: [
                              AspectRatio(
                                aspectRatio: photo.aspectRatio,
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: Image.network(
                                    photo.publicUrl,
                                    fit: BoxFit.cover,
                                    loadingBuilder: (context, child, loadingProgress) {
                                      if (loadingProgress == null) return child;
                                      return Center(
                                        child: CircularProgressIndicator(
                                          value: loadingProgress.expectedTotalBytes != null
                                              ? loadingProgress.cumulativeBytesLoaded / loadingProgress.expectedTotalBytes!
                                              : null,
                                          strokeWidth: 2,
                                        ),
                                      );
                                    },
                                    errorBuilder: (context, error, stackTrace) {
                                      return Container(
                                        color: Colors.grey[200],
                                        child: const Icon(Icons.broken_image, color: Colors.grey),
                                      );
                                    },
                                  ),
                                ),
                              ),
                              // Caption overlay
                              if (photo.caption.isNotEmpty)
                                Positioned(
                                  bottom: 0,
                                  left: 0,
                                  right: 0,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: Colors.black54,
                                      borderRadius: const BorderRadius.only(
                                        bottomLeft: Radius.circular(8),
                                        bottomRight: Radius.circular(8),
                                      ),
                                    ),
                                    child: Text(
                                      photo.caption,
                                      style: const TextStyle(color: Colors.white, fontSize: 11),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ),
                              // Delete button
                              Positioned(
                                top: 4,
                                right: 4,
                                child: GestureDetector(
                                  onTap: () => _confirmDeletePhoto(photo),
                                  child: Container(
                                    padding: const EdgeInsets.all(4),
                                    decoration: BoxDecoration(
                                      color: Colors.red,
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: const Icon(Icons.close, color: Colors.white, size: 16),
                                  ),
                                ),
                              ),
                            ],
                          );
                        },
                      ),
                      const SizedBox(height: 12),
                    ],
                    // Add Photo Button
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        icon: _isUploading
                            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.add_a_photo),
                        label: Text(_isUploading ? 'Uploading...' : 'Add Site Photo'),
                        onPressed: _isUploading ? null : _showPhotoSourceDialog,
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          side: BorderSide(color: Theme.of(context).colorScheme.primary),
                        ),
                      ),
                    ),
                    if (_photos.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(
                        '${_photos.length} photo(s) attached',
                        style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                      ),
                    ],
                  ],
                ),
              ),
            ).animate().fade(delay: 650.ms).slideX(begin: 0.1),

            _buildSectionTitle('Final Computations').animate().fade(delay: 700.ms),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    TextFormField(
                      focusNode: _transportFocus,
                      initialValue: data.transport == 0 ? '' : data.transport.toString(),
                      keyboardType: TextInputType.number,
                      textInputAction: TextInputAction.next,
                      onFieldSubmitted: (_) {
                        if (data.includeGst) {
                          _gstFocus.requestFocus();
                        }
                      },
                      decoration: const InputDecoration(labelText: 'Transport Cost (Rs)'),
                      onChanged: (val) {
                        data.transport = double.tryParse(val) ?? 0;
                        setState(() {});
                        _onDataChanged();
                      },
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Checkbox(
                          value: data.includeGst,
                          onChanged: (val) {
                            setState(() {
                              data.includeGst = val ?? false;
                              if (data.includeGst && data.gstPercentage == 0.0) {
                                final appState = Provider.of<AppState>(context, listen: false);
                                data.gstPercentage = appState.defaultGstPercentage;
                              }
                            });
                            _onDataChanged();
                          },
                        ),
                        const Expanded(child: Text('Do you want to add GST to the invoice?')),
                      ],
                    ),
                    if (data.includeGst)
                      Padding(
                        padding: const EdgeInsets.only(left: 48.0, top: 8.0, bottom: 8.0),
                        child: TextFormField(
                          focusNode: _gstFocus,
                          initialValue: data.gstPercentage == 0.0 ? '' : data.gstPercentage.toString(),
                          keyboardType: TextInputType.number,
                          textInputAction: TextInputAction.done,
                          decoration: const InputDecoration(labelText: 'GST Percentage (%)'),
                          onChanged: (val) {
                            data.gstPercentage = double.tryParse(val) ?? 0.0;
                            setState(() {});
                            _onDataChanged();
                          },
                        ),
                      ),
                    const Divider(),
                    const SizedBox(height: 8),
                    _buildComputationRow('Subtotal (Actual Amount)', data.actualAmount),
                    _buildComputationRow('Transport Cost', data.transport),
                    if (data.includeGst)
                      _buildComputationRow('IGST (${data.gstPercentage}%)', data.igst),
                    const Divider(thickness: 1.5),
                    _buildComputationRow('Grand Total', data.grandTotal, isBold: true),
                    const SizedBox(height: 8),
                    Text(
                      data.amountInWords,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ],
                ),
              ),
            ).animate().fade(delay: 700.ms),
            
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              height: 60,
              child: ElevatedButton(
                onPressed: _generateAndProcessPdf,
                style: ElevatedButton.styleFrom(padding: EdgeInsets.zero, backgroundColor: Colors.transparent, elevation: 0, shadowColor: Colors.transparent),
                child: Ink(
                  decoration: BoxDecoration(
                    gradient: AppTheme.primaryGradientFrom(Provider.of<AppState>(context, listen: false).clientConfig),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Container(
                    alignment: Alignment.center,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: const [
                        Icon(Icons.picture_as_pdf, color: Colors.white),
                        SizedBox(width: 12),
                        Text('GENERATE PDF', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
                      ],
                    ),
                  ),
                ),
              ),
            ).animate().scale(delay: 800.ms),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _exportData('xlsx'),
                    icon: const Icon(Icons.table_chart),
                    label: const Text('EXPORT EXCEL'),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      side: BorderSide(color: Theme.of(context).colorScheme.primary),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _exportData('csv'),
                    icon: const Icon(Icons.grid_on),
                    label: const Text('EXPORT CSV'),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      side: BorderSide(color: Theme.of(context).colorScheme.primary),
                    ),
                  ),
                ),
              ],
            ).animate().fade(delay: 850.ms),
            const SizedBox(height: 20),
            CraftedWithLoveWidget(),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  Future<void> _exportData(String format) async {
    if (_isExporting) return;
    _isExporting = true;
    final appState = Provider.of<AppState>(context, listen: false);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await exportLib.loadLibrary();
      if (format == 'xlsx') {
        await exportLib.exportQuotationXlsx(data, appState);
      } else {
        await exportLib.exportQuotationCsv(data, appState);
      }
      messenger.showSnackBar(SnackBar(
        content: Text('Exported ${data.quotationNo}.$format'),
        duration: const Duration(seconds: 2),
      ));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Export failed: $e')));
    } finally {
      _isExporting = false;
    }
  }

  Widget _buildComputationRow(String label, double amount, {bool isBold = false}) {
    final theme = Theme.of(context);
    final style = TextStyle(
      fontSize: isBold ? 16 : 14,
      fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
      color: isBold ? theme.colorScheme.primary : theme.textTheme.bodyLarge?.color,
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: style),
          Text('₹${amount.toStringAsFixed(2)}', style: style),
        ],
      ),
    );
  }
}