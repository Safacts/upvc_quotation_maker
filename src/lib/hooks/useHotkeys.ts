"use client";

import { useEffect, useRef } from "react";

/**
 * useHotkeys — the Tally key map layer for the desktop console.
 *
 * ============================================================================
 *  THE KEY MAP IS A CONTRACT, NOT A CONVENIENCE
 * ============================================================================
 * Tally's benchmark is 200+ vouchers/hour, and it hits that because every
 * shortcut means the same thing on every screen. The consistency IS the product.
 * KPR left Tally for our simplicity but wants Tally's speed — so a shortcut that
 * silently does nothing is worse than not having it: the user concludes our
 * product is broken.
 *
 * ---------------------------------------------------------------------------
 *  KEYS THE BROWSER OWNS AND WE CAN NEVER HAVE
 * ---------------------------------------------------------------------------
 *  Ctrl+A  select-all        — Tally's "Accept & save". CANNOT be taken. Binding
 *                              it breaks copy/paste site-wide. Remapped: Ctrl+S.
 *  Ctrl+Q  quits the browser on some platforms. Remapped: Esc.
 *  Ctrl+W  closes the tab. Never bind.
 *  Ctrl+T  new tab. Never bind.
 *  Ctrl+N  NEW WINDOW — Chrome/Edge/Firefox intercept it at the OS level before
 *          the page ever sees a keydown. preventDefault() cannot stop it. The
 *          brief asked for Ctrl+N as "new quotation"; it is NOT implementable.
 *          Bound as Alt+N (and Alt+C, Tally's own create key) instead.
 *  F12     DevTools. Not deliverable to the page in Chrome. Remapped: Ctrl+,
 *  Ctrl+Shift+* mostly reserved (inspector, incognito, history).
 *
 * Every remap below preserves Tally's SEMANTICS while using a key the browser
 * will actually hand us. This list is what Bugsy tests in Chrome + Edge before
 * any demo.
 *
 * ---------------------------------------------------------------------------
 *  WHY THE HANDLER IS HELD IN A REF
 * ---------------------------------------------------------------------------
 * The handler closes over component state (the current quotation, dirty flag,
 * focused row). If it were a direct dependency of useEffect, every keystroke
 * that changes state would tear down and re-add the window listener — and any
 * key pressed during that window is dropped. Worse, if a caller forgets to
 * memoise their handler, the listener churns on every single render. The ref
 * keeps ONE listener alive for the component's lifetime while always invoking
 * the freshest closure.
 */

export type HotkeyHandler = (event: KeyboardEvent) => void;

export interface HotkeyBinding {
  /** `event.key`, case-insensitive. e.g. "s", "Escape", "F2", "ArrowDown". */
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  /**
   * Fire even when focus is inside an input/textarea/select.
   *
   * Default FALSE, and that default is load-bearing: a fabricator typing a
   * customer's name must be able to type "i" without Alt+I-style bindings
   * hijacking it. Save (Ctrl+S), quit (Esc) and navigation must be true —
   * requiring the user to click out of a field before saving would defeat the
   * entire keyboard-first premise.
   */
  allowInInput?: boolean;
  handler: HotkeyHandler;
  /** Human-readable, shown in the status bar and the ? cheatsheet. */
  description?: string;
}

/** True when focus is in a field where a bare letter is literal text. */
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  // contentEditable regions behave like inputs for typing purposes.
  return el.isContentEditable === true;
}

/**
 * Bind a set of hotkeys for as long as the component is mounted.
 *
 * @param bindings Evaluated in order; the FIRST match wins and stops. Order
 *                 matters for overlapping definitions (e.g. a screen-specific
 *                 Escape shadowing a global one).
 * @param enabled  Set false to suspend the whole set — used while a modal owns
 *                 the keyboard, so the palette's Escape does not also trigger
 *                 the editor's "discard changes" prompt underneath it.
 */
export function useHotkeys(bindings: HotkeyBinding[], enabled = true): void {
  const ref = useRef<HotkeyBinding[]>(bindings);
  ref.current = bindings;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!enabledRef.current) return;
      // IME composition: a keystroke that is part of composing a character must
      // never be read as a command.
      if (event.isComposing) return;

      const key = (event.key || "").toLowerCase();
      // Ctrl and Meta are treated as the same modifier so the console works on
      // a Mac without a second key map. Vitharn's clients are on Windows, but a
      // ⌘S that does nothing on a demo laptop is an avoidable embarrassment.
      const ctrl = event.ctrlKey || event.metaKey;
      const inEditable = isEditableTarget(event.target);

      for (const b of ref.current) {
        if ((b.key || "").toLowerCase() !== key) continue;
        if (!!b.ctrl !== ctrl) continue;
        if (!!b.alt !== event.altKey) continue;
        // Shift is only compared when the binding names it, so Shift+Tab and
        // capital letters still reach bindings that do not care about it.
        if (b.shift !== undefined && b.shift !== event.shiftKey) continue;
        if (inEditable && !b.allowInInput) continue;

        // preventDefault BEFORE the handler: if the handler throws, we must not
        // also have let the browser run its own action (Ctrl+S = Save Page As).
        event.preventDefault();
        event.stopPropagation();
        b.handler(event);
        return;
      }
    }

    // Capture phase. A bubble-phase listener never sees keys that a focused
    // input or a stopPropagation() inside a child component swallows first.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}

/**
 * Warn before a browser navigation/refresh discards unsaved edits.
 *
 * Deliberately NOT a substitute for the in-app Esc dirty-check: this only covers
 * tab close, reload and back — the browser gives us a generic dialog and no
 * chance to offer "Save". The in-app prompt is the good path; this is the net
 * under it.
 */
export function useUnsavedChangesWarning(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      // Modern browsers ignore any custom string and show their own text; both
      // preventDefault() and returnValue are required for cross-browser support.
      e.preventDefault();
      e.returnValue = "";
      return "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);
}

/**
 * The canonical key map, in one place, so the status bar, the ? cheatsheet and
 * the actual bindings cannot drift apart. A cheatsheet that lists a shortcut
 * nobody implemented is exactly the "product feels broken" failure we are
 * trying to avoid.
 */
export const CONSOLE_KEYMAP: Array<{
  keys: string;
  action: string;
  tally?: string;
  note?: string;
}> = [
  { keys: "Ctrl+K", action: "Go To / command palette", tally: "Alt+G" },
  { keys: "Alt+G", action: "Go To (Tally muscle memory)", tally: "Alt+G" },
  { keys: "Ctrl+S", action: "Save", tally: "Ctrl+A", note: "Ctrl+A is browser select-all" },
  { keys: "Ctrl+Enter", action: "Save (alternate)", tally: "Ctrl+A" },
  { keys: "Esc", action: "Back / close (asks if unsaved)", tally: "Ctrl+Q" },
  { keys: "Alt+N", action: "New quotation", tally: "Alt+C", note: "Ctrl+N is browser new-window" },
  { keys: "Alt+C", action: "Create master on the fly", tally: "Alt+C" },
  { keys: "Alt+I", action: "Insert line item row", tally: "Alt+I" },
  { keys: "Alt+X", action: "Delete focused row", tally: "Alt+X" },
  { keys: "Alt+D", action: "Duplicate as new draft", tally: "Alt+2" },
  { keys: "Enter", action: "Drill down / open row", tally: "Enter" },
  { keys: "↑ / ↓", action: "Move row focus", tally: "↑ / ↓" },
  { keys: "Ctrl+F", action: "Focus search" },
  { keys: "Ctrl+E", action: "Export current grid to CSV", tally: "Ctrl+E" },
  { keys: "Ctrl+P", action: "Print", tally: "Ctrl+P" },
  { keys: "F2", action: "Period selector", tally: "F2" },
  { keys: "Ctrl+,", action: "Screen config", tally: "F12", note: "F12 is DevTools" },
  { keys: "PgUp / PgDn", action: "Previous / next page", tally: "PgUp / PgDn" },
  { keys: "?", action: "This cheatsheet" },
];
