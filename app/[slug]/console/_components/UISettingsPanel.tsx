"use client";

import { useEffect, useRef, useState } from "react";
import { Settings, Type, Maximize2, RotateCcw, X } from "lucide-react";
import { useUI, type FontSize, type ElementSize } from "@/lib/hooks/useUI";

/**
 * UISettingsPanel — a floating settings panel for the desktop console.
 *
 * Lives in the bottom-right corner of the console. A gear button toggles it.
 * Changes apply live via the useUI hook writing CSS variables onto .vc-root.
 */

const FONT_OPTIONS: Array<{ value: FontSize; label: string; desc: string }> = [
  { value: "small", label: "Small", desc: "12px" },
  { value: "medium", label: "Medium", desc: "13px" },
  { value: "large", label: "Large", desc: "14px" },
];

const ELEMENT_OPTIONS: Array<{ value: ElementSize; label: string; desc: string }> = [
  { value: "compact", label: "Compact", desc: "Tight" },
  { value: "comfortable", label: "Comfortable", desc: "Default" },
  { value: "spacious", label: "Spacious", desc: "Roomy" },
];

export function UISettingsPanel() {
  const { fontSize, elementSize, setFontSize, setElementSize, reset } = useUI();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape when open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Floating gear button — fixed to bottom-right of the viewport, above
          the toast layer. */}
      <button
        type="button"
        className="vc-ui-gear"
        onClick={() => setOpen((v) => !v)}
        title="Display settings"
        aria-label="Display settings"
      >
        <Settings size={15} />
      </button>

      {/* Panel */}
      {open && (
        <div className="vc-ui-panel" ref={panelRef}>
          <div className="vc-ui-panel-head">
            <span className="vc-ui-panel-title">Display</span>
            <button
              type="button"
              className="vc-ui-close"
              onClick={() => setOpen(false)}
              aria-label="Close display settings"
            >
              <X size={13} />
            </button>
          </div>

          {/* Font size */}
          <div className="vc-ui-group">
            <div className="vc-ui-group-label">
              <Type size={12} />
              Font Size
            </div>
            <div className="vc-ui-seg">
              {FONT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={"vc-ui-seg-btn" + (fontSize === opt.value ? " vc-ui-seg-active" : "")}
                  onClick={() => setFontSize(opt.value)}
                >
                  <span className="vc-ui-seg-label">{opt.label}</span>
                  <span className="vc-ui-seg-desc">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Element size */}
          <div className="vc-ui-group">
            <div className="vc-ui-group-label">
              <Maximize2 size={12} />
              Element Size
            </div>
            <div className="vc-ui-seg">
              {ELEMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={"vc-ui-seg-btn" + (elementSize === opt.value ? " vc-ui-seg-active" : "")}
                  onClick={() => setElementSize(opt.value)}
                >
                  <span className="vc-ui-seg-label">{opt.label}</span>
                  <span className="vc-ui-seg-desc">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Reset */}
          <div className="vc-ui-footer">
            <button type="button" className="vc-ui-reset" onClick={reset}>
              <RotateCcw size={12} />
              Reset to defaults
            </button>
          </div>
        </div>
      )}
    </>
  );
}
