"use client";

import { useCallback, useState } from "react";
import { SlidersHorizontal, ChevronUp, ChevronDown, RotateCcw } from "lucide-react";
import {
  DENSITIES,
  PAGE_SIZE_OPTIONS,
  defaultConfig,
  moveColumn,
  toggleColumn,
  type ColumnSpec,
  type Density,
  type ScreenConfig,
} from "@/lib/screen-config";

/**
 * ScreenConfigDialog — Ctrl+, (Tally's F12 "Configure").
 *
 * Column visibility, column order, row density and page size for the CURRENT
 * screen only. F12 itself is DevTools in Chrome and never reaches the page —
 * the cheatsheet says so explicitly rather than leaving users to discover a
 * dead key.
 *
 * Edits are LIVE: every change calls `onChange` immediately so the grid behind
 * the dialog updates as the user ticks boxes. A configure dialog that only
 * reveals its effect after "OK" forces a guess-check-reopen loop. Escape closes;
 * there is no cancel-and-revert, because "Reset to defaults" is the one recovery
 * anybody actually wants and undoing five ticks one at a time is not.
 */

export function ScreenConfigDialog({
  title,
  columns,
  config,
  onChange,
  onClose,
}: {
  title: string;
  columns: ColumnSpec[];
  config: ScreenConfig;
  onChange: (next: ScreenConfig) => void;
  onClose: () => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);

  const visible = new Set(config.order);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // The dialog owns the keyboard while open; the shell's global map must
      // not also see these keys.
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div className="vc-overlay" onMouseDown={onClose}>
      <div
        className="vc-config"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        tabIndex={-1}
        ref={(el) => el?.focus()}
      >
        <div className="vc-config-head">
          <SlidersHorizontal size={14} />
          <h3>Configure — {title}</h3>
          <span className="vc-kbd">Ctrl ,</span>
        </div>

        <div className="vc-config-body">
          {/* ---- Columns ---- */}
          <div className="vc-config-section">
            <div className="vc-config-section-title">Columns</div>
            <div className="vc-config-cols">
              {columns.map((col) => {
                const shown = visible.has(col.id);
                const pos = config.order.indexOf(col.id);
                return (
                  <div key={col.id} className="vc-config-col">
                    <label className="vc-config-check">
                      <input
                        type="checkbox"
                        checked={shown}
                        // A required column's checkbox is rendered and DISABLED
                        // rather than hidden — the user can see the column
                        // exists and that it is not optional, instead of
                        // wondering why it is missing from the list.
                        disabled={!!col.required}
                        onChange={() => onChange(toggleColumn(config, col.id, columns))}
                      />
                      <span>{col.label}</span>
                      {col.required && <span className="vc-config-req">always</span>}
                    </label>
                    <div className="vc-config-move">
                      <button
                        type="button"
                        className="vc-icon-btn"
                        title="Move left"
                        disabled={!shown || pos <= 0}
                        onClick={() => onChange(moveColumn(config, col.id, -1))}
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        type="button"
                        className="vc-icon-btn"
                        title="Move right"
                        disabled={!shown || pos < 0 || pos >= config.order.length - 1}
                        onClick={() => onChange(moveColumn(config, col.id, 1))}
                      >
                        <ChevronDown size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="vc-config-hint">
              Order follows the list above. {config.order.length} of {columns.length} shown.
            </div>
          </div>

          {/* ---- Density ---- */}
          <div className="vc-config-section">
            <div className="vc-config-section-title">Row density</div>
            <div className="vc-ui-seg">
              {DENSITIES.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  className={
                    "vc-ui-seg-btn" + (config.density === d.value ? " vc-ui-seg-active" : "")
                  }
                  onClick={() => onChange({ ...config, density: d.value as Density })}
                >
                  <span className="vc-ui-seg-label">{d.label}</span>
                  <span className="vc-ui-seg-desc">{d.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ---- Page size ---- */}
          <div className="vc-config-section">
            <div className="vc-config-section-title">Rows per page</div>
            <div className="vc-ui-seg">
              {PAGE_SIZE_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={"vc-ui-seg-btn" + (config.pageSize === n ? " vc-ui-seg-active" : "")}
                  onClick={() => onChange({ ...config, pageSize: n })}
                >
                  <span className="vc-ui-seg-label">{n}</span>
                </button>
              ))}
            </div>
            {/* 200 is MAX_PAGE_SIZE in console-schemas.ts — the API clamps
                anything larger, so offering more would be a lie. */}
            <div className="vc-config-hint">
              Larger pages mean fewer round trips but a slower first paint.
            </div>
          </div>
        </div>

        <div className="vc-config-foot">
          {confirmReset ? (
            <>
              <span className="vc-config-hint">Reset this screen&apos;s layout?</span>
              <button
                type="button"
                className="vc-btn vc-btn-sm vc-btn-danger"
                onClick={() => {
                  onChange(defaultConfig(columns));
                  setConfirmReset(false);
                }}
              >
                Yes, reset
              </button>
              <button
                type="button"
                className="vc-btn vc-btn-sm"
                onClick={() => setConfirmReset(false)}
              >
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              className="vc-btn vc-btn-sm"
              onClick={() => setConfirmReset(true)}
            >
              <RotateCcw size={11} /> Reset to defaults
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" className="vc-btn vc-btn-sm vc-btn-primary" onClick={onClose}>
            Done <span className="vc-kbd">Esc</span>
          </button>
        </div>
      </div>
    </div>
  );
}
