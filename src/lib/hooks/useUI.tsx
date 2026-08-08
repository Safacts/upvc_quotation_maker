"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * useUI — localStorage-backed UI preferences per console user.
 *
 * The key is scoped per client (`vc:ui:<clientId>`) so two tenants sharing
 * a browser (rare, but demo accounts are exactly that case) keep their own
 * settings. Falls back to defaults if localStorage is unavailable
 * (SSR / private mode) and never throws.
 */

export type FontSize = "small" | "medium" | "large";
export type ElementSize = "compact" | "comfortable" | "spacious";

export interface UIPreferences {
  fontSize: FontSize;
  elementSize: ElementSize;
}

export interface UISettingsValue extends UIPreferences {
  setFontSize: (size: FontSize) => void;
  setElementSize: (size: ElementSize) => void;
  reset: () => void;
  /** Apply the current preferences onto a given DOM element (the .vc-root). */
  applyTo: (el: HTMLElement) => void;
}

export const DEFAULT_UI: UIPreferences = {
  fontSize: "medium",
  elementSize: "comfortable",
};

const STORAGE_PREFIX = "vc:ui:";

const FONT_PX: Record<FontSize, number> = {
  small: 12,
  medium: 13,
  large: 14,
};

const COMPACT: Record<ElementSize, string> = {
  compact: "0.75",
  comfortable: "1",
  spacious: "1.25",
};

const SPACING_REM: Record<ElementSize, number> = {
  compact: 10,
  comfortable: 14,
  spacious: 18,
};

const INPUT_H: Record<ElementSize, number> = {
  compact: 26,
  comfortable: 28,
  spacious: 32,
};

const NAV_PAD: Record<ElementSize, string> = {
  compact: "5px 8px",
  comfortable: "7px 10px",
  spacious: "9px 13px",
};

const GRID_CELL_PAD: Record<ElementSize, string> = {
  compact: "3px 6px",
  comfortable: "5px 9px",
  spacious: "7px 11px",
};

const BTN_H: Record<ElementSize, number> = {
  compact: 26,
  comfortable: 28,
  spacious: 32,
};

const BTN_SM_H: Record<ElementSize, number> = {
  compact: 22,
  comfortable: 24,
  spacious: 28,
};

const STATUS_BAR_H: Record<ElementSize, number> = {
  compact: 30,
  comfortable: 34,
  spacious: 40,
};

const TOP_BAR_H: Record<ElementSize, number> = {
  compact: 46,
  comfortable: 52,
  spacious: 58,
};

function getStorageKey(clientId: string): string {
  return STORAGE_PREFIX + clientId;
}

function loadPrefs(clientId: string): UIPreferences {
  try {
    const raw = localStorage.getItem(getStorageKey(clientId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UIPreferences>;
      return {
        fontSize:
          parsed.fontSize && parsed.fontSize in FONT_PX
            ? parsed.fontSize
            : DEFAULT_UI.fontSize,
        elementSize:
          parsed.elementSize && parsed.elementSize in COMPACT
            ? parsed.elementSize
            : DEFAULT_UI.elementSize,
      };
    }
  } catch {
    // localStorage unavailable (SSR, private mode, quota) — use defaults.
  }
  return { ...DEFAULT_UI };
}

function savePrefs(clientId: string, prefs: UIPreferences): void {
  try {
    localStorage.setItem(getStorageKey(clientId), JSON.stringify(prefs));
  } catch {
    // Silently ignore write failures.
  }
}

/**
 * Apply UI preferences as CSS custom properties on a root element.
 * Called from ConsoleShell after mount and on every preference change.
 */
function applyVars(el: HTMLElement, prefs: UIPreferences): void {
  const fontPx = FONT_PX[prefs.fontSize];
  const scale = COMPACT[prefs.elementSize];
  const padRem = SPACING_REM[prefs.elementSize];
  const inputH = INPUT_H[prefs.elementSize];
  const navPad = NAV_PAD[prefs.elementSize];
  const cellPad = GRID_CELL_PAD[prefs.elementSize];
  const btnH = BTN_H[prefs.elementSize];
  const btnSmH = BTN_SM_H[prefs.elementSize];
  const statusH = STATUS_BAR_H[prefs.elementSize];
  const topH = TOP_BAR_H[prefs.elementSize];

  el.style.setProperty("--vc-font-size", `${fontPx}px`);
  el.style.setProperty("--vc-scale", scale);
  el.style.setProperty("--vc-pad-rem", `${padRem}px`);
  el.style.setProperty("--vc-input-h", `${inputH}px`);
  el.style.setProperty("--vc-nav-pad", navPad);
  el.style.setProperty("--vc-cell-pad", cellPad);
  el.style.setProperty("--vc-btn-h", `${btnH}px`);
  el.style.setProperty("--vc-btn-sm-h", `${btnSmH}px`);
  el.style.setProperty("--vc-statusbar-h", `${statusH}px`);
  el.style.setProperty("--vc-topbar-h", `${topH}px`);
  el.setAttribute("data-ui-active", "true");
  el.setAttribute("data-ui-font", prefs.fontSize);
  el.setAttribute("data-ui-size", prefs.elementSize);
}

const UICtx = createContext<UISettingsValue | null>(null);

export function UIProvider({
  clientId,
  children,
}: {
  clientId: string;
  children: ReactNode;
}) {
  const [prefs, setPrefs] = useState<UIPreferences>(() => DEFAULT_UI);

  // Read from localStorage after mount. Doing it in an effect (not useState
  // initializer) avoids a hydration mismatch: the server renders defaults,
  // the client reads localStorage, then re-renders with real values. Any
  // flicker is in off-screen nav, not in the user-visible content area.
  useEffect(() => {
    setPrefs(loadPrefs(clientId));
  }, [clientId]);

  const setFontSize = useCallback(
    (size: FontSize) => {
      setPrefs((prev) => {
        const next = { ...prev, fontSize: size };
        savePrefs(clientId, next);
        return next;
      });
    },
    [clientId],
  );

  const setElementSize = useCallback(
    (size: ElementSize) => {
      setPrefs((prev) => {
        const next = { ...prev, elementSize: size };
        savePrefs(clientId, next);
        return next;
      });
    },
    [clientId],
  );

  const reset = useCallback(() => {
    setPrefs({ ...DEFAULT_UI });
    savePrefs(clientId, DEFAULT_UI);
  }, [clientId]);

  const applyTo = useCallback(
    (el: HTMLElement) => {
      applyVars(el, prefs);
    },
    [prefs],
  );

  const value = useMemo<UISettingsValue>(
    () => ({ ...prefs, setFontSize, setElementSize, reset, applyTo }),
    [prefs, setFontSize, setElementSize, reset, applyTo],
  );

  return <UICtx.Provider value={value}>{children}</UICtx.Provider>;
}

export function useUI(): UISettingsValue {
  const ctx = useContext(UICtx);
  if (!ctx) throw new Error("useUI must be used inside <UIProvider>");
  return ctx;
}
