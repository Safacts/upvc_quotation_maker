/// OFFLINE TIER — BRANDING STORE (single source of truth for company identity).
///
/// Owns three things and nothing else:
///   1. the persisted [BrandConfig] blob (SharedPreferences, [BrandConfig.prefsKey]),
///   2. the logo FILE on disk (import, size/format policing, deletion),
///   3. an in-memory cache of the logo bytes for the PDF generator.
///
/// ZERO NETWORK by design — this tier ships one generic APK that the client
/// brands themselves on first launch. Nothing here may ever touch Supabase,
/// http, or `lib/services/`.
///
/// WHY SHAREDPREFERENCES IS THE SOURCE OF TRUTH (and not SQLite)
/// ------------------------------------------------------------
/// The Low-tier spec asks for branding in SharedPreferences AND SQLite. Prefs is
/// authoritative and SQLite is (will be) a mirror, for a sequencing reason:
/// `main_offline.dart` awaits [load] BEFORE `runApp`, so branding must be
/// readable before the first frame and before `OfflineDb` has been opened. A
/// DB-first design would either delay launch behind a schema migration or flash
/// the setup wizard at an already-branded client.
///
/// See the `TODO(dash)` on [save] for the mirror that is still outstanding.
library;

import 'dart:io';

// Uint8List comes from foundation here — importing dart:typed_data as well is
// flagged as redundant by the analyzer.
import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/brand_config.dart';

class BrandService extends ChangeNotifier {
  BrandService._();

  /// Single instance — the PDF generator, the wizard and the settings screen
  /// must all observe the same config, and `provider` hands this out.
  static final BrandService instance = BrandService._();

  /// Hard ceiling for a stored logo.
  ///
  /// Production incident 09-08-2026: a 2048x2048 / 4.66 MB client logo pushed
  /// PDF generation from 5 ms to 3,926 ms (785x) and produced a 4.4 MB file
  /// that would not send over WhatsApp. The picker already downscales to
  /// 512x512 @ q85, so anything still above 300 KB here is pathological and is
  /// refused rather than silently accepted.
  static const int maxLogoBytes = 300 * 1024;

  /// Constraints handed to `image_picker` so the plugin downsizes the image
  /// BEFORE we ever read its bytes into memory.
  static const double logoMaxDimension = 512;
  static const int logoQuality = 85;

  static const String _logoDirName = 'branding';

  BrandConfig _config = const BrandConfig();

  /// Never null — an unbranded app is just [BrandConfig] defaults.
  BrandConfig get config => _config;

  bool _loaded = false;

  /// True once [load] has run, so a shell can avoid flashing the wizard before
  /// the stored config has been read back.
  bool get isLoaded => _loaded;

  /// The app shell gates on this: company name is the only hard requirement.
  bool get needsSetup => !config.setupComplete || !config.isUsable;

  String? _lastLogoError;

  /// Set by [importLogo] / [pickAndImportLogo] when an image is refused, so the
  /// UI can surface a reason instead of a silent no-op. Cleared on success.
  String? get lastLogoError => _lastLogoError;

  Uint8List? _logoBytes;
  String? _logoBytesPath;

  // ---------------------------------------------------------------- load/save

  /// Must never throw: this runs during app start-up, and a crash here would
  /// leave the user with an app that cannot be opened at all. Corrupt JSON is
  /// already handled by [BrandConfig.decode] (falls back to defaults, which
  /// simply re-runs the wizard).
  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(BrandConfig.prefsKey);
      if (raw != null && raw.isNotEmpty) _config = BrandConfig.decode(raw);
    } catch (e) {
      debugPrint('BrandService.load failed, using defaults: $e');
    } finally {
      _loaded = true;
      _invalidateLogoCache();
      notifyListeners();
    }
  }

  /// In-memory state is updated BEFORE the disk write so the UI reflects the
  /// user's edit even if the platform write fails; a failed write only costs a
  /// re-entry after restart, whereas a rolled-back UI looks like a lost form.
  ///
  /// Returns TRUE only when the bytes actually reached SharedPreferences.
  ///
  /// ⚠️ The return value matters for exactly one caller: the first-launch
  /// wizard. `needsSetup` is derived from the PERSISTED config, so if the wizard
  /// treated a failed write as success it would drop the user onto an unbranded
  /// dashboard and the setup would silently vanish on the next cold start. The
  /// wizard therefore refuses to call `onComplete` unless this returns true.
  ///
  /// TODO(dash): mirror brand config into SQLite once offline_db v2 lands
  /// (see memory 10-08-2026). SharedPreferences is deliberately the SOURCE OF
  /// TRUTH and must stay so: it is the only store readable before `OfflineDb`
  /// is opened, and `main_offline.dart` awaits `load()` before `runApp()` so the
  /// wizard-vs-dashboard decision happens before the first frame. The SQLite
  /// copy is wanted as a DURABILITY MIRROR (prefs is a single XML file that an
  /// "optimiser" app or a failed OS upgrade can wipe, taking the client's whole
  /// identity with it) and as a backup/restore surface. When it lands: write it
  /// AFTER the prefs write, never before, treat a DB failure as non-fatal here,
  /// and on `load()` fall back to the DB row only when the prefs key is absent.
  /// Do NOT edit `lib/offline/data/offline_db.dart` from this file's owner —
  /// that file is being migrated to schema v2 concurrently.
  Future<bool> save(BrandConfig c) async {
    _config = c;
    if (_logoBytesPath != c.logoPath) _invalidateLogoCache();
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      return await prefs.setString(BrandConfig.prefsKey, c.encode());
    } catch (e) {
      debugPrint('BrandService.save failed: $e');
      return false;
    }
  }

  Future<bool> update(BrandConfig Function(BrandConfig) mutate) =>
      save(mutate(_config));

  // -------------------------------------------------------------------- logo

  /// PNG magic bytes: 89 50 4E 47.
  static bool isPng(List<int> b) =>
      b.length >= 4 &&
      b[0] == 0x89 &&
      b[1] == 0x50 &&
      b[2] == 0x4E &&
      b[3] == 0x47;

  /// JPEG magic bytes: FF D8 FF.
  static bool isJpeg(List<int> b) =>
      b.length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF;

  /// Convenience wrapper that applies the downscale constraints in ONE place.
  /// Returns null both when the user cancels (with [lastLogoError] null) and
  /// when the image is refused (with [lastLogoError] set).
  Future<String?> pickAndImportLogo(ImageSource source) async {
    _lastLogoError = null;
    XFile? picked;
    try {
      picked = await ImagePicker().pickImage(
        source: source,
        maxWidth: logoMaxDimension,
        maxHeight: logoMaxDimension,
        imageQuality: logoQuality,
      );
    } catch (e) {
      debugPrint('BrandService.pickAndImportLogo failed: $e');
      return _failLogo('Could not open the image picker. Please try again.');
    }
    if (picked == null) return null; // user cancelled — not an error
    return importLogo(picked);
  }

  /// Copies [picked] into `<appDocuments>/branding/logo_<millis>.<ext>` and
  /// returns the new absolute path, or null (with [lastLogoError] set) if the
  /// image is refused.
  Future<String?> importLogo(XFile picked) async {
    _lastLogoError = null;
    try {
      final bytes = await picked.readAsBytes();

      // Sniff the REAL format, never the file extension. A client file named
      // `.png` that was actually JPEG broke logo rendering for months
      // (Venkateshwara, found 09-08-2026) because the PDF code only called
      // embedPng and swallowed the exception. We store the true extension so
      // the PDF side can branch on it.
      final png = isPng(bytes);
      final jpeg = isJpeg(bytes);
      if (!png && !jpeg) {
        return _failLogo(
          'That file is not a PNG or JPEG image. Please choose a different logo.',
        );
      }

      // Checked before writing rather than after: an oversized file that is
      // going to be rejected anyway should never reach the disk.
      if (bytes.length > maxLogoBytes) {
        return _failLogo('Logo too large, please choose a smaller image');
      }

      final dir = await _brandingDir();
      final file = File(
        p.join(
          dir.path,
          'logo_${DateTime.now().millisecondsSinceEpoch}.${png ? 'png' : 'jpg'}',
        ),
      );
      await file.writeAsBytes(bytes, flush: true);

      // Every previous logo goes, so the documents directory cannot grow
      // without bound across re-brands.
      await _pruneBrandingDir(dir, keep: file.path);

      _logoBytes = bytes;
      _logoBytesPath = file.path;

      // Persisted immediately: the old file is already deleted, so leaving the
      // stored path pointing at it would mean a logo that renders in the UI
      // but is missing from the PDF.
      await save(_config.copyWith(logoPath: file.path));
      return file.path;
    } catch (e) {
      debugPrint('BrandService.importLogo failed: $e');
      return _failLogo('Could not save that image. Please try another one.');
    }
  }

  /// Returns a path that actually exists on disk RIGHT NOW, or null.
  ///
  /// ⚠️ WHY THIS IS NOT JUST `config.logoPath`
  /// The stored path is absolute and points into the app documents directory,
  /// which is NOT a stable location:
  ///   * iOS regenerates the app container UUID on every reinstall and on some
  ///     OS upgrades, so `/var/mobile/Containers/Data/Application/<UUID>/...`
  ///     silently becomes a dead path while the FILE is still there under the
  ///     new UUID;
  ///   * an Android backup/restore or an app-data migration to an SD card can
  ///     move the same file to a different parent.
  /// In both cases the filename survives. So when the stored absolute path
  /// misses, we re-join the durable filename onto the CURRENT documents
  /// directory before giving up, and we repair the stored path so the next read
  /// is a straight hit.
  ///
  /// Never throws, and never creates the directory — a read must not have side
  /// effects on a device that is out of storage.
  Future<String?> resolveLogoPath() async {
    final stored = _config.logoPath.trim();
    if (stored.isEmpty) return null;

    try {
      if (await File(stored).exists()) return stored;
    } catch (e) {
      debugPrint('BrandService.resolveLogoPath stat failed: $e');
    }

    final name = _config.logoFileName;
    if (name.isEmpty) return null;

    try {
      final dir = await _brandingDir(create: false);
      final candidate = p.join(dir.path, name);
      if (candidate == stored) return null; // already tried, genuinely gone
      if (!await File(candidate).exists()) return null;

      // Repair silently. The user did not lose their logo, only the path did,
      // and prompting them to re-upload something we can see would be absurd.
      debugPrint('BrandService: logo path relocated -> $candidate');
      await save(_config.copyWith(logoPath: candidate));
      return candidate;
    } catch (e) {
      debugPrint('BrandService.resolveLogoPath relocate failed: $e');
      return null;
    }
  }

  /// Called on every PDF render, hence the cache. Returns null for "no logo"
  /// and for "the file has gone" — a deleted logo must degrade the PDF, not
  /// crash it. `OfflinePdfGenerator._resolveLogo` prints the company name in
  /// that case and warns the user; it never renders an error into the document.
  Future<Uint8List?> loadLogoBytes() async {
    final stored = _config.logoPath.trim();
    if (stored.isEmpty) return null;
    if (_logoBytesPath == stored && _logoBytes != null) return _logoBytes;
    try {
      // Goes through the resolver, not File(stored), so a container-UUID change
      // degrades to "logo still works" instead of "logo silently disappeared".
      final path = await resolveLogoPath();
      if (path == null) return null;
      final bytes = await File(path).readAsBytes();
      _logoBytes = bytes;
      _logoBytesPath = path;
      return bytes;
    } catch (e) {
      debugPrint('BrandService.loadLogoBytes failed: $e');
      return null;
    }
  }

  Future<void> clearLogo() async {
    await _deleteQuietly(_config.logoPath);
    _invalidateLogoCache();
    _lastLogoError = null;
    await save(_config.copyWith(logoPath: ''));
  }

  void clearLogoError() {
    if (_lastLogoError == null) return;
    _lastLogoError = null;
    notifyListeners();
  }

  /// "Start over" — wipes the config, the stored key and the whole logo
  /// directory, putting the app back into first-launch state.
  Future<void> resetBranding() async {
    try {
      final dir = await _brandingDir(create: false);
      if (await dir.exists()) await dir.delete(recursive: true);
    } catch (e) {
      debugPrint('BrandService.resetBranding could not remove logo dir: $e');
    }
    _invalidateLogoCache();
    _lastLogoError = null;
    _config = const BrandConfig();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(BrandConfig.prefsKey);
    } catch (e) {
      debugPrint('BrandService.resetBranding could not clear prefs: $e');
    }
    notifyListeners();
  }

  // ----------------------------------------------------------------- private

  String? _failLogo(String message) {
    _lastLogoError = message;
    notifyListeners();
    return null;
  }

  void _invalidateLogoCache() {
    _logoBytes = null;
    _logoBytesPath = null;
  }

  Future<Directory> _brandingDir({bool create = true}) async {
    final docs = await getApplicationDocumentsDirectory();
    final dir = Directory(p.join(docs.path, _logoDirName));
    if (create && !await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  Future<void> _pruneBrandingDir(Directory dir, {required String keep}) async {
    try {
      await for (final entity in dir.list()) {
        if (entity is File && entity.path != keep) {
          await _deleteQuietly(entity.path);
        }
      }
    } catch (e) {
      debugPrint('BrandService._pruneBrandingDir failed: $e');
    }
  }

  Future<void> _deleteQuietly(String path) async {
    if (path.trim().isEmpty) return;
    try {
      final file = File(path);
      if (await file.exists()) await file.delete();
    } catch (e) {
      debugPrint('BrandService could not delete $path: $e');
    }
  }
}
