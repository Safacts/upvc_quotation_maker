/// Unit tests for the offline (Rs.10,000 "Low" tier) quote numbering service.
///
/// NO SQFLITE HERE. `flutter test` runs in a plain Dart VM with no Android
/// plugin host, so `sqflite` cannot open a database and any test that reached
/// the real `QuotationRepository` would fail with MissingPluginException on a
/// clean checkout. Every test therefore drives `QuoteNumberService` through its
/// injection seams:
///
///   * `existsChecker`            -> stands in for `quoteNoExists`
///   * `highestSequenceResolver`  -> stands in for the "highest existing
///                                   number in the quotations table" scan
///   * `startNumberResolver`      -> stands in for `BrandConfig.quoteStartNumber`
///
/// SharedPreferences is isolated with `setMockInitialValues({})` in `setUp`, and
/// every test builds its OWN service instance — never `QuoteNumberService
/// .instance`, whose in-memory counter mirror is process-wide and would leak
/// state between tests.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:upvc_quotation_maker/offline/core/quote_number_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
  });

  /// A service backed by an in-memory "database" of already-used numbers.
  QuoteNumberService serviceWith({
    Set<String>? existing,
    Map<String, int>? highestByScope,
    int startNumber = 1,
    QuoteNumberFormat format = QuoteNumberFormat.simple,
  }) {
    final used = existing ?? <String>{};
    return QuoteNumberService(
      format: format,
      existsChecker: (q) async => used.contains(q),
      highestSequenceResolver: (scope) async =>
          highestByScope?[scope.key] ??
          // Default seam: derive from the fake table, honouring scope so the
          // FY tests exercise per-year isolation the way the real scan does.
          used.map((q) => scope.sequenceOf(q) ?? 0).fold<int>(0, (a, b) => a > b ? a : b),
      startNumberResolver: () async => startNumber,
    );
  }

  // ---------------------------------------------------------------------------
  group('sequence', () {
    test('increments one at a time from the brand start number', () async {
      final svc = serviceWith();

      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0001');
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0002');
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0003');
      expect(await svc.currentCounter('SVU'), 3);
    });

    test('honours BrandConfig.quoteStartNumber on very first use', () async {
      // The Excel-migration case: the owner is already at quote 347.
      final svc = serviceWith(startNumber: 348);
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0348');
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0349');
    });

    test('each prefix keeps its own independent counter', () async {
      final svc = serviceWith();
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0001');
      expect(await svc.reserveNext(prefix: 'KPR'), 'KPR-0001');
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0002');
    });

    test('twenty concurrent reservations produce twenty distinct numbers',
        () async {
      // The "two rapid taps on New Quotation" race, amplified. Without the
      // chained-future lock these all read the same counter value.
      final svc = serviceWith();
      final results = await Future.wait(
        List.generate(20, (_) => svc.reserveNext(prefix: 'SVU')),
      );
      expect(results.toSet().length, 20);
      expect(results.toSet(), contains('SVU-0001'));
      expect(results.toSet(), contains('SVU-0020'));
    });
  });

  // ---------------------------------------------------------------------------
  group('zero padding', () {
    test('pads to four digits by default', () async {
      final svc = serviceWith(startNumber: 7);
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0007');
    });

    test('never truncates a sequence wider than the padding', () async {
      // Truncating 12345 to 2345 would wrap the series back onto numbers that
      // have already been issued — the exact failure this service prevents.
      final svc = serviceWith(startNumber: 12345);
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-12345');
    });

    test('respects a custom padding width', () async {
      final svc = serviceWith(
        format: const QuoteNumberFormat(template: '{PREFIX}-{SEQ}', padding: 6),
      );
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-000001');
    });

    test('boundary 0009 -> 0010 -> 0099 -> 0100', () async {
      final svc = serviceWith(startNumber: 9);
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0009');
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0010');

      await svc.setCounter('SVU', 98);
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0099');
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0100');
    });
  });

  // ---------------------------------------------------------------------------
  // THE HIGHEST-VALUE TESTS IN THIS FILE.
  // The Indian financial year starts on 1 APRIL. Using the calendar year here
  // silently renumbers a client's entire GST series on 1 January.
  group('financial year (April start)', () {
    test('financialYearStart: 31-Mar belongs to the PREVIOUS year', () {
      expect(QuoteNumberService.financialYearStart(DateTime(2026, 3, 31)), 2025);
      expect(QuoteNumberService.financialYearStart(DateTime(2026, 1, 1)), 2025);
      expect(QuoteNumberService.financialYearStart(DateTime(2026, 2, 28)), 2025);
    });

    test('financialYearStart: 01-Apr starts the NEW year', () {
      expect(QuoteNumberService.financialYearStart(DateTime(2026, 4, 1)), 2026);
      expect(QuoteNumberService.financialYearStart(DateTime(2026, 12, 31)), 2026);
    });

    test('short and long FY labels straddle the 31-Mar/01-Apr boundary', () {
      expect(QuoteNumberService.financialYearShort(DateTime(2026, 3, 31)), '25-26');
      expect(QuoteNumberService.financialYearShort(DateTime(2026, 4, 1)), '26-27');
      expect(
          QuoteNumberService.financialYearLong(DateTime(2026, 3, 31)), '2025-2026');
      expect(
          QuoteNumberService.financialYearLong(DateTime(2026, 4, 1)), '2026-2027');
    });

    test('short FY pads single-digit years (2009-10 -> "09-10")', () {
      expect(QuoteNumberService.financialYearShort(DateTime(2009, 6, 1)), '09-10');
      // Century rollover must not render "99-0".
      expect(QuoteNumberService.financialYearShort(DateTime(1999, 6, 1)), '99-00');
    });

    test('31-Mar and 01-Apr render into DIFFERENT series', () async {
      final svc = serviceWith(format: QuoteNumberFormat.financialYear);

      final march = await svc.reserveNext(
        prefix: 'SVU',
        date: DateTime(2026, 3, 31),
      );
      final april = await svc.reserveNext(
        prefix: 'SVU',
        date: DateTime(2026, 4, 1),
      );

      expect(march, 'SVU/25-26/0001');
      expect(april, 'SVU/26-27/0001');
    });

    test('the new FY series restarts at 1 while the old one keeps counting',
        () async {
      final svc = serviceWith(format: QuoteNumberFormat.financialYear);
      final lastDay = DateTime(2026, 3, 31);
      final firstDay = DateTime(2026, 4, 1);

      expect(await svc.reserveNext(prefix: 'SVU', date: lastDay),
          'SVU/25-26/0001');
      expect(await svc.reserveNext(prefix: 'SVU', date: lastDay),
          'SVU/25-26/0002');

      // April: brand new series.
      expect(await svc.reserveNext(prefix: 'SVU', date: firstDay),
          'SVU/26-27/0001');

      // A back-dated 30-Mar quotation must continue the OLD series, not the new
      // one — this is what makes late entries file correctly.
      expect(
        await svc.reserveNext(prefix: 'SVU', date: DateTime(2026, 3, 30)),
        'SVU/25-26/0003',
      );

      expect(await svc.currentCounter('SVU', date: lastDay), 3);
      expect(await svc.currentCounter('SVU', date: firstDay), 1);
    });

    test('the long FY template uses no slash (filename safe)', () async {
      final svc = serviceWith(format: QuoteNumberFormat.financialYearLong);
      expect(
        await svc.reserveNext(prefix: 'SVU', date: DateTime(2026, 3, 31)),
        'SVU-2025-2026-0001',
      );
    });

    test('the FY scan ignores last year\'s numbers when cache is cleared',
        () async {
      // Self-healing must be scoped: after clearing app data on 05-Apr-2026,
      // resuming from FY 25-26's number 214 would be wrong.
      final svc = serviceWith(
        existing: {'SVU/25-26/0214', 'SVU/26-27/0002'},
        format: QuoteNumberFormat.financialYear,
      );
      expect(
        await svc.reserveNext(prefix: 'SVU', date: DateTime(2026, 4, 5)),
        'SVU/26-27/0003',
      );
    });
  });

  // ---------------------------------------------------------------------------
  group('prefix sanitisation', () {
    test('trims and upper-cases', () {
      expect(QuoteNumberService.sanitizePrefix('  svu  '), 'SVU');
      expect(QuoteNumberService.sanitizePrefix('Kpr'), 'KPR');
    });

    test('strips characters that are illegal in a filename', () {
      // The quote number becomes a PDF filename; "/" would write to a
      // non-existent directory and ":" is illegal on Windows.
      expect(QuoteNumberService.sanitizePrefix('SVU/UPVC'), 'SVU-UPVC');
      expect(QuoteNumberService.sanitizePrefix(r'A\B:C*D?E'), 'A-B-C-D-E');
      expect(QuoteNumberService.sanitizePrefix('J V UPVC'), 'J-V-UPVC');
    });

    test('keeps A-Z 0-9 - and _ untouched', () {
      expect(QuoteNumberService.sanitizePrefix('SVU_2-A9'), 'SVU_2-A9');
    });

    test('collapses repeated separators', () {
      expect(QuoteNumberService.sanitizePrefix('SVU///UPVC'), 'SVU-UPVC');
      expect(QuoteNumberService.sanitizePrefix('SVU---UPVC'), 'SVU-UPVC');
      expect(QuoteNumberService.sanitizePrefix('SVU__UPVC'), 'SVU-UPVC');
    });

    test('drops leading and trailing separators', () {
      expect(QuoteNumberService.sanitizePrefix('--SVU--'), 'SVU');
      expect(QuoteNumberService.sanitizePrefix('  /svu/  '), 'SVU');
    });

    test('caps the length and leaves no dangling separator', () {
      expect(
        QuoteNumberService.sanitizePrefix('SRIVENKATESWARAUPVCWINDOWS').length,
        QuoteNumberService.maxPrefixLength,
      );
      expect(QuoteNumberService.sanitizePrefix('SRIVENKATESWARAUPVCWINDOWS'),
          'SRIVENKATESW');
      // Truncation landing on a separator must not leave "ABCDEFGHIJK-".
      expect(QuoteNumberService.sanitizePrefix('ABCDEFGHIJKL-MNOP').endsWith('-'),
          isFalse);
    });

    test('falls back to QT when nothing survives', () {
      expect(QuoteNumberService.sanitizePrefix(''), 'QT');
      expect(QuoteNumberService.sanitizePrefix('   '), 'QT');
      expect(QuoteNumberService.sanitizePrefix('###'), 'QT');
      expect(QuoteNumberService.sanitizePrefix('...'), 'QT');
      expect(QuoteNumberService.sanitizePrefix('---'), 'QT');
    });

    test('a dirty prefix produces a clean, filename-safe quote number',
        () async {
      final svc = serviceWith();
      expect(await svc.reserveNext(prefix: ' svu/upvc '), 'SVU-UPVC-0001');
    });

    test('two prefixes that sanitise identically share ONE counter', () async {
      // "svu" and " SVU/ " must not each start at 1 and issue "SVU-0001" twice.
      final svc = serviceWith();
      expect(await svc.reserveNext(prefix: 'svu'), 'SVU-0001');
      expect(await svc.reserveNext(prefix: ' SVU/ '), 'SVU-0002');
    });
  });

  // ---------------------------------------------------------------------------
  group('setCounter', () {
    test('moves the series forward', () async {
      final svc = serviceWith();
      await svc.setCounter('SVU', 500);
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0501');
    });

    test('REFUSES to move behind a number already in the database', () async {
      final svc = serviceWith(highestByScope: {'SVU': 214});

      expect(
        () => svc.setCounter('SVU', 100),
        throwsA(isA<QuoteCounterRegressionException>()),
      );
    });

    test('the regression error reports the safe floor', () async {
      final svc = serviceWith(highestByScope: {'SVU': 214});
      try {
        await svc.setCounter('SVU', 10);
        fail('expected QuoteCounterRegressionException');
      } on QuoteCounterRegressionException catch (e) {
        expect(e.requested, 10);
        expect(e.highestExisting, 214);
        expect(e.toString(), contains('214'));
      }
    });

    test('a refused setCounter leaves the counter untouched', () async {
      final svc = serviceWith(highestByScope: {'SVU': 214});
      await expectLater(
        svc.setCounter('SVU', 5),
        throwsA(isA<QuoteCounterRegressionException>()),
      );
      // Still derived from the database, not from the rejected value.
      expect(await svc.currentCounter('SVU'), 214);
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0215');
    });

    test('setting exactly the highest existing number is allowed', () async {
      final svc = serviceWith(highestByScope: {'SVU': 214});
      await svc.setCounter('SVU', 214);
      expect(await svc.currentCounter('SVU'), 214);
    });

    test('a negative value is clamped to zero, not stored as negative',
        () async {
      final svc = serviceWith();
      await svc.setCounter('SVU', -5);
      expect(await svc.currentCounter('SVU'), 0);
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0001');
    });

    test('setCounter sanitises its prefix like everything else', () async {
      final svc = serviceWith();
      await svc.setCounter(' svu ', 42);
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0043');
    });
  });

  // ---------------------------------------------------------------------------
  group('peekNext', () {
    test('does NOT consume the number', () async {
      final svc = serviceWith();

      expect(await svc.peekNext(prefix: 'SVU'), 'SVU-0001');
      expect(await svc.peekNext(prefix: 'SVU'), 'SVU-0001');
      expect(await svc.peekNext(prefix: 'SVU'), 'SVU-0001');
      expect(await svc.currentCounter('SVU'), 0);

      // ...and the reservation that follows gets exactly what was previewed.
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0001');
      expect(await svc.peekNext(prefix: 'SVU'), 'SVU-0002');
    });

    test('agrees with reserveNext after a self-heal', () async {
      final svc = serviceWith(existing: {'SVU-0041'});
      final preview = await svc.peekNext(prefix: 'SVU');
      expect(preview, 'SVU-0042');
      expect(await svc.reserveNext(prefix: 'SVU'), preview);
    });

    test('peeking an FY series does not create a gap in it', () async {
      final svc = serviceWith(format: QuoteNumberFormat.financialYear);
      final d = DateTime(2026, 4, 1);
      expect(await svc.peekNext(prefix: 'SVU', date: d), 'SVU/26-27/0001');
      expect(await svc.reserveNext(prefix: 'SVU', date: d), 'SVU/26-27/0001');
    });
  });

  // ---------------------------------------------------------------------------
  group('self-healing', () {
    test('derives from the database when the counter pref is missing',
        () async {
      // The "customer cleared app data at a repair shop" case.
      final svc = serviceWith(existing: {'SVU-0001', 'SVU-0002', 'SVU-0214'});
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0215');
    });

    test('ignores rows that do not match this prefix\'s pattern', () async {
      final svc = serviceWith(existing: {
        'SVU-0007',
        'KPR-0900', // another prefix
        'JVUPVC-08082026-ERR-4213', // the online app's error fallback
        'handwritten 42', // junk
        'SVU-', // truncated
        'SVU-ABCD', // non-numeric sequence
      });
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0008');
    });

    test('the brand start number wins when the table is empty', () async {
      expect(
        await serviceWith(startNumber: 348).reserveNext(prefix: 'SVU'),
        'SVU-0348',
      );
    });

    test('the database wins when it is ahead of the wizard start number',
        () async {
      // Separate test, and a separate prefix, on purpose: SharedPreferences
      // mock values persist for the whole test, so re-using "SVU" here would
      // read the counter the previous case wrote and prove nothing.
      expect(
        await serviceWith(existing: {'KPR-0500'}, startNumber: 348)
            .reserveNext(prefix: 'KPR'),
        'KPR-0501',
      );
    });

    test('skips a number that exists in the DB but not in the counter',
        () async {
      // The restored-backup case: the persisted counter says 5, but 0006 and
      // 0007 are present in the quotations table. The candidate must walk past
      // them instead of colliding with the UNIQUE index at insert time.
      SharedPreferences.setMockInitialValues(<String, Object>{
        '${QuoteNumberService.prefsKeyPrefix}SVU': 5,
      });
      final svc = serviceWith(existing: {'SVU-0006', 'SVU-0007'});
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0008');
    });

    test('the derived counter is persisted, so it is derived only once',
        () async {
      final svc = serviceWith(existing: {'SVU-0100'});
      await svc.reserveNext(prefix: 'SVU'); // SVU-0101
      final prefs = await SharedPreferences.getInstance();
      expect(
        prefs.getInt('${QuoteNumberService.prefsKeyPrefix}SVU'),
        101,
      );
    });
  });

  // ---------------------------------------------------------------------------
  group('release', () {
    test('gives the number back when it is still the highest issued', () async {
      final svc = serviceWith();
      final n = await svc.reserveNext(prefix: 'SVU'); // SVU-0001
      expect(await svc.currentCounter('SVU'), 1);

      await svc.release(n);
      expect(await svc.currentCounter('SVU'), 0);
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0001');
    });

    test('refuses to roll back over a number a later quote took', () async {
      final svc = serviceWith();
      final first = await svc.reserveNext(prefix: 'SVU'); // SVU-0001
      await svc.reserveNext(prefix: 'SVU'); // SVU-0002

      await svc.release(first); // stale — 0002 was issued after it
      expect(await svc.currentCounter('SVU'), 2);
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0003');
    });

    test('never throws on garbage input', () async {
      final svc = serviceWith();
      await svc.release('');
      await svc.release('not a quote number');
      await svc.release('JVUPVC-08082026-ERR-4213');
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0001');
    });

    test('releases into the correct financial-year series', () async {
      final svc = serviceWith(format: QuoteNumberFormat.financialYear);
      final april = DateTime(2026, 4, 1);
      final march = DateTime(2026, 3, 31);

      await svc.reserveNext(prefix: 'SVU', date: march); // SVU/25-26/0001
      final n = await svc.reserveNext(prefix: 'SVU', date: april);
      expect(n, 'SVU/26-27/0001');

      await svc.release(n);
      expect(await svc.currentCounter('SVU', date: april), 0);
      // The previous year's counter is untouched.
      expect(await svc.currentCounter('SVU', date: march), 1);
    });
  });

  // ---------------------------------------------------------------------------
  group('format tokens', () {
    test('renders every documented token', () {
      const f = QuoteNumberFormat(
        template: '{PREFIX}/{FY}/{FYLONG}/{YYYY}/{YY}/{MM}/{DD}/{SEQ}',
        padding: 3,
      );
      expect(
        f.render(prefix: 'SVU', sequence: 9, date: DateTime(2026, 3, 31)),
        'SVU/25-26/2025-2026/2026/26/03/31/009',
      );
    });

    test('a template without {SEQ} degrades to the simple layout', () {
      const f = QuoteNumberFormat(template: '{PREFIX}-{YYYY}');
      expect(
        f.render(prefix: 'SVU', sequence: 3, date: DateTime(2026, 4, 1)),
        'SVU-0003',
      );
    });

    test('tryParse round-trips every preset', () {
      final svc = serviceWith();
      for (final fmt in QuoteNumberFormat.known) {
        final rendered =
            fmt.render(prefix: 'SVU', sequence: 42, date: DateTime(2026, 3, 31));
        final parsed = svc.tryParse(rendered);
        expect(parsed, isNotNull, reason: 'could not parse "$rendered"');
        expect(parsed!.sequence, 42, reason: rendered);
        expect(parsed.prefix, 'SVU', reason: rendered);
      }
    });

    test('tryParse rejects the online error fallback and free text', () {
      final svc = serviceWith();
      expect(svc.tryParse('JVUPVC-08082026-ERR-4213'), isNull);
      expect(svc.tryParse(''), isNull);
      expect(svc.tryParse('   '), isNull);
      expect(svc.tryParse('quotation for Ramesh'), isNull);
    });
  });

  // ---------------------------------------------------------------------------
  group('exhaustion guard', () {
    test('throws a typed exception instead of looping forever', () async {
      // Every candidate is "already taken" -> the probe must give up cleanly.
      final svc = QuoteNumberService(
        existsChecker: (_) async => true,
        highestSequenceResolver: (_) async => 0,
        startNumberResolver: () async => 1,
      );
      await expectLater(
        svc.reserveNext(prefix: 'SVU'),
        throwsA(isA<QuoteNumberExhaustedException>()),
      );
    });

    test('a thrown allocation does not poison the lock for later callers',
        () async {
      var alwaysTaken = true;
      final svc = QuoteNumberService(
        existsChecker: (_) async => alwaysTaken,
        highestSequenceResolver: (_) async => 0,
        startNumberResolver: () async => 1,
      );

      await expectLater(
        svc.reserveNext(prefix: 'SVU'),
        throwsA(isA<QuoteNumberExhaustedException>()),
      );

      alwaysTaken = false;
      // The chained-future mutex must still be usable.
      expect(await svc.reserveNext(prefix: 'KPR'), 'KPR-0001');
    });
  });

  // ---------------------------------------------------------------------------
  group('persistence', () {
    test('uses the documented key format', () async {
      final svc = serviceWith();
      await svc.reserveNext(prefix: 'SVU');
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getInt('offline_quote_counter_v1::SVU'), 1);
    });

    test('an FY series is namespaced by year in the key', () async {
      final svc = serviceWith(format: QuoteNumberFormat.financialYear);
      await svc.reserveNext(prefix: 'SVU', date: DateTime(2026, 4, 1));
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getInt('offline_quote_counter_v1::SVU::26-27'), 1);
      expect(prefs.getInt('offline_quote_counter_v1::SVU::25-26'), isNull);
    });

    test('a stored counter survives into a new service instance', () async {
      await serviceWith().reserveNext(prefix: 'SVU'); // writes 1
      // A fresh instance with an EMPTY fake table: without the pref it would
      // self-heal to 0 and re-issue SVU-0001.
      expect(await serviceWith().reserveNext(prefix: 'SVU'), 'SVU-0002');
    });

    test('resetCounter clears the pref but never re-issues used numbers',
        () async {
      final svc = serviceWith(existing: {'SVU-0001', 'SVU-0002'});
      await svc.setCounter('SVU', 50);
      await svc.resetCounter('SVU');

      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getInt('offline_quote_counter_v1::SVU'), isNull);

      // Re-derives from the database, not from 1.
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0003');
    });
  });

  // ---------------------------------------------------------------------------
  group('never throws on the happy path', () {
    test('a failing existence check still yields a number', () async {
      final svc = QuoteNumberService(
        existsChecker: (_) async => throw StateError('db unavailable'),
        highestSequenceResolver: (_) async => 0,
        startNumberResolver: () async => 1,
      );
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0001');
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0002');
    });

    test('a failing highest-number scan still yields a number', () async {
      final svc = QuoteNumberService(
        existsChecker: (_) async => false,
        highestSequenceResolver: (_) async => throw StateError('scan blew up'),
        startNumberResolver: () async => 1,
      );
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0001');
    });

    test('an unreadable brand start number falls back to 1', () async {
      final svc = QuoteNumberService(
        existsChecker: (_) async => false,
        highestSequenceResolver: (_) async => 0,
        startNumberResolver: () async => throw StateError('no brand config'),
      );
      expect(await svc.reserveNext(prefix: 'SVU'), 'SVU-0001');
    });
  });
}
