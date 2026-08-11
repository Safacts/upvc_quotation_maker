/// OFFLINE TIER (Rs.10,000 "Low") — QUOTE NUMBER ALLOCATION.
///
/// ZERO-SERVER CONTRACT
/// --------------------
/// This file must never import `supabase_flutter`, `package:http/http.dart`,
/// `connectivity_plus`, `../../supabase_config.dart`, or anything under
/// `lib/services/`. The Low tier is sold on a contractual promise of ZERO
/// network calls. A stray import here is a breach of contract, not a bug.
///
/// WHAT THIS REPLACES
/// ------------------
/// The online app calls the Postgres RPC `get_next_quote_number`, which is
/// atomic because Postgres makes it atomic (see `lib/models.dart` lines 56-68 —
/// REFERENCE ONLY, never imported from here). There is no Postgres in this
/// tier, so *this file* is the entire uniqueness guarantee up to the moment the
/// row hits SQLite.
///
/// WHY THAT MATTERS MORE THAN IT LOOKS
/// -----------------------------------
/// A quote number is not a UI label. It is printed on a PDF the customer keeps,
/// it is the reference the customer quotes back over the phone, and under
/// Indian GST practice the corresponding invoice series is filed with the
/// return. Two documents sharing a number, or a number vanishing from the
/// series, is a business/compliance incident. So this service uses BELT AND
/// BRACES:
///
///   1. An in-memory async lock (a chained `Future` queue) serialises every
///      mutation, so two rapid taps on "New Quotation" in the same frame cannot
///      read the same counter.
///   2. Every candidate number is then checked against the DATABASE via
///      [QuotationRepository.quoteNoExists] before being handed out, and the
///      service advances past anything already taken.
///   3. The `quotations.quote_no` UNIQUE index is the final arbiter. Even if
///      both layers above were wrong, the insert fails loudly with
///      [DuplicateQuoteNumberException] rather than shipping a duplicate.
///
/// The lock handles concurrency. The DB check handles the cases the lock cannot
/// see: the app killed mid-save, the phone restored from a backup, the user
/// clearing app storage (which wipes SharedPreferences but NOT the sqlite file
/// if it was restored separately), or a counter pref that was never written
/// because the disk was full.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/quotation_repository.dart';
import 'brand_config.dart';

// -----------------------------------------------------------------------------
// Typed failures
// -----------------------------------------------------------------------------

/// Thrown by [QuoteNumberService.setCounter] when the requested value would move
/// the series BACKWARDS, behind a number that already exists in the database.
///
/// WHY this is an exception and not a clamp: silently clamping hides the
/// mistake, and silently obeying guarantees duplicates — the very next
/// quotation would re-issue a number already printed on a PDF a customer holds.
/// The owner must be told, in the Settings screen, what the safe floor is.
class QuoteCounterRegressionException implements Exception {
  const QuoteCounterRegressionException({
    required this.prefix,
    required this.requested,
    required this.highestExisting,
  });

  final String prefix;

  /// The last-issued value the caller asked for.
  final int requested;

  /// The highest sequence actually present in the database for this series.
  final int highestExisting;

  @override
  String toString() =>
      'QuoteCounterRegressionException: cannot set the "$prefix" counter to '
      '$requested because quotation number $highestExisting already exists. '
      'Doing so would re-issue numbers that are already printed on documents. '
      'The lowest value accepted is $highestExisting.';
}

/// Thrown when [QuoteNumberService.maxProbeAttempts] consecutive candidate
/// numbers were all already present in the database.
///
/// In practice this is unreachable; it exists so a corrupt counter (or a
/// pathological restored backup) produces a legible error instead of an
/// infinite loop that pins the CPU and looks like a frozen app.
class QuoteNumberExhaustedException implements Exception {
  const QuoteNumberExhaustedException({
    required this.prefix,
    required this.attempts,
    required this.lastTried,
  });

  final String prefix;
  final int attempts;
  final String lastTried;

  @override
  String toString() =>
      'QuoteNumberExhaustedException: gave up after $attempts attempts trying '
      'to find a free quotation number for prefix "$prefix" (last tried '
      '"$lastTried"). The counter or the quotations table is inconsistent.';
}

// -----------------------------------------------------------------------------
// Format
// -----------------------------------------------------------------------------

/// A quote-number layout, expressed as a token template.
///
/// TOKENS (all upper-case, wrapped in braces; anything else is a literal):
///
/// | Token       | Renders                     | Example      |
/// |-------------|-----------------------------|--------------|
/// | `{PREFIX}`  | the sanitised prefix        | `SVU`        |
/// | `{SEQ}`     | the sequence, zero-padded   | `0001`       |
/// | `{FY}`      | short financial year        | `25-26`      |
/// | `{FYLONG}`  | long financial year         | `2025-2026`  |
/// | `{YYYY}`    | calendar year               | `2026`       |
/// | `{YY}`      | 2-digit calendar year       | `26`         |
/// | `{MM}`      | 2-digit month               | `03`         |
/// | `{DD}`      | 2-digit day                 | `31`         |
///
/// `{SEQ}` is mandatory — a template without it cannot produce unique numbers,
/// so [QuoteNumberFormat] falls back to [simple] if it is missing.
///
/// WHY a token template instead of an enum of three hard-coded layouts: every
/// fabricator who has been running a manual register wants their existing
/// layout preserved, and "we cannot match your book" is a real reason a trial
/// does not convert. The two presets below cover ~95% of them; the template
/// covers the rest without a code change.
///
/// FINANCIAL YEAR (`{FY}` / `{FYLONG}`) — READ THIS
/// ------------------------------------------------
/// The Indian financial year runs **1 April to 31 March**. It is computed from
/// the QUOTATION DATE, never from `DateTime.now()`, so back-dating a quotation
/// to 28-Mar puts it in the previous year's series where it belongs. Using the
/// calendar year here is the classic Indian-market bug: it silently renumbers
/// the whole series on 1 January, in the middle of a filing year.
///
/// A series that carries an FY token gets its OWN counter, so the sequence
/// restarts at the configured start number each April — which is exactly what
/// GST practice expects.
@immutable
class QuoteNumberFormat {
  const QuoteNumberFormat({
    this.template = '{PREFIX}-{SEQ}',
    this.padding = 4,
  });

  /// The token template. See the class doc for the token table.
  final String template;

  /// Minimum width of `{SEQ}`, left-padded with `0`. A sequence wider than this
  /// is NEVER truncated — `12345` with padding 4 renders `12345`. Truncating
  /// would wrap the series back onto numbers already issued.
  final int padding;

  /// `SVU-0001`. The default: short, sorts correctly, safe as a filename.
  static const QuoteNumberFormat simple = QuoteNumberFormat();

  /// `SVU/25-26/0001`. Indian GST practice — series restarts every April.
  static const QuoteNumberFormat financialYear =
      QuoteNumberFormat(template: '{PREFIX}/{FY}/{SEQ}');

  /// `SVU-2025-2026-0001`. Same as [financialYear] but unambiguous in a
  /// filename-only context, and with no `/` (which is illegal in a path).
  static const QuoteNumberFormat financialYearLong =
      QuoteNumberFormat(template: '{PREFIX}-{FYLONG}-{SEQ}');

  /// Templates [QuoteNumberService.tryParse] will try, in order, when it has to
  /// recognise a number it did not just generate (i.e. in `release`).
  static const List<QuoteNumberFormat> known = <QuoteNumberFormat>[
    simple,
    financialYear,
    financialYearLong,
  ];

  bool get usesFinancialYear =>
      template.contains('{FYLONG}') || template.contains('{FY}');

  bool get usesLongFinancialYear => template.contains('{FYLONG}');

  /// A template with no `{SEQ}` cannot be unique — degrade to [simple] rather
  /// than emit a number that collides with every other number.
  QuoteNumberFormat get _safe {
    if (template.contains('{SEQ}') && template.trim().isNotEmpty) return this;
    debugPrint(
      'QuoteNumberFormat: template "$template" has no {SEQ} token; falling '
      'back to "${simple.template}".',
    );
    return QuoteNumberFormat(template: simple.template, padding: padding);
  }

  static final RegExp _tokenRe = RegExp(r'\{[A-Z]+\}');

  /// Render a concrete number.
  String render({
    required String prefix,
    required int sequence,
    required DateTime date,
  }) {
    final t = _safe.template;
    final pad = padding < 1 ? 1 : padding;
    return t.replaceAllMapped(_tokenRe, (m) {
      switch (m[0]) {
        case '{PREFIX}':
          return prefix;
        case '{SEQ}':
          return sequence.toString().padLeft(pad, '0');
        case '{FY}':
          return QuoteNumberService.financialYearShort(date);
        case '{FYLONG}':
          return QuoteNumberService.financialYearLong(date);
        case '{YYYY}':
          return date.year.toString().padLeft(4, '0');
        case '{YY}':
          return (date.year % 100).toString().padLeft(2, '0');
        case '{MM}':
          return date.month.toString().padLeft(2, '0');
        case '{DD}':
          return date.day.toString().padLeft(2, '0');
        default:
          // Unknown token: emit it literally so the mistake is visible on the
          // PDF instead of silently producing an ambiguous series.
          return m[0]!;
      }
    });
  }

  /// Regex that matches numbers of this format for ONE fixed prefix and ONE
  /// fixed financial year, capturing the sequence as `seq`.
  ///
  /// Used by the self-healing scan: it must reject rows belonging to another
  /// prefix or another FY, otherwise clearing the app cache in April would
  /// resume last year's numbering.
  RegExp scopedMatcher({required String prefix, String? financialYear}) {
    final buffer = StringBuffer('^');
    _forEachPart(_safe.template, (literal) {
      buffer.write(RegExp.escape(literal));
    }, (token) {
      switch (token) {
        case '{PREFIX}':
          buffer.write(RegExp.escape(prefix));
        case '{SEQ}':
          buffer.write(r'(?<seq>\d{1,12})');
        case '{FY}':
        case '{FYLONG}':
          buffer.write(RegExp.escape(financialYear ?? ''));
        case '{YYYY}':
          buffer.write(r'\d{4}');
        case '{YY}':
        case '{MM}':
        case '{DD}':
          buffer.write(r'\d{2}');
        default:
          buffer.write(RegExp.escape(token));
      }
    });
    buffer.write(r'$');
    return RegExp(buffer.toString(), caseSensitive: false);
  }

  /// Regex that matches ANY number of this shape, capturing `prefix`, `seq` and
  /// (when present) `fy`. Used by [QuoteNumberService.tryParse].
  RegExp genericMatcher() {
    final buffer = StringBuffer('^');
    _forEachPart(_safe.template, (literal) {
      buffer.write(RegExp.escape(literal));
    }, (token) {
      switch (token) {
        // Capped at exactly what `sanitizePrefix` can emit. This is load
        // bearing: with an unbounded group, `JVUPVC-08082026-ERR-4213` (the
        // ONLINE app's error fallback, which may sit in a database imported
        // from a device that ran the online build) parses as prefix
        // "JVUPVC-08082026-ERR" sequence 4213 — and 4213 would then be adopted
        // as this series' counter, jumping four thousand numbers.
        case '{PREFIX}':
          buffer.write('(?<prefix>[A-Za-z0-9_-]{1,$maxPrefixLength})');
        case '{SEQ}':
          buffer.write(r'(?<seq>\d{1,12})');
        case '{FY}':
          buffer.write(r'(?<fy>\d{2}-\d{2})');
        case '{FYLONG}':
          buffer.write(r'(?<fy>\d{4}-\d{4})');
        case '{YYYY}':
          buffer.write(r'\d{4}');
        case '{YY}':
        case '{MM}':
        case '{DD}':
          buffer.write(r'\d{2}');
        default:
          buffer.write(RegExp.escape(token));
      }
    });
    buffer.write(r'$');
    return RegExp(buffer.toString(), caseSensitive: false);
  }

  /// Walks [template], handing literal runs to [onLiteral] and `{TOKEN}`s to
  /// [onToken]. Keeps the two regex builders honest about escaping.
  static void _forEachPart(
    String template,
    void Function(String literal) onLiteral,
    void Function(String token) onToken,
  ) {
    var index = 0;
    for (final m in _tokenRe.allMatches(template)) {
      if (m.start > index) onLiteral(template.substring(index, m.start));
      onToken(m[0]!);
      index = m.end;
    }
    if (index < template.length) onLiteral(template.substring(index));
  }

  /// Longest prefix [QuoteNumberService.sanitizePrefix] will emit. Mirrored
  /// here so the generic matcher stays in step with the sanitiser.
  static const int maxPrefixLength = QuoteNumberService.maxPrefixLength;

  @override
  bool operator ==(Object other) =>
      other is QuoteNumberFormat &&
      other.template == template &&
      other.padding == padding;

  @override
  int get hashCode => Object.hash(template, padding);

  @override
  String toString() => 'QuoteNumberFormat($template, pad:$padding)';
}

// -----------------------------------------------------------------------------
// Scope
// -----------------------------------------------------------------------------

/// One independent counter: a prefix, and (only for FY templates) a financial
/// year. Everything the service persists or scans is keyed by this.
///
/// Deliberately does NOT include month/day tokens. A template like
/// `{PREFIX}/{MM}/{SEQ}` still draws from the prefix's single running counter,
/// so the sequence never repeats within a month — restarting per month would
/// be a numbering scheme almost nobody asks for and a duplicate risk if the
/// month token were ever dropped from the template later.
@immutable
class QuoteNumberScope {
  const QuoteNumberScope({
    required this.prefix,
    required this.financialYear,
    required this.format,
    required this.date,
  });

  /// Already sanitised. See [QuoteNumberService.sanitizePrefix].
  final String prefix;

  /// `25-26` / `2025-2026`, or null for a continuous (non-FY) series.
  final String? financialYear;

  final QuoteNumberFormat format;

  /// The quotation date this scope was derived from. Drives the date tokens.
  final DateTime date;

  /// Stable identity of the counter.
  String get key =>
      financialYear == null ? prefix : '$prefix::$financialYear';

  /// The SharedPreferences key. See [QuoteNumberService.prefsKeyPrefix].
  String get prefsKey => '${QuoteNumberService.prefsKeyPrefix}$key';

  /// Sequence encoded in [quoteNo], or null if it does not belong to this
  /// scope. Defensive by construction: anything unparseable is simply not ours.
  int? sequenceOf(String quoteNo) {
    final trimmed = quoteNo.trim();
    if (trimmed.isEmpty) return null;
    final m = format
        .scopedMatcher(prefix: prefix, financialYear: financialYear)
        .firstMatch(trimmed);
    if (m == null) return null;
    final raw = m.namedGroup('seq');
    if (raw == null) return null;
    return int.tryParse(raw);
  }

  @override
  String toString() => 'QuoteNumberScope($key, ${format.template})';
}

/// The pieces recovered from an existing quote number by
/// [QuoteNumberService.tryParse].
@immutable
class ParsedQuoteNumber {
  const ParsedQuoteNumber({
    required this.prefix,
    required this.financialYear,
    required this.sequence,
    required this.format,
  });

  final String prefix;
  final String? financialYear;
  final int sequence;
  final QuoteNumberFormat format;

  /// Same identity [QuoteNumberScope.key] produces, so a parsed number maps
  /// straight back onto the counter that issued it.
  String get scopeKey =>
      financialYear == null ? prefix : '$prefix::$financialYear';

  @override
  String toString() =>
      'ParsedQuoteNumber($scopeKey, #$sequence, ${format.template})';
}

// -----------------------------------------------------------------------------
// Injection seams
// -----------------------------------------------------------------------------

/// "Is this number already in the quotations table?" — normally
/// [QuotationRepository.quoteNoExists].
typedef QuoteNoExistsChecker = Future<bool> Function(String quoteNo);

/// "What is the highest sequence already present for this series?" — normally a
/// paged scan of the quotations table.
typedef HighestSequenceResolver = Future<int> Function(QuoteNumberScope scope);

/// "What number did the branding wizard say to start at?" — normally
/// `BrandConfig.quoteStartNumber` read from SharedPreferences.
typedef StartNumberResolver = Future<int> Function();

// -----------------------------------------------------------------------------
// Service
// -----------------------------------------------------------------------------

/// Allocates offline quotation numbers.
///
/// PERSISTENCE
/// -----------
/// SharedPreferences, one int per series, under
/// `offline_quote_counter_v1::<SCOPE>` where `<SCOPE>` is `<PREFIX>` for a
/// continuous series and `<PREFIX>::<FY>` for a financial-year series:
///
///   offline_quote_counter_v1::SVU            -> 12
///   offline_quote_counter_v1::SVU::25-26     -> 7
///
/// The stored value is the **LAST ISSUED** sequence, not the next one. `0`
/// means nothing has been issued yet. Storing "last issued" (rather than
/// "next") means a crash between reserving and writing loses at most one
/// number, and re-deriving from the database — where the highest number found
/// IS the last issued — needs no off-by-one adjustment.
///
/// The key format is documented here on purpose: an undocumented pref key is
/// unrecoverable in a support call, and support cannot ask a fabricator in
/// Vijayawada to root his phone.
class QuoteNumberService {
  QuoteNumberService({
    QuoteNumberFormat format = QuoteNumberFormat.simple,
    QuoteNoExistsChecker? existsChecker,
    HighestSequenceResolver? highestSequenceResolver,
    StartNumberResolver? startNumberResolver,
    QuotationRepository? repository,
  })  : defaultFormat = format,
        _existsChecker = existsChecker,
        _highestSequenceResolver = highestSequenceResolver,
        _startNumberResolver = startNumberResolver,
        _repository = repository;

  /// The app-wide instance. Uses the real repository and the real
  /// SharedPreferences-backed brand config.
  ///
  /// It MUST be a singleton: the in-memory lock is only a lock because there is
  /// exactly one queue. Two instances would each serialise against themselves
  /// and happily hand out the same number.
  static final QuoteNumberService instance = QuoteNumberService();

  // TODO(dash): mirror each counter into the `quote_counters` table added in
  // offline_db.dart v2 (`OfflineDb.getQuoteCounter` / `setQuoteCounter`, keyed
  // by the SAME `<PREFIX>` / `<PREFIX>::<FY>` scope string used below). Reason:
  // on several OEM Android skins (Xiaomi/MIUI, Vivo/Funtouch, Realme) "Clear
  // app data" and aggressive storage cleaners wipe SharedPreferences while the
  // sqlite file survives — the counter then resets while the quotations it
  // numbered are still present, and the next allocation collides with numbers
  // already printed on PDFs the customer holds. Prefs stays the counter of
  // record; the table is the durable mirror read on a prefs miss. Follow-up
  // ticket — do NOT change the logic below, it is covered by 58 tests.

  /// SharedPreferences key namespace. See the class doc.
  static const String prefsKeyPrefix = 'offline_quote_counter_v1::';

  /// Give up after this many consecutive taken numbers.
  static const int maxProbeAttempts = 1000;

  /// Longest prefix accepted. Long enough for `SRIVENKATES`, short enough that
  /// `SVU-0001.pdf` stays readable in a WhatsApp file list.
  static const int maxPrefixLength = 12;

  /// Used when sanitisation leaves nothing usable.
  static const String fallbackPrefix = 'QT';

  /// Layout used when a caller does not pass one.
  final QuoteNumberFormat defaultFormat;

  final QuoteNoExistsChecker? _existsChecker;
  final HighestSequenceResolver? _highestSequenceResolver;
  final StartNumberResolver? _startNumberResolver;

  QuotationRepository? _repository;

  /// Serialises every read-modify-write. See the library doc, point 1.
  Future<void> _lock = Future<void>.value();

  /// Mirror of what is in SharedPreferences, and the ONLY store if
  /// SharedPreferences is unavailable (see [_readStored]).
  final Map<String, int> _memory = <String, int>{};

  /// True once a prefs failure has been seen; stops us hammering a broken
  /// plugin channel on every single allocation.
  bool _prefsBroken = false;

  // ---------------------------------------------------------------------------
  // Financial year — April start. The single highest-value rule in this file.
  // ---------------------------------------------------------------------------

  /// First calendar year of the Indian financial year containing [date].
  ///
  /// April..December -> this year. January..March -> LAST year.
  /// 31-03-2026 belongs to FY 2025-26; 01-04-2026 belongs to FY 2026-27.
  static int financialYearStart(DateTime date) =>
      date.month >= DateTime.april ? date.year : date.year - 1;

  /// `25-26` for any date in FY 2025-26.
  static String financialYearShort(DateTime date) {
    final start = financialYearStart(date);
    final a = (start % 100).toString().padLeft(2, '0');
    final b = ((start + 1) % 100).toString().padLeft(2, '0');
    return '$a-$b';
  }

  /// `2025-2026` for any date in FY 2025-26.
  static String financialYearLong(DateTime date) {
    final start = financialYearStart(date);
    return '$start-${start + 1}';
  }

  // ---------------------------------------------------------------------------
  // Prefix sanitisation
  // ---------------------------------------------------------------------------

  /// Normalise a user-typed prefix into something safe to embed in a quote
  /// number — which becomes a PDF FILENAME, an email attachment name and a
  /// WhatsApp document name.
  ///
  /// Rules: trim, upper-case, keep only `A-Z 0-9 - _`, turn every run of
  /// anything else into a single `-`, collapse repeated separators, drop
  /// leading/trailing separators, cap at [maxPrefixLength], and fall back to
  /// [fallbackPrefix] if nothing survives.
  ///
  /// WHY so strict: a `/` makes the PDF write to a non-existent directory, a
  /// `:` is illegal on Windows when the owner copies the file to a laptop, and
  /// a space breaks naive share intents. The prefix is typed once in a wizard
  /// and then lives in thousands of filenames — it is worth being pedantic.
  static String sanitizePrefix(String raw) {
    final upper = raw.trim().toUpperCase();
    if (upper.isEmpty) return fallbackPrefix;

    // Every run of illegal characters becomes one separator, so "J V UPVC"
    // reads as "J-V-UPVC" rather than the unreadable "JVUPVC".
    final replaced = upper.replaceAll(RegExp(r'[^A-Z0-9_-]+'), '-');

    // Collapse repeats: "A__B", "A--B", "A-_-B" all become one separator.
    final collapsed = replaced.replaceAll(RegExp(r'[-_]{2,}'), '-');

    var trimmed = collapsed.replaceAll(RegExp(r'^[-_]+|[-_]+$'), '');
    if (trimmed.length > maxPrefixLength) {
      trimmed = trimmed.substring(0, maxPrefixLength);
      // Re-strip: truncation can leave a dangling separator ("ABCDEFGHIJK-").
      trimmed = trimmed.replaceAll(RegExp(r'[-_]+$'), '');
    }

    return trimmed.isEmpty ? fallbackPrefix : trimmed;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /// The number [reserveNext] would hand out, WITHOUT consuming it.
  ///
  /// For the live preview in the quotation editor and in the branding wizard.
  /// Runs through the same lock and the same database check as [reserveNext],
  /// so the preview matches what the user will actually get — a preview that
  /// disagrees with the saved document is worse than no preview.
  Future<String> peekNext({
    required String prefix,
    DateTime? date,
    QuoteNumberFormat? format,
  }) =>
      _synchronized(() => _allocate(
            prefix: prefix,
            date: date,
            format: format,
            consume: false,
          ));

  /// Reserve and return the next free number, advancing the counter.
  ///
  /// Throws [QuoteNumberExhaustedException] only if [maxProbeAttempts]
  /// consecutive candidates are already present in the database.
  Future<String> reserveNext({
    required String prefix,
    DateTime? date,
    QuoteNumberFormat? format,
  }) =>
      _synchronized(() => _allocate(
            prefix: prefix,
            date: date,
            format: format,
            consume: true,
          ));

  /// Hand a reserved number back after a save FAILED.
  ///
  /// Only rolls back when [quoteNo] is still the highest issued number in its
  /// series. If another quotation was created in the meantime, the number is
  /// abandoned (a gap) rather than reused — reusing it would hand the same
  /// number to two documents, and an unexplained gap in the series is a
  /// footnote where a duplicate is an incident.
  ///
  /// Never throws: it runs on the failure path, where a second exception would
  /// mask the real one.
  Future<void> release(String quoteNo) => _synchronized(() async {
        try {
          final parsed = tryParse(quoteNo);
          if (parsed == null) {
            debugPrint('QuoteNumberService.release: unrecognised "$quoteNo"');
            return;
          }
          final key = parsed.scopeKey;

          // Read the STORED value only. Deliberately no self-healing derive
          // here: the failed save means the row is absent from the database, so
          // a derive would return a lower number, conclude "not the highest"
          // and silently drop the release.
          final stored = await _readStored(key);
          if (stored == null || stored != parsed.sequence) return;

          final rolledBack = math.max(0, parsed.sequence - 1);
          await _write(key, rolledBack);
          debugPrint(
            'QuoteNumberService: released $quoteNo (counter $key -> '
            '$rolledBack)',
          );
        } catch (e) {
          debugPrint('QuoteNumberService.release failed for "$quoteNo": $e');
        }
      });

  /// Last issued sequence for a series. `0` = nothing issued yet.
  ///
  /// Self-heals on first use (see [_lastIssued]), so the value returned to a
  /// Settings screen is the truth, not "0 because the cache was cleared".
  Future<int> currentCounter(
    String prefix, {
    DateTime? date,
    QuoteNumberFormat? format,
  }) =>
      _synchronized(() async {
        final scope = _scopeFor(prefix, date, format);
        return _lastIssued(scope);
      });

  /// Set the last-issued value (Settings screen, and Excel migration).
  ///
  /// Pass 347 to make the next quotation 0348.
  ///
  /// Refuses to move BACKWARDS behind the highest number already in the
  /// database, throwing [QuoteCounterRegressionException]. Negative values are
  /// clamped to 0 — "start from the beginning" is an unambiguous intent, and it
  /// is still subject to the same regression check.
  Future<void> setCounter(
    String prefix,
    int value, {
    DateTime? date,
    QuoteNumberFormat? format,
  }) =>
      _synchronized(() async {
        final scope = _scopeFor(prefix, date, format);
        final requested = value < 0 ? 0 : value;
        final highest = await _highestExisting(scope);

        if (requested < highest) {
          throw QuoteCounterRegressionException(
            prefix: scope.key,
            requested: requested,
            highestExisting: highest,
          );
        }

        await _write(scope.key, requested);
      });

  /// Forget the stored counter for a series.
  ///
  /// This does NOT restart the series at 1: the next allocation re-derives from
  /// the database and from `BrandConfig.quoteStartNumber`. That is the point —
  /// "reset" must never mean "re-issue numbers customers already have".
  Future<void> resetCounter(
    String prefix, {
    DateTime? date,
    QuoteNumberFormat? format,
  }) =>
      _synchronized(() async {
        final scope = _scopeFor(prefix, date, format);
        _memory.remove(scope.key);
        try {
          if (_prefsBroken) return;
          final prefs = await SharedPreferences.getInstance();
          await prefs.remove(scope.prefsKey);
        } catch (e) {
          debugPrint('QuoteNumberService.resetCounter: prefs failed: $e');
        }
      });

  /// Recover the prefix / financial year / sequence from an existing number.
  ///
  /// Tries [defaultFormat] first, then [QuoteNumberFormat.known]. Returns null
  /// for anything that matches none of them (including the online app's
  /// error-fallback numbers such as `JVUPVC-08082026-ERR-4213`, which must
  /// never be mistaken for a counter value).
  ParsedQuoteNumber? tryParse(String quoteNo) {
    final trimmed = quoteNo.trim();
    if (trimmed.isEmpty) return null;

    final candidates = <QuoteNumberFormat>[
      defaultFormat,
      ...QuoteNumberFormat.known,
    ];

    for (final format in candidates) {
      final m = format.genericMatcher().firstMatch(trimmed);
      if (m == null) continue;

      final seqRaw = m.namedGroup('seq');
      final seq = seqRaw == null ? null : int.tryParse(seqRaw);
      if (seq == null) continue;

      final prefixRaw = m.namedGroup('prefix');
      if (prefixRaw == null || prefixRaw.isEmpty) continue;

      String? fy;
      if (format.usesFinancialYear) {
        fy = m.namedGroup('fy');
        if (fy == null || fy.isEmpty) continue;
      }

      return ParsedQuoteNumber(
        // Upper-cased, not re-sanitised: the number was already sanitised when
        // it was issued, and re-sanitising could silently change the key.
        prefix: prefixRaw.toUpperCase(),
        financialYear: fy,
        sequence: seq,
        format: format,
      );
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Allocation
  // ---------------------------------------------------------------------------

  /// Shared body of [peekNext] and [reserveNext]. Caller holds the lock.
  Future<String> _allocate({
    required String prefix,
    required DateTime? date,
    required QuoteNumberFormat? format,
    required bool consume,
  }) async {
    final scope = _scopeFor(prefix, date, format);
    var last = await _lastIssued(scope);
    var candidate = '';

    for (var attempt = 0; attempt < maxProbeAttempts; attempt++) {
      final next = last + 1;
      candidate = scope.format.render(
        prefix: scope.prefix,
        sequence: next,
        date: scope.date,
      );

      if (!await _existsSafe(candidate)) {
        if (consume) await _write(scope.key, next);
        return candidate;
      }

      // Taken. Advance and try again. If we are consuming, persist the skip so
      // a crash here does not re-walk the same taken block next time.
      last = next;
      if (consume) await _write(scope.key, next);
    }

    throw QuoteNumberExhaustedException(
      prefix: scope.key,
      attempts: maxProbeAttempts,
      lastTried: candidate,
    );
  }

  QuoteNumberScope _scopeFor(
    String prefix,
    DateTime? date,
    QuoteNumberFormat? format,
  ) {
    final f = format ?? defaultFormat;
    final d = date ?? DateTime.now();
    return QuoteNumberScope(
      prefix: sanitizePrefix(prefix),
      financialYear: f.usesLongFinancialYear
          ? financialYearLong(d)
          : (f.usesFinancialYear ? financialYearShort(d) : null),
      format: f,
      date: d,
    );
  }

  /// Last issued sequence, self-healing on first use.
  ///
  /// SELF-HEALING (requirement 3): if no counter is stored for this series we
  /// do NOT start at zero. We take the higher of
  ///   * the highest sequence already present in the quotations table, and
  ///   * `BrandConfig.quoteStartNumber - 1`
  /// and persist that. Without this, a client who clears app storage (a routine
  /// "the phone is slow" fix at any repair shop) restarts at 0001 and re-issues
  /// numbers against quotations he has already sent — which is the exact
  /// failure this whole service exists to prevent.
  Future<int> _lastIssued(QuoteNumberScope scope) async {
    final stored = await _readStored(scope.key);
    if (stored != null) return stored;

    final highest = await _highestExisting(scope);
    final start = await _startNumber();
    final derived = math.max(highest, start - 1);

    debugPrint(
      'QuoteNumberService: no counter for "${scope.key}" — derived $derived '
      '(highest in db: $highest, brand start: $start)',
    );

    await _write(scope.key, derived);
    return derived;
  }

  // ---------------------------------------------------------------------------
  // Database seam
  // ---------------------------------------------------------------------------

  QuotationRepository get _repo => _repository ??= QuotationRepository();

  /// Never throws. A failed existence check must not block quotation creation:
  /// the in-memory counter is still monotonic and the UNIQUE index still
  /// catches a genuine duplicate at insert time.
  Future<bool> _existsSafe(String quoteNo) async {
    try {
      final checker = _existsChecker;
      if (checker != null) return await checker(quoteNo);
      return await _repo.quoteNoExists(quoteNo);
    } catch (e) {
      debugPrint('QuoteNumberService: quoteNoExists("$quoteNo") failed: $e');
      return false;
    }
  }

  /// Highest sequence in the database for [scope], or 0. Never throws.
  Future<int> _highestExisting(QuoteNumberScope scope) async {
    try {
      final resolver = _highestSequenceResolver;
      if (resolver != null) return await resolver(scope);
      return await _scanHighestSequence(scope);
    } catch (e) {
      debugPrint('QuoteNumberService: highest-sequence scan failed: $e');
      return 0;
    }
  }

  /// Paged scan of the quotations table for the highest sequence in [scope].
  ///
  /// Uses [QuotationRepository.list] with the prefix as the search term (the
  /// repository escapes LIKE metacharacters, so a prefix containing `_` is
  /// matched literally). Rows that do not match the scope's pattern — other
  /// prefixes, other financial years, hand-typed numbers, the online app's
  /// `...-ERR-1234` fallbacks — are ignored rather than parsed optimistically.
  ///
  /// Runs at most [_scanMaxPages] pages. This is a first-use-only cost: the
  /// result is immediately persisted, so a 5,000-quotation install pays ~10
  /// indexed queries once, not on every allocation.
  Future<int> _scanHighestSequence(QuoteNumberScope scope) async {
    const pageSize = 500;
    const scanMaxPages = 40; // 20,000 quotations.

    var highest = 0;
    for (var page = 0; page < scanMaxPages; page++) {
      final rows = await _repo.list(
        search: scope.prefix,
        limit: pageSize,
        offset: page * pageSize,
      );
      for (final row in rows) {
        final seq = scope.sequenceOf(row.quoteNo);
        if (seq != null && seq > highest) highest = seq;
      }
      if (rows.length < pageSize) break;
    }
    return highest;
  }

  /// `BrandConfig.quoteStartNumber` — the number the wizard says to start at.
  /// Defaults to 1 and never throws.
  Future<int> _startNumber() async {
    try {
      final resolver = _startNumberResolver;
      if (resolver != null) {
        final v = await resolver();
        return v < 1 ? 1 : v;
      }
      if (_prefsBroken) return 1;

      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(BrandConfig.prefsKey);
      if (raw == null || raw.isEmpty) return 1;

      // Decoded through BrandConfig so the fallback rules stay in one place.
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) return 1;
      final v = BrandConfig.fromJson(decoded).quoteStartNumber;
      return v < 1 ? 1 : v;
    } catch (e) {
      debugPrint('QuoteNumberService: brand start number unreadable: $e');
      return 1;
    }
  }

  // ---------------------------------------------------------------------------
  // Persistence — wrapped so a broken plugin channel cannot kill a save
  // ---------------------------------------------------------------------------

  /// Stored last-issued value, or null if this series has never been used.
  ///
  /// Requirement 7: SharedPreferences access is fully wrapped. If the plugin is
  /// unavailable (an old WebView, a locked device, a corrupt prefs XML) we fall
  /// back to the in-memory mirror, and if that is empty too we return null so
  /// the caller derives the number from the DATABASE instead of crashing
  /// quotation creation.
  Future<int?> _readStored(String key) async {
    if (_memory.containsKey(key)) return _memory[key];
    if (_prefsBroken) return null;

    try {
      final prefs = await SharedPreferences.getInstance();
      final value = prefs.getInt('$prefsKeyPrefix$key');
      if (value == null) return null;
      final safe = value < 0 ? 0 : value;
      _memory[key] = safe;
      return safe;
    } catch (e) {
      _prefsBroken = true;
      debugPrint(
        'QuoteNumberService: SharedPreferences unavailable ($e) — falling back '
        'to the database-derived counter for this session.',
      );
      return null;
    }
  }

  /// Persist the last-issued value. The in-memory mirror is updated FIRST so
  /// the number is still monotonic within this session even if the disk write
  /// fails.
  Future<void> _write(String key, int value) async {
    final safe = value < 0 ? 0 : value;
    _memory[key] = safe;
    if (_prefsBroken) return;

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt('$prefsKeyPrefix$key', safe);
    } catch (e) {
      _prefsBroken = true;
      debugPrint('QuoteNumberService: could not persist counter "$key": $e');
    }
  }

  // ---------------------------------------------------------------------------
  // The lock
  // ---------------------------------------------------------------------------

  /// Chained-future mutex.
  ///
  /// Every public mutation goes through here, so a read-modify-write of the
  /// counter can never interleave with another one. Two taps on "New
  /// Quotation" in the same frame produce two queued actions, not two readers
  /// of the same value.
  ///
  /// The action's failure is delivered to ITS caller only — `_lock` itself is
  /// always left in a completed, non-error state, otherwise one thrown
  /// exception would poison every subsequent allocation for the life of the
  /// process.
  Future<T> _synchronized<T>(Future<T> Function() action) {
    final completer = Completer<T>();
    _lock = _lock.then((_) async {
      try {
        completer.complete(await action());
      } catch (e, st) {
        completer.completeError(e, st);
      }
    });
    return completer.future;
  }
}
