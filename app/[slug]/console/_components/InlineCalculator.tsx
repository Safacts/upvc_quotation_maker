"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calculator, CornerDownLeft } from "lucide-react";
import {
  evaluateExpression,
  formatCalcResult,
  isCalculableField,
  setNativeInputValue,
} from "@/lib/calc";

/**
 * InlineCalculator — Ctrl+/ inside any amount field.
 *
 * ============================================================================
 *  WHY A CALCULATOR AT ALL
 * ============================================================================
 * A fabricator quoting a job constantly does small arithmetic in their head or
 * on a phone: "450 a foot plus 18 percent", "3 windows at 12,400", "quote minus
 * 5 percent for the builder". Every one of those is a moment where they look
 * AWAY from the screen and type back a rounded number. Tally's calculator pane
 * exists for exactly this reason and is one of the things users cite when they
 * refuse to move off it.
 *
 * ============================================================================
 *  IT ANCHORS TO THE FOCUSED FIELD, IT DOES NOT REPLACE IT
 * ============================================================================
 * The popover opens next to whichever numeric input has focus, seeded with that
 * field's current value, and Enter writes the RESULT back into that same field.
 * Escape leaves the field untouched. The user never loses their place in the
 * grid, which is the whole difference between this and switching to a separate
 * calculator screen.
 *
 * Writing back uses `setNativeInputValue` from calc.ts, not `el.value = x`. See
 * the long note there: React's value tracker swallows a direct assignment and
 * the number silently reverts on the next render.
 */

interface Anchor {
  el: HTMLInputElement;
  rect: { top: number; left: number; bottom: number; width: number };
}

/**
 * Examples shown when the box is empty. These double as documentation for the
 * contextual `%` rule — a user who sees `1000 + 18% = 1180` immediately
 * understands the semantics without reading anything.
 */
const EXAMPLES: Array<{ expr: string; note: string }> = [
  { expr: "1000 + 18%", note: "add GST → 1180" },
  { expr: "1000 - 10%", note: "discount → 900" },
  { expr: "1220 * 3", note: "three units" },
  { expr: "45000 / 12", note: "per-unit rate" },
];

export function InlineCalculator({
  open,
  anchor,
  onClose,
  onToast,
}: {
  open: boolean;
  anchor: Anchor | null;
  onClose: () => void;
  onToast?: (msg: string, type?: "ok" | "err" | "info") => void;
}) {
  const [expr, setExpr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Seed from the field's current value so "add 18%" is one keystroke away
  // rather than requiring the user to retype the number they can already see.
  useEffect(() => {
    if (!open) return;
    const current = (anchor?.el.value || "").trim();
    setExpr(current);
    // Focus on the next frame: the popover is not in the DOM yet in this pass.
    const id = window.requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      // Cursor at the END, not selected. A seeded "1200" that gets wiped by the
      // first keystroke would defeat the point of seeding it.
      el.setSelectionRange(el.value.length, el.value.length);
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, anchor]);

  const result = useMemo(() => evaluateExpression(expr), [expr]);

  const apply = useCallback(() => {
    if (!result.ok) {
      onToast?.(result.error, "err");
      return;
    }
    const target = anchor?.el;
    if (!target) {
      onClose();
      return;
    }
    setNativeInputValue(target, formatCalcResult(result.value));
    onClose();
    // Return focus to the field so the user carries on down the column. Doing
    // this after close means the popover is gone and cannot steal it back.
    window.requestAnimationFrame(() => {
      target.focus();
      target.setSelectionRange(target.value.length, target.value.length);
    });
  }, [result, anchor, onClose, onToast]);

  const copy = useCallback(() => {
    if (!result.ok) return;
    void navigator.clipboard
      ?.writeText(formatCalcResult(result.value))
      .then(() => onToast?.("Result copied", "ok"))
      .catch(() => onToast?.("Could not copy", "err"));
  }, [result, onToast]);

  if (!open || !anchor) return null;

  // Clamp to the viewport. A calculator that opens half off-screen on the last
  // column of a wide item grid is worse than no calculator.
  const width = 260;
  const left = Math.max(8, Math.min(anchor.rect.left, window.innerWidth - width - 12));
  const spaceBelow = window.innerHeight - anchor.rect.bottom;
  const openUp = spaceBelow < 220;
  const style: React.CSSProperties = openUp
    ? { left, bottom: window.innerHeight - anchor.rect.top + 4, width }
    : { left, top: anchor.rect.bottom + 4, width };

  return (
    <>
      {/* Click-away layer. `onMouseDown` rather than `onClick` so the field
          under the cursor does not receive focus before we close. */}
      <div className="vc-calc-scrim" onMouseDown={onClose} />
      <div className="vc-calc" style={style} onMouseDown={(e) => e.stopPropagation()}>
        <div className="vc-calc-head">
          <Calculator size={12} />
          <span>Calculator</span>
          <span className="vc-calc-target">
            {anchor.el.getAttribute("data-calc-label") ||
              anchor.el.getAttribute("data-c") ||
              "field"}
          </span>
        </div>

        <input
          ref={inputRef}
          className="vc-calc-input"
          value={expr}
          spellCheck={false}
          autoComplete="off"
          placeholder="e.g. 1000 + 18%"
          onChange={(e) => setExpr(e.target.value)}
          onKeyDown={(e) => {
            // Stop every key here from reaching the global map — otherwise
            // typing a "/" or an "n" inside the calculator fires a console
            // shortcut behind it.
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
              anchor.el.focus();
            }
          }}
        />

        <div className={"vc-calc-result" + (result.ok ? "" : " vc-calc-error")}>
          {expr.trim() === "" ? (
            <span className="vc-calc-muted">Type an expression</span>
          ) : result.ok ? (
            <>
              <span className="vc-calc-eq">=</span>
              <b>{formatCalcResult(result.value)}</b>
            </>
          ) : (
            <span>{result.error}</span>
          )}
        </div>

        {expr.trim() === "" && (
          <div className="vc-calc-examples">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.expr}
                type="button"
                className="vc-calc-example"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setExpr(ex.expr);
                  inputRef.current?.focus();
                }}
              >
                <code>{ex.expr}</code>
                <span>{ex.note}</span>
              </button>
            ))}
          </div>
        )}

        <div className="vc-calc-foot">
          <button
            type="button"
            className="vc-btn vc-btn-sm vc-btn-primary"
            onClick={apply}
            disabled={!result.ok}
          >
            <CornerDownLeft size={11} /> Insert
          </button>
          <button type="button" className="vc-btn vc-btn-sm" onClick={copy} disabled={!result.ok}>
            Copy
          </button>
          <div style={{ flex: 1 }} />
          <span className="vc-calc-hint">
            <span className="vc-kbd">Esc</span> cancel
          </span>
        </div>
      </div>
    </>
  );
}

/**
 * Owns the calculator's open/anchor state for the whole console.
 *
 * The shell renders ONE calculator and this hook decides which field it belongs
 * to at press time. Attaching a calculator to each input would mean dozens of
 * popovers mounted on a 30-line item grid, all listening for the same key.
 */
export function useInlineCalculator(onToast?: (m: string, t?: "ok" | "err" | "info") => void) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const openForActiveField = useCallback(() => {
    const el = document.activeElement;
    if (!isCalculableField(el)) {
      onToast?.("Ctrl+/ works in amount and quantity fields", "info");
      return;
    }
    const r = el.getBoundingClientRect();
    setAnchor({
      el,
      rect: { top: r.top, left: r.left, bottom: r.bottom, width: r.width },
    });
  }, [onToast]);

  const close = useCallback(() => setAnchor(null), []);

  // A scroll or resize while the popover is open would leave it floating over
  // the wrong cell. Closing is the honest response; re-anchoring mid-scroll
  // makes the popover chase the field around the screen.
  useEffect(() => {
    if (!anchor) return;
    const onMove = () => setAnchor(null);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [anchor]);

  return { anchor, open: !!anchor, openForActiveField, close };
}
