import 'dart:async';
import 'dart:ui' as ui;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:toastification/toastification.dart';
import 'package:uuid/uuid.dart';

import '../models_extra.dart';
import '../app_state.dart';
import '../supabase_config.dart';

/// A self-contained widget for managing site photos attached to a quotation.
///
/// Handles: camera capture, gallery pick, image compression (≤ 1 MB),
/// upload to Supabase Storage, thumbnail grid with delete, and metadata
/// CRUD on the `quotation_photos` table.
///
/// **Storage bucket:** `site-photos` (created in migration 012).
/// **Table:** `quotation_photos` (created in migration 012).
class SitePhotoPicker extends StatefulWidget {
  /// The UUID of the quotation these photos belong to. Pass `null` for a
  /// brand-new quote that hasn't been saved to the DB yet — the widget will
  /// auto-save via [onRequestSave] before uploading.
  final String? quotationId;

  /// The initial set of photos already persisted (e.g. loaded from DB).
  final List<QuotationPhoto> initialPhotos;

  /// Called whenever the photo list changes so the parent can update its state.
  final ValueChanged<List<QuotationPhoto>> onPhotosChanged;

  /// Called when the widget needs the quotation to exist in the DB (for new
  /// quotes). The parent should call `_autoSaveToDatabase()` and return the
  /// resulting `data.id`. Return `null` if the save failed.
  final Future<String?> Function() onRequestSave;

  /// Whether uploads should be disabled (e.g. while the parent is saving).
  final bool enabled;

  const SitePhotoPicker({
    super.key,
    this.quotationId,
    this.initialPhotos = const [],
    required this.onPhotosChanged,
    required this.onRequestSave,
    this.enabled = true,
  });

  @override
  State<SitePhotoPicker> createState() => _SitePhotoPickerState();
}

class _SitePhotoPickerState extends State<SitePhotoPicker> {
  List<QuotationPhoto> _photos = [];
  bool _isUploading = false;
  bool _isLoading = false;

  /// Maximum file size after compression (1 MB).
  static const int _maxBytes = 1 * 1024 * 1024;

  @override
  void initState() {
    super.initState();
    _photos = List<QuotationPhoto>.from(widget.initialPhotos);
  }

  @override
  void didUpdateWidget(SitePhotoPicker oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Sync from parent when the parent reloads photos (e.g. after DB load).
    if (widget.initialPhotos != oldWidget.initialPhotos &&
        !_listEquals(widget.initialPhotos, _photos)) {
      _photos = List<QuotationPhoto>.from(widget.initialPhotos);
    }
  }

  bool _listEquals(List<QuotationPhoto> a, List<QuotationPhoto> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i].id != b[i].id) return false;
    }
    return true;
  }

  // ──────────────────────────── PERMISSIONS ────────────────────────────

  Future<PermissionStatus> _requestPermission(ImageSource source) async {
    if (source == ImageSource.camera) {
      final status = await Permission.camera.request();
      if (status.isPermanentlyDenied) await openAppSettings();
      return status;
    } else {
      final status = await Permission.photos.request();
      if (status.isPermanentlyDenied) await openAppSettings();
      return status;
    }
  }

  // ──────────────────────────── PICK / COMPRESS ────────────────────────

  Future<void> _pickImage(ImageSource source) async {
    final permission = await _requestPermission(source);
    if (!permission.isGranted) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
              'Permission denied for ${source == ImageSource.camera ? 'camera' : 'gallery'}'),
        ));
      }
      return;
    }

    final picker = ImagePicker();

    // First pass — standard quality.
    final XFile? picked = await picker.pickImage(
      source: source,
      maxWidth: 1600,
      maxHeight: 1600,
      imageQuality: 80,
      preferredCameraDevice: CameraDevice.rear,
    );
    if (picked == null) return;

    Uint8List bytes = await picked.readAsBytes();

    // If still over 1 MB, compress more aggressively.
    if (bytes.length > _maxBytes) {
      final compressed = await picker.pickImage(
        source: source,
        maxWidth: 1200,
        maxHeight: 1200,
        imageQuality: 60,
      );
      if (compressed != null) {
        final compressedBytes = await compressed.readAsBytes();
        if (compressedBytes.length <= _maxBytes) {
          bytes = compressedBytes;
        }
        // If still too big, upload as-is — server can handle it.
      }
    }

    await _uploadPhoto(bytes);
  }

  // ──────────────────────────── UPLOAD ─────────────────────────────────

  Future<void> _uploadPhoto(Uint8List imageBytes) async {
    // Ensure the quotation exists in the DB.
    String? qId = widget.quotationId;
    if (qId == null) {
      qId = await widget.onRequestSave();
      if (qId == null) {
        _showError('Please save the quotation before adding photos.');
        return;
      }
    }

    setState(() => _isUploading = true);

    try {
      final clientId =
          Provider.of<AppState>(context, listen: false).clientConfig.clientId;
      final uuid = const Uuid().v4();
      final storagePath = '$clientId/$qId/$uuid.jpg';

      // Upload binary to Supabase Storage.
      await SupabaseConfig.client.storage.from('site-photos').uploadBinary(
            storagePath,
            imageBytes,
            fileOptions: const FileOptions(
              contentType: 'image/jpeg',
              upsert: false,
            ),
          );

      // Denormalised CDN URL (avoids a round-trip on every grid render).
      final publicUrl = SupabaseConfig.client.storage
          .from('site-photos')
          .getPublicUrl(storagePath);

      // Best-effort dimensions for aspect-ratio reservation.
      int? width;
      int? height;
      try {
        final codec = await ui.instantiateImageCodec(imageBytes);
        final frame = await codec.getNextFrame();
        width = frame.image.width;
        height = frame.image.height;
        frame.image.dispose();
      } catch (_) {}

      final photo = QuotationPhoto(
        quotationId: qId,
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

      // Reload the full photo list to get server-generated fields (id, etc.).
      await _reloadPhotos(qId, clientId);

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
      debugPrint('SitePhotoPicker upload error: $e');
      _showError('Upload failed: $e');
    } finally {
      if (mounted) setState(() => _isUploading = false);
    }
  }

  // ──────────────────────────── DELETE ─────────────────────────────────

  Future<void> _deletePhoto(QuotationPhoto photo) async {
    try {
      final clientId =
          Provider.of<AppState>(context, listen: false).clientConfig.clientId;

      // Remove from Supabase Storage.
      await SupabaseConfig.client.storage
          .from('site-photos')
          .remove([photo.storagePath]);

      // Remove metadata row.
      await SupabaseConfig.client
          .from('quotation_photos')
          .delete()
          .eq('id', photo.id!)
          .eq('client_id', clientId);

      await _reloadPhotos(photo.quotationId, clientId);

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
      debugPrint('SitePhotoPicker delete error: $e');
      _showError('Delete failed: $e');
    }
  }

  // ──────────────────────────── RELOAD ─────────────────────────────────

  Future<void> _reloadPhotos(String quotationId, String clientId) async {
    setState(() => _isLoading = true);
    try {
      final response = await SupabaseConfig.client
          .from('quotation_photos')
          .select()
          .eq('quotation_id', quotationId)
          .eq('client_id', clientId)
          .order('created_at', ascending: false);

      final photos =
          (response as List).map((e) => QuotationPhoto.fromMap(e)).toList();

      if (mounted) {
        setState(() => _photos = photos);
        widget.onPhotosChanged(photos);
      }
    } catch (e) {
      debugPrint('SitePhotoPicker reload error: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // ──────────────────────────── UI HELPERS ─────────────────────────────

  void _showError(String message) {
    if (!mounted) return;
    toastification.show(
      context: context,
      title: const Text('Error'),
      description: Text(message),
      type: ToastificationType.error,
      style: ToastificationStyle.fillColored,
      autoCloseDuration: const Duration(seconds: 5),
      alignment: Alignment.bottomCenter,
    );
  }

  void _showPhotoSourceDialog() {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: const Text('Take Photo'),
              onTap: () {
                Navigator.pop(ctx);
                _pickImage(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('Choose from Gallery'),
              onTap: () {
                Navigator.pop(ctx);
                _pickImage(ImageSource.gallery);
              },
            ),
          ],
        ),
      ),
    );
  }

  void _confirmDeletePhoto(QuotationPhoto photo) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Photo'),
        content: const Text(
            'Are you sure you want to delete this photo? This action cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              _deletePhoto(photo);
            },
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

  // ──────────────────────────── BUILD ──────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // Defensive gate: if Site Photos disabled in Settings, hide entirely.
    // Parent (quotation_screen.dart) already hides this widget, but this covers
    // any other caller that might embed the picker directly.
    if (!Provider.of<AppState>(context).enableSitePhotos) {
      return const SizedBox.shrink();
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Thumbnail grid ──
            if (_photos.isNotEmpty) ...[
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  childAspectRatio: 1,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                ),
                itemCount: _photos.length,
                itemBuilder: (context, index) {
                  final photo = _photos[index];
                  return _PhotoTile(
                    photo: photo,
                    onDelete: () => _confirmDeletePhoto(photo),
                  );
                },
              ),
              const SizedBox(height: 12),
            ],

            // ── Loading indicator ──
            if (_isLoading && _photos.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
              ),

            // ── Add photo button ──
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                icon: _isUploading
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.add_a_photo),
                label: Text(_isUploading ? 'Uploading...' : 'Add Site Photo'),
                onPressed:
                    (_isUploading || !widget.enabled) ? null : _showPhotoSourceDialog,
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  side: BorderSide(color: theme.colorScheme.primary),
                ),
              ),
            ),

            // ── Photo count ──
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
    ).animate().fade(delay: 650.ms).slideX(begin: 0.1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// _PhotoTile — thumbnail with caption overlay + delete badge.
// ═══════════════════════════════════════════════════════════════════════════

class _PhotoTile extends StatelessWidget {
  final QuotationPhoto photo;
  final VoidCallback onDelete;

  const _PhotoTile({required this.photo, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        // Image with aspect-ratio reservation + loading/error states.
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
                        ? loadingProgress.cumulativeBytesLoaded /
                            loadingProgress.expectedTotalBytes!
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

        // Caption overlay.
        if (photo.caption.isNotEmpty)
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: const BoxDecoration(
                color: Colors.black54,
                borderRadius: BorderRadius.only(
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

        // Delete badge.
        Positioned(
          top: 4,
          right: 4,
          child: GestureDetector(
            onTap: onDelete,
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
  }
}
