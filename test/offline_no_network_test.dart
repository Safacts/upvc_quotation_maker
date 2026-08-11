/// STATIC IMPORT FIREWALL for the Rs.10,000 "Low" offline tier.
///
/// The Low tier is sold on a CONTRACTUAL promise that the app makes zero network
/// calls — Bugsy's blocking pre-launch test #5 (MEETING-003) is a packet capture
/// proving no packets leave the device. A packet capture is a manual, end-of-cycle
/// check; this test is the automated one that fails the build the moment somebody
/// adds a networking import to `lib/offline/**` or `lib/main_offline.dart`.
///
/// This is deliberately a STATIC SCAN rather than a runtime mock. A runtime test
/// only proves the code paths it happens to execute are clean. The whole risk here
/// is the path nobody thought to exercise — a stray `await supabase...` inside an
/// error handler that only fires in the field.
///
/// If this test fails, do NOT add the offending file to an allow-list. Remove the
/// import. The promise is the product.
library;

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Packages and paths that perform (or can perform) network I/O.
///
/// `google_fonts` is on this list for a non-obvious reason: with no font files
/// bundled under `assets/`, `GoogleFonts.*` downloads the TTF from
/// fonts.gstatic.com on first use. It looks like a pure styling call and is a
/// live HTTP request. This exact leak was caught in `lib/main_offline.dart`
/// during the initial build (10-08-2026).
const Map<String, String> _bannedImports = <String, String>{
  'package:supabase_flutter': 'Supabase client — the offline tier has no server.',
  'package:http/': 'Raw HTTP client.',
  'package:dio': 'HTTP client.',
  'package:web_socket_channel': 'WebSocket transport.',
  'package:connectivity_plus':
      'Connectivity probing implies an online code path exists.',
  'package:firebase_': 'Firebase — network backend.',
  'package:google_sign_in': 'OAuth requires the network.',
  'package:google_fonts':
      'Downloads font files at runtime when none are bundled in assets/.',
  'supabase_config.dart': 'Project Supabase bootstrap.',
  'package:upvc_quotation_maker/services/':
      'lib/services/** is the online sync layer.',
};

/// Relative-path imports that escape the offline sandbox into the online app.
/// `lib/offline/**` may only reach its own siblings; `lib/main_offline.dart` may
/// only reach into `lib/offline/**`.
bool _isForbiddenRelativeImport(String importPath, String fromFile) {
  if (!importPath.startsWith('.')) return false;

  // Any relative hop into the services directory is banned outright.
  if (importPath.contains('services/')) return true;

  // From inside lib/offline/**, a `../` that does not land back in `offline/`
  // means we are reaching into the online app (e.g. `../supabase_config.dart`,
  // `../app_state.dart`, `../models.dart`).
  if (fromFile.contains('lib\\offline\\') || fromFile.contains('lib/offline/')) {
    if (importPath.startsWith('../') && !importPath.startsWith('../../')) {
      // `../core/...`, `../data/...` etc. are siblings inside offline/ — fine.
      // `../theme.dart` or `../models.dart` are not.
      final withoutPrefix = importPath.substring(3);
      if (!withoutPrefix.contains('/')) return true;
    }
    if (importPath.startsWith('../../')) return true;
  }
  return false;
}

final RegExp _importRe = RegExp(
  '''^\\s*(?:import|export)\\s+['"]([^'"]+)['"]''',
  multiLine: true,
);

List<File> _dartFilesUnder(String path) {
  final entity = FileSystemEntity.typeSync(path);
  if (entity == FileSystemEntityType.file) return <File>[File(path)];
  if (entity != FileSystemEntityType.directory) return <File>[];
  return Directory(path)
      .listSync(recursive: true)
      .whereType<File>()
      .where((f) => f.path.endsWith('.dart'))
      .toList();
}

void main() {
  group('Offline tier zero-network guarantee', () {
    // Both the sandbox and its entrypoint must be clean. Auditing only
    // `lib/offline/**` would miss a leak in `main_offline.dart` itself, which is
    // precisely where the google_fonts leak actually occurred.
    final targets = <String>['lib/offline', 'lib/main_offline.dart'];

    test('no banned networking imports anywhere in the offline tier', () {
      final violations = <String>[];

      for (final target in targets) {
        for (final file in _dartFilesUnder(target)) {
          final source = file.readAsStringSync();
          for (final match in _importRe.allMatches(source)) {
            final uri = match.group(1)!;

            for (final entry in _bannedImports.entries) {
              if (uri.contains(entry.key)) {
                violations.add(
                  '${file.path}\n    imports "$uri"\n    -> ${entry.value}',
                );
              }
            }

            if (_isForbiddenRelativeImport(uri, file.path)) {
              violations.add(
                '${file.path}\n    imports "$uri"\n'
                '    -> reaches outside lib/offline/** into the online app.',
              );
            }
          }
        }
      }

      expect(
        violations,
        isEmpty,
        reason: 'The Rs.10,000 Low tier guarantees ZERO network calls.\n'
            'Remove these imports — do not allow-list them:\n\n'
            '${violations.join('\n\n')}\n',
      );
    });

    test('the offline sandbox actually exists and was scanned', () {
      // A regex that silently matches nothing is the classic way a guard test
      // passes forever while protecting nothing. Assert we really read files
      // and really parsed imports out of them.
      final files = _dartFilesUnder('lib/offline');
      expect(
        files.length,
        greaterThanOrEqualTo(9),
        reason: 'Expected the offline tier sources to be present.',
      );

      final totalImports = files.fold<int>(
        0,
        (sum, f) => sum + _importRe.allMatches(f.readAsStringSync()).length,
      );
      expect(
        totalImports,
        greaterThan(20),
        reason: 'Import regex parsed suspiciously few imports — the guard may '
            'be silently matching nothing.',
      );
    });

    test('main_offline.dart does not initialise Supabase', () {
      final source = File('lib/main_offline.dart').readAsStringSync();
      expect(source.contains('SupabaseConfig'), isFalse);
      expect(source.contains('Supabase.initialize'), isFalse);
    });
  });
}
