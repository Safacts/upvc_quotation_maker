"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, Check } from "lucide-react";
import {
  PERIOD_PRESETS,
  customPeriod,
  describePeriod,
  isIsoDay,
  resolvePeriod,
  toInclusiveEnd,
  type PeriodRange,
  type PeriodPresetKey,
} from "@/lib/period";

/**
 * PeriodSelector — F2, Tally's period key, kept on its original key.
 *
 * F2 is one of the few Tally shortcuts the browser does NOT reserve, so it
 * stays exactly where a Tally user's fingers expect it. `useHotkeys` is
 * configured with `allowInInput: true` for this binding: an accountant halfway
 * through typing a customer name still expects F2 to change the period, and
 * requiring them to click out of the field first would break the muscle memory
 * this whole layer exists to preserve.
 *
 * THE DIALOG SHOWS INCLUSIVE DATES. The range it emits has an EXCLUSIVE `to`
 * (see src/lib/period.ts for why that off-by-one matters). `toInclusiveEnd`
 * converts for display and `customPeriod` converts back — those two functions
 * are the only places the conversion happens.
 */

export function PeriodSelector({
  value,
  onApply,
  onClose,
}: {
  value: PeriodRange;
  onApply: (range: PeriodRange) => void;
  onClose: () => void;
}) {
  const [preset, setPreset] = useState<PeriodPresetKey>(value.preset);
  const [from, setFrom] = useState(value.from);
  // Displayed inclusively, stored exclusively.
  const [toIncl, setToIncl] = useState(toInclusiveEnd(value.to));
  const [sel, setSel] = useState(() =>
    Math.max(0, PERIOD_PRESETS.findIndex((p) => p.key === value.preset)),
  );
  const listRef = useRef<HTMLDivElement>(null);

  // The live range as the user changes things, so the footer can show exactly
  // what will be applied BEFORE they commit. A period picker that only reveals
  // its interpretation after you press Apply is how people file the wrong month.
  const pending = useMemo<PeriodRange>(() => {
    if (preset === "custom") return customPeriod(from, toIncl);
    return resolvePeriod(preset);
  }, [preset, from, toIncl]);

  const choosePreset = useCallback(
    (key: PeriodPresetKey) => {
      setPreset(key);
      if (key === "custom") return;
      const r = resolvePeriod(key);
      // Mirror the resolved dates into the custom boxes. Picking "This Month"
      // and then nudging one date is the common flow, and it should start from
      // the dates just chosen rather than from blank inputs.
      setFrom(r.from);
      setToIncl(toInclusiveEnd(r.to));
    },
    [],
  );

  const apply = useCallback(
    (range: PeriodRange) => {
      onApply(range);
      onClose();
    },
    [onApply, onClose],
  );

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-i="${sel}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Contained here rather than in the global map: while this dialog is
      // open it owns the keyboard, and the shell's bindings must not also fire.
      e.stopPropagation();

      const inField = (e.target as HTMLElement)?.tagName === "INPUT";

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        apply(pending);
        return;
      }
      if (inField) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(s + 1, PERIOD_PRESETS.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(s - 1, 0));
      } else if (e.key === " ") {
        e.preventDefault();
        choosePreset(PERIOD_PRESETS[sel].key);
      } else if (e.key.length === 1) {
        // Single-letter accelerators (M = This Month, F = This FY). A period is
        // changed dozens of times a day; two keystrokes beats four arrow presses.
        const k = e.key.toUpperCase();
        const idx = PERIOD_PRESETS.findIndex((p) => p.hint === k);
        if (idx >= 0) {
          e.preventDefault();
          setSel(idx);
          choosePreset(PERIOD_PRESETS[idx].key);
        }
      }
    },
    [sel, pending, apply, onClose, choosePreset],
  );

  const customInvalid =
    preset === "custom" && !!from && !!toIncl && (!isIsoDay(from) || !isIsoDay(toIncl));

  return (
    <div className="vc-overlay" onMouseDown={onClose}>
      <div
        className="vc-period"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        // Focusable so arrow keys work the moment the dialog opens, without the
        // user having to click anything first.
        tabIndex={-1}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        ref={(el) => el?.focus()}
      >
        <div className="vc-period-head">
          <CalendarRange size={14} />
          <h3>Change Period</h3>
          <span className="vc-kbd">F2</span>
        </div>

        <div className="vc-period-body">
          <div className="vc-period-list" ref={listRef}>
            {PERIOD_PRESETS.map((p, i) => {
              const active = preset === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  data-i={i}
                  className={
                    "vc-period-item" +
                    (active ? " vc-active" : "") +
                    (i === sel ? " vc-sel" : "")
                  }
                  onMouseEnter={() => setSel(i)}
                  onClick={() => choosePreset(p.key)}
                  onDoubleClick={() => apply(resolvePeriod(p.key))}
                >
                  {active ? <Check size={12} /> : <span style={{ width: 12 }} />}
                  <span className="vc-period-label">{p.label}</span>
                  {p.hint && <span className="vc-kbd vc-period-hint">{p.hint}</span>}
                </button>
              );
            })}
          </div>

          <div className="vc-period-custom">
            <div className="vc-period-custom-title">Custom range</div>
            <div className="vc-field">
              <label className="vc-label">From</label>
              <input
                type="date"
                className="vc-input"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPreset("custom");
                }}
              />
            </div>
            <div className="vc-field">
              <label className="vc-label">To</label>
              <input
                type="date"
                className="vc-input"
                value={toIncl}
                onChange={(e) => {
                  setToIncl(e.target.value);
                  setPreset("custom");
                }}
              />
              {/* Stating this explicitly: the API bound is exclusive, and a
                  user who sees the resulting URL should not think it is a bug. */}
              <span className="vc-period-note">Both dates are included.</span>
            </div>
          </div>
        </div>

        <div className="vc-period-foot">
          <div className="vc-period-preview">
            Showing: <b>{describePeriod(pending)}</b>
          </div>
          <div style={{ flex: 1 }} />
          <button type="button" className="vc-btn vc-btn-sm" onClick={onClose}>
            Cancel <span className="vc-kbd">Esc</span>
          </button>
          <button
            type="button"
            className="vc-btn vc-btn-sm vc-btn-primary"
            onClick={() => apply(pending)}
            disabled={customInvalid}
          >
            Apply <span className="vc-kbd">Enter</span>
          </button>
        </div>
      </div>
    </div>
  );
}
