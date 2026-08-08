# Phase 1 Desktop Dashboard — QA Test Report

**Date:** 08-08-2026  
**Branch:** `feature/desktop-dashboard`  
**Commit:** `df12437` (feat: Phase 0 desktop dashboard — pricing parity, tenant auth, DB migrations)  
**Tester:** Bugsy (QA Engineer)  
**Status:** PENDING Phase 2 fixes

---

## Summary

| Area | Status | Notes |
|------|--------|-------|
| Desktop Console Rendering | PASS | All render tests pass |
| Drawer Navigation | PASS | All nav items present, client-gated items work |
| Search & Filter UI | PASS | Search field, filter popup present |
| Client Isolation (Config/Model) | PASS | Config switching, model toMap clientId inclusion all correct |
| Keyboard Shortcuts | **FAIL — GAP** | Zero keyboard shortcuts implemented |
| Summary Stats | **BUG — NOT RENDERED** | `_buildSummaryRow()` defined but never called in `build()` |

---

## Issues Found

### Issue #1: NO KEYBOARD SHORTCUTS (Phase 1 Desktop Gap)

**Severity:** HIGH (for desktop UX)  
**ID:** BUG-001  
**Area:** `lib/dashboard_screen.dart`

**Symptom:** The dashboard is a desktop-facing console but has ZERO keyboard shortcuts. A desktop user cannot:
- Press `Ctrl+N` to create a new quotation
- Press `Ctrl+F` to focus search
- Press `Ctrl+R` to refresh
- Press `Escape` to close the drawer/dialog

**Root Cause:** No `Shortcuts`/`Actions`/`Focus` widgets wrap the dashboard. The `build()` method returns a raw `Scaffold` with no keyboard event handling.

**Code evidence (dashboard_screen.dart lines 263-522):**
```dart
return Scaffold(
  appBar: ...,
  drawer: ...,
  body: Column(...),
  floatingActionButton: ...,
);
```
No ancestor `Shortcuts` or `Actions` widget anywhere.

**Fix required:** Wrap the `Scaffold` in a `Shortcuts` + `Actions` widget with `LogicalKeySet` bindings for desktop productivity shortcuts.

**Test reference:** `test/dashboard/keyboard_shortcuts_test.dart` — all TC-KB-001 through TC-KB-004 documented as expected failures.

---

### Issue #9: Summary stats row is DEFINED but NOT RENDERED

**Severity:** MEDIUM (missing feature)  
**ID:** BUG-009  
**Area:** `lib/dashboard_screen.dart` lines 204-219 vs build method

**Symptom:** The `_buildSummaryRow()` method is fully implemented (shows "This Month", "Won", "Total Value") but is NEVER CALLED in the `build()` method. The summary stats section is completely missing from the rendered UI.

**Root Cause:** `_buildSummaryRow(quotations)` is defined at line 204 but the `build()` method's Column children (lines 372-508) never include it. The method is dead code.

**Fix required:** Insert `_buildSummaryRow(_quotations)` into the Column children, likely between the search/filter row and the list.

**Test reference:** `test/dashboard/desktop_console_test.dart` — TC-SS-001 now asserts `findsNothing` to document the bug.

---

### Issue #2: Drawer hamburger icon has no tooltip for accessibility

**Severity:** LOW  
**ID:** BUG-002  
**Area:** `lib/dashboard_screen.dart`

**Symptom:** The drawer open button (hamburger) relies on `Scaffold`'s default tooltip "Open navigation menu". While present, there is no custom semantic label for screen readers.

**Status:** Cosmetic — not blocking.

---

### Issue #3: Search has no debounce — fires setState on every keystroke

**Severity:** MEDIUM (performance)  
**ID:** BUG-003  
**Area:** `lib/dashboard_screen.dart` line 420

**Symptom:** `onChanged: (value) => setState(() => _searchQuery = value)` triggers a full rebuild on every character typed.

```dart
TextField(
  onChanged: (value) => setState(() => _searchQuery = value),
);
```

**Root Cause:** No debounce or throttling on search input. For large quotation lists, this causes jank.

**Fix required:** Add a debounce timer (300ms) before updating `_searchQuery`.

---

### Issue #4: No error feedback to user on fetch failure

**Severity:** MEDIUM (UX)  
**ID:** BUG-004  
**Area:** `lib/dashboard_screen.dart` lines 79-82

**Symptom:** When `_fetchQuotations()` catches an exception, it only does `debugPrint`. The user sees a perpetual loading spinner or empty state with no explanation.

```dart
} catch (e) {
  setState(() => _isLoading = false);
  debugPrint('Fetch error: $e');
}
```

**Fix required:** Show a SnackBar or inline error message with a retry button.

---

### Issue #5: Status update has no error feedback

**Severity:** MEDIUM (UX)  
**ID:** BUG-005  
**Area:** `lib/dashboard_screen.dart` lines 106-116

**Symptom:** `_updateStatus()` silently fails if the Supabase update throws. The bottom sheet closes optimistically but the status chip reverts on next refresh.

```dart
} catch (e) {
  debugPrint('Status update error: $e');
}
```

**Fix required:** Show SnackBar on failure; revert status on failure.

---

### Issue #6: `q.id!` force-unwrap in `_updateStatus` could crash

**Severity:** HIGH (stability)  
**ID:** BUG-006  
**Area:** `lib/dashboard_screen.dart` line 111

**Symptom:** `.eq('id', q.id!)` force-unwraps a nullable `String?`. If a `QuotationData` with null `id` somehow gets into the list, this crashes the app.

**Fix required:** Guard against null id: `if (q.id == null) return;` at the top of `_updateStatus`.

---

### Issue `_fetchQuotations` uses `Provider.of(context, listen: false)` in a method called by `initState` — works but fragile

**Severity:** LOW (code quality)  
**ID:** BUG-007  
**Area:** `lib/dashboard_screen.dart` line 48

**Symptom:** The fetch method reads `AppState` from context, but is called from `initState`. This works because the provider is above the widget, but it's a pattern that can break if the widget tree changes.

**Status:** Works today, but flagged for refactoring consideration.

---

### Issue #8: Filter "Won" uses `retainWhere` which mutates the filtered list in place

**Severity:** LOW (correctness)  
**ID:** BUG-008  
**Area:** `lib/dashboard_screen.dart` line 258

**Symptom:** `filteredQuotations.retainWhere((q) => q.status == QuotationStatus.won)` mutates the list. If `filteredQuotations` is referenced elsewhere (it isn't today), this could cause subtle bugs.

**Status:** Works because the list is local to `build()`. Not blocking.

---

## Test Files Written

| File | Tests | Purpose |
|------|-------|---------|
| `test/dashboard/test_helpers.dart` | — | Shared test utilities |
| `test/dashboard/desktop_console_test.dart` | 17 | Rendering, drawer, search/filter, FAB, summary |
| `test/dashboard/keyboard_shortcuts_test.dart` | 7 | Documents shortcut gaps (expected failures) |
| `test/dashboard/client_isolation_test.dart` | 19 | Config/AppState/model layer tenant isolation |

**Total: 43 new test cases**

---

## Recommendations for Phase 2

1. **Add keyboard shortcuts** (Ctrl+N, Ctrl+F, Ctrl+R, Escape) — HIGH priority for desktop
2. **Add null guard on `q.id`** in `_updateStatus` — stability
3. **Add user-facing error feedback** for fetch/status failures — UX
4. **Add debounce to search** — performance
5. **Consider a proper state management** for loading/error/data states

---

*Report generated by Bugsy — QA Engineer, Vitharn ERP Services*
