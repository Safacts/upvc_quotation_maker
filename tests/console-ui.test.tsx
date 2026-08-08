/**
 * PHASE 3 — the keyboard layer, driven with real KeyboardEvents.
 *
 * Renders the actual ConsoleShell and presses actual keys. A test that claims a
 * shortcut works must dispatch the key and assert on the resulting DOM — the
 * previous version of this file asserted `expect(true).toBe(true)` for PgUp and
 * PgDn, which passes whether or not the feature exists.
 *
 * WHAT IS AND IS NOT COVERED HERE
 * -------------------------------
 * The shell owns: the palette, the period dialog, the cheatsheet, quick-create,
 * and the DISPATCH of screen actions (Ctrl+, PgUp, PgDn, Alt+C, Ctrl+/). Those
 * are tested here. The screens' own behaviour (which columns a grid shows, how
 * the editor walks the record rail) is pure logic tested in
 * `screen-config.test.ts`, and the calculator's arithmetic in `calc.test.ts` —
 * neither needs a DOM.
 *
 * `?` is registered with allowInInput:false, so a bare-letter dispatch on
 * `window` (no focused input) reaches it exactly as a real keypress would.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mock next/navigation BEFORE importing the component under test.
// ---------------------------------------------------------------------------
const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/testclient/console",
}));

import ConsoleShell, { useConsoleAction } from "../app/[slug]/console/ConsoleShell";
import { UIProvider } from "../src/lib/hooks/useUI";
import { CONSOLE_KEYMAP, KEYMAP_GROUPS } from "../src/lib/hooks/useHotkeys";

/**
 * A stand-in screen that registers console actions, so the shell's dispatch can
 * be observed. This is how a real screen participates in the key map.
 */
function ProbeScreen({ spies }: { spies: Record<string, () => void> }) {
  useConsoleAction("config", spies.config ?? null);
  useConsoleAction("prevRecord", spies.prevRecord ?? null);
  useConsoleAction("nextRecord", spies.nextRecord ?? null);
  useConsoleAction("quickCreate", spies.quickCreate ?? null);
  useConsoleAction("save", spies.save ?? null);
  return <div data-testid="child-content">Child content</div>;
}

function renderShell(spies: Record<string, () => void> = {}) {
  render(
    <UIProvider clientId="testclient">
      <ConsoleShell slug="testclient" clientId="testclient" companyName="Test Company">
        <ProbeScreen spies={spies} />
      </ConsoleShell>
    </UIProvider>,
  );
}

/** Dispatch a keydown on window and flush React's state updates. */
function pressKey(key: string, options: KeyboardEventInit = {}) {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ctrlKey: options.ctrlKey ?? false,
        altKey: options.altKey ?? false,
        shiftKey: options.shiftKey ?? false,
        metaKey: options.metaKey ?? false,
        ...options,
      }),
    );
  });
}

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  localStorage.clear();
  sessionStorage.clear();
});

// ===========================================================================
// 1. COMMAND PALETTE (Ctrl+K / Alt+G)
// ===========================================================================
describe("Phase 3 — Command palette", () => {
  const openPalette = () => screen.queryByPlaceholderText(/go to/i);

  it("opens on Ctrl+K", async () => {
    renderShell();
    pressKey("k", { ctrlKey: true });
    await waitFor(() => expect(openPalette()).toBeTruthy());
  });

  it("opens on Alt+G (Tally muscle memory)", async () => {
    renderShell();
    pressKey("g", { altKey: true });
    await waitFor(() => expect(openPalette()).toBeTruthy());
  });

  it("treats Cmd as Ctrl so a Mac demo does not embarrass us", async () => {
    renderShell();
    pressKey("k", { metaKey: true });
    await waitFor(() => expect(openPalette()).toBeTruthy());
  });

  it("closes on Escape", async () => {
    renderShell();
    pressKey("k", { ctrlKey: true });
    await waitFor(() => expect(openPalette()).toBeTruthy());
    pressKey("Escape");
    await waitFor(() => expect(openPalette()).toBeNull());
  });

  it("filters by SUBSTRING, not fuzzy match", async () => {
    renderShell();
    pressKey("k", { ctrlKey: true });
    await waitFor(() => expect(openPalette()).toBeTruthy());
    fireEvent.change(openPalette()!, { target: { value: "quot" } });

    // Scoped to the palette list: the sidebar also renders a "Quotations" nav
    // item, and a document-wide query would pass even if filtering were broken.
    const labels = [...document.querySelectorAll(".vc-palette-list .vc-palette-item")].map(
      (el) => el.textContent || "",
    );
    expect(labels.some((l) => l.startsWith("Quotations"))).toBe(true);
    expect(labels.some((l) => l.startsWith("New Quotation"))).toBe(true);
    // "Overview" shares no substring with "quot" — fuzzy matching would let it
    // through on scattered letters.
    expect(labels.some((l) => l.startsWith("Overview"))).toBe(false);
  });

  it("says 'No matches' rather than returning confident nonsense", async () => {
    renderShell();
    pressKey("k", { ctrlKey: true });
    await waitFor(() => expect(openPalette()).toBeTruthy());
    fireEvent.change(openPalette()!, { target: { value: "zzzznothingzzzz" } });
    expect(screen.getByText(/no matches/i)).toBeTruthy();
  });

  it("navigates when an item is activated", async () => {
    renderShell();
    pressKey("k", { ctrlKey: true });
    await waitFor(() => expect(openPalette()).toBeTruthy());
    const item = document.querySelector(".vc-palette-list .vc-palette-item");
    fireEvent.mouseDown(item!);
    expect(mockPush).toHaveBeenCalled();
  });

  it("exposes the Phase 3 features as palette entries", async () => {
    // Discoverability: a shortcut nobody knows about is a shortcut nobody uses.
    renderShell();
    pressKey("k", { ctrlKey: true });
    await waitFor(() => expect(openPalette()).toBeTruthy());
    expect(screen.getByText("Change Period")).toBeTruthy();
    expect(screen.getByText("New Customer")).toBeTruthy();
    expect(screen.getByText("Calculator")).toBeTruthy();
  });

  it("closes on click-away", async () => {
    renderShell();
    pressKey("k", { ctrlKey: true });
    await waitFor(() => expect(openPalette()).toBeTruthy());
    act(() => {
      fireEvent.mouseDown(document.querySelector(".vc-overlay")!);
    });
    await waitFor(() => expect(openPalette()).toBeNull());
  });
});

// ===========================================================================
// 2. PERIOD SELECTOR (F2)
// ===========================================================================
describe("Phase 3 — Period selector (F2)", () => {
  const dialog = () => document.querySelector(".vc-period");

  it("opens on F2", async () => {
    renderShell();
    pressKey("F2");
    await waitFor(() => expect(dialog()).toBeTruthy());
  });

  it("offers FINANCIAL YEAR presets and no calendar-year option", async () => {
    // An Indian business reckons in FY. "This year" meaning 1 January on a GST
    // report is a number that could be handed to a CA.
    renderShell();
    pressKey("F2");
    await waitFor(() => expect(dialog()).toBeTruthy());
    expect(screen.getByText("This Financial Year")).toBeTruthy();
    expect(screen.getByText("Previous Financial Year")).toBeTruthy();
    expect(screen.getByText("This Month")).toBeTruthy();
    expect(screen.queryByText("This Year")).toBeNull();
  });

  it("shows a custom range with both dates described as included", async () => {
    renderShell();
    pressKey("F2");
    await waitFor(() => expect(dialog()).toBeTruthy());
    expect(screen.getByText(/custom range/i)).toBeTruthy();
    // The stored bound is exclusive; the UI must never say so.
    expect(screen.getByText(/both dates are included/i)).toBeTruthy();
  });

  it("previews the resulting period BEFORE the user commits", async () => {
    renderShell();
    pressKey("F2");
    await waitFor(() => expect(dialog()).toBeTruthy());
    expect(document.querySelector(".vc-period-preview")).toBeTruthy();
  });

  it("applies a preset and updates the topbar chip", async () => {
    renderShell();
    pressKey("F2");
    await waitFor(() => expect(dialog()).toBeTruthy());
    fireEvent.click(screen.getByText("This Month"));
    fireEvent.click(screen.getByText(/^Apply/));
    await waitFor(() => expect(dialog()).toBeNull());
    // The chip is the always-visible answer to "what am I looking at?".
    expect(document.querySelector(".vc-period-chip")?.textContent).toContain("This Month");
  });

  it("closes on Escape WITHOUT applying", async () => {
    renderShell();
    const before = document.querySelector(".vc-period-chip")?.textContent;
    pressKey("F2");
    await waitFor(() => expect(dialog()).toBeTruthy());
    fireEvent.click(screen.getByText("Today"));
    fireEvent.keyDown(dialog()!, { key: "Escape" });
    await waitFor(() => expect(dialog()).toBeNull());
    expect(document.querySelector(".vc-period-chip")?.textContent).toBe(before);
  });

  it("defaults to the current financial year", () => {
    renderShell();
    expect(document.querySelector(".vc-period-chip")?.textContent).toMatch(/FY \d{4}-\d{2}/);
  });
});

// ===========================================================================
// 3. SCREEN CONFIG (Ctrl+,)
// ===========================================================================
describe("Phase 3 — Screen config (Ctrl+,)", () => {
  it("dispatches the config action to the active screen", async () => {
    // The shell does not own the column chooser — each grid does, because the
    // columns are the grid's. The shell's job is delivering the key.
    const config = vi.fn();
    renderShell({ config });
    pressKey(",", { ctrlKey: true });
    await waitFor(() => expect(config).toHaveBeenCalledTimes(1));
  });

  it("tells the user when a screen has nothing to configure", async () => {
    // Silence would read as "the shortcut is broken".
    renderShell();
    pressKey(",", { ctrlKey: true });
    await waitFor(() =>
      expect(screen.getByText(/nothing to configure/i)).toBeTruthy(),
    );
  });
});

// ===========================================================================
// 4. PgUp / PgDn RECORD NAVIGATION
// ===========================================================================
describe("Phase 3 — PgUp / PgDn", () => {
  it("PgUp dispatches prevRecord", async () => {
    const prevRecord = vi.fn();
    renderShell({ prevRecord });
    pressKey("PageUp");
    await waitFor(() => expect(prevRecord).toHaveBeenCalledTimes(1));
  });

  it("PgDn dispatches nextRecord", async () => {
    const nextRecord = vi.fn();
    renderShell({ nextRecord });
    pressKey("PageDown");
    await waitFor(() => expect(nextRecord).toHaveBeenCalledTimes(1));
  });

  it("does nothing (and does not throw) when no screen registers them", () => {
    renderShell();
    expect(() => {
      pressKey("PageUp");
      pressKey("PageDown");
    }).not.toThrow();
  });

  it("does NOT hijack PgDn while the caret is in a text field", () => {
    // allowInInput is false for these: stealing PgDn from a focused textarea
    // would stop the user scrolling a long item description.
    const nextRecord = vi.fn();
    renderShell({ nextRecord });
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    ta.focus();
    act(() => {
      ta.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", bubbles: true }));
    });
    expect(nextRecord).not.toHaveBeenCalled();
    ta.remove();
  });
});

// ===========================================================================
// 5. Alt+C CREATE-ON-THE-FLY
// ===========================================================================
describe("Phase 3 — Alt+C create-on-the-fly", () => {
  const dialog = () => document.querySelector(".vc-quick");

  it("lets the ACTIVE SCREEN handle Alt+C when it can", async () => {
    // The editor knows whether the caret is in the customer box or the item
    // grid, so it picks the right master. The shell must not pre-empt that.
    const quickCreate = vi.fn();
    renderShell({ quickCreate });
    pressKey("c", { altKey: true });
    await waitFor(() => expect(quickCreate).toHaveBeenCalledTimes(1));
    expect(dialog()).toBeNull();
  });

  it("asks which master to create when the screen has no context", async () => {
    renderShell();
    pressKey("c", { altKey: true });
    await waitFor(() => expect(dialog()).toBeTruthy());
    expect(screen.getByText("Customer")).toBeTruthy();
    expect(screen.getByText("Product")).toBeTruthy();
  });

  it("shows the customer form once a kind is chosen", async () => {
    renderShell();
    pressKey("c", { altKey: true });
    await waitFor(() => expect(dialog()).toBeTruthy());
    fireEvent.click(screen.getByText("Customer"));
    await waitFor(() => expect(screen.getByText("New Customer")).toBeTruthy());
    expect(screen.getByPlaceholderText(/customer name/i)).toBeTruthy();
    expect(screen.getByText("GSTIN")).toBeTruthy();
  });

  it("shows the product form with rate and unit", async () => {
    renderShell();
    pressKey("c", { altKey: true });
    await waitFor(() => expect(dialog()).toBeTruthy());
    fireEvent.click(screen.getByText("Product"));
    await waitFor(() => expect(screen.getByText("New Product")).toBeTruthy());
    expect(screen.getByText("Rate")).toBeTruthy();
    expect(screen.getByText("Unit")).toBeTruthy();
  });

  it("promises that the parent quotation is NOT saved as a side effect", async () => {
    // Creating a customer must never commit a half-typed quotation.
    renderShell();
    pressKey("c", { altKey: true });
    await waitFor(() => expect(dialog()).toBeTruthy());
    fireEvent.click(screen.getByText("Customer"));
    await waitFor(() =>
      expect(screen.getByText(/your quotation is not saved/i)).toBeTruthy(),
    );
  });

  it("refuses to submit without a name", async () => {
    renderShell();
    pressKey("c", { altKey: true });
    await waitFor(() => expect(dialog()).toBeTruthy());
    fireEvent.click(screen.getByText("Customer"));
    await waitFor(() => expect(screen.getByText("New Customer")).toBeTruthy());
    fireEvent.click(screen.getByText(/^Create/));
    await waitFor(() => expect(screen.getByText(/name is required/i)).toBeTruthy());
  });

  it("closes on Escape", async () => {
    renderShell();
    pressKey("c", { altKey: true });
    await waitFor(() => expect(dialog()).toBeTruthy());
    fireEvent.keyDown(dialog()!, { key: "Escape" });
    await waitFor(() => expect(dialog()).toBeNull());
  });
});

// ===========================================================================
// 6. INLINE CALCULATOR (Ctrl+/)
// ===========================================================================
describe("Phase 3 — Inline calculator (Ctrl+/)", () => {
  const calc = () => document.querySelector(".vc-calc");

  /** A numeric field, the only place the calculator is meant to open. */
  function focusAmountField(): HTMLInputElement {
    const input = document.createElement("input");
    input.className = "vc-num";
    input.setAttribute("inputmode", "decimal");
    input.value = "1000";
    document.body.appendChild(input);
    input.focus();
    return input;
  }

  it("opens anchored to the focused amount field, seeded with its value", async () => {
    renderShell();
    focusAmountField();
    pressKey("/", { ctrlKey: true });
    await waitFor(() => expect(calc()).toBeTruthy());
    // Seeded so "add 18%" is one keystroke away, not a retype.
    expect(document.querySelector<HTMLInputElement>(".vc-calc-input")?.value).toBe("1000");
  });

  it("evaluates as the user types", async () => {
    renderShell();
    focusAmountField();
    pressKey("/", { ctrlKey: true });
    await waitFor(() => expect(calc()).toBeTruthy());
    const input = document.querySelector<HTMLInputElement>(".vc-calc-input")!;
    fireEvent.change(input, { target: { value: "1000 + 18%" } });
    await waitFor(() =>
      expect(document.querySelector(".vc-calc-result")?.textContent).toContain("1180"),
    );
  });

  it("shows an error for a half-typed expression instead of a plausible number", async () => {
    renderShell();
    focusAmountField();
    pressKey("/", { ctrlKey: true });
    await waitFor(() => expect(calc()).toBeTruthy());
    const input = document.querySelector<HTMLInputElement>(".vc-calc-input")!;
    fireEvent.change(input, { target: { value: "1200*" } });
    await waitFor(() =>
      expect(document.querySelector(".vc-calc-result.vc-calc-error")).toBeTruthy(),
    );
  });

  it("writes the result back into the field on Enter", async () => {
    const field = focusAmountField();
    renderShell();
    field.focus();
    pressKey("/", { ctrlKey: true });
    await waitFor(() => expect(calc()).toBeTruthy());
    const input = document.querySelector<HTMLInputElement>(".vc-calc-input")!;
    fireEvent.change(input, { target: { value: "1000 + 18%" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(calc()).toBeNull());
    expect(field.value).toBe("1180");
    field.remove();
  });

  it("leaves the field UNTOUCHED on Escape", async () => {
    const field = focusAmountField();
    renderShell();
    field.focus();
    pressKey("/", { ctrlKey: true });
    await waitFor(() => expect(calc()).toBeTruthy());
    const input = document.querySelector<HTMLInputElement>(".vc-calc-input")!;
    fireEvent.change(input, { target: { value: "9999" } });
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(calc()).toBeNull());
    expect(field.value).toBe("1000");
    field.remove();
  });

  it("explains itself instead of opening on a non-numeric field", async () => {
    renderShell();
    const text = document.createElement("input");
    text.setAttribute("data-calc", "off");
    document.body.appendChild(text);
    text.focus();
    pressKey("/", { ctrlKey: true });
    await waitFor(() =>
      expect(screen.getByText(/amount and quantity fields/i)).toBeTruthy(),
    );
    expect(calc()).toBeNull();
    text.remove();
  });
});

// ===========================================================================
// 7. SHORTCUT CHEATSHEET (?)
// ===========================================================================
describe("Phase 3 — Shortcut cheatsheet (?)", () => {
  const sheet = () => document.querySelector(".vc-sheet");

  it("opens on ?", async () => {
    renderShell();
    pressKey("?");
    await waitFor(() => expect(sheet()).toBeTruthy());
  });

  it("opens on Shift+/ (the same physical key)", async () => {
    renderShell();
    pressKey("/", { shiftKey: true });
    await waitFor(() => expect(sheet()).toBeTruthy());
  });

  it("groups shortcuts by task rather than listing twenty in a row", async () => {
    renderShell();
    pressKey("?");
    await waitFor(() => expect(sheet()).toBeTruthy());
    for (const group of KEYMAP_GROUPS) {
      expect(screen.getByText(group), `missing group heading: ${group}`).toBeTruthy();
    }
  });

  it("lists every Phase 3 shortcut", async () => {
    renderShell();
    pressKey("?");
    await waitFor(() => expect(sheet()).toBeTruthy());
    // Scoped to the sheet: "F2" also appears on the topbar period chip, so a
    // document-wide query would pass even with an empty cheatsheet.
    const keyBadges = [...sheet()!.querySelectorAll(".vc-kbd")].map((el) => el.textContent);
    for (const keys of ["F2", "Ctrl+,", "Ctrl+/", "Alt+C", "PgUp", "PgDn"]) {
      expect(keyBadges, `cheatsheet is missing ${keys}`).toContain(keys);
    }
  });

  it("states WHY Ctrl+A and F12 are not used", async () => {
    // Told once, a user adapts in a day. Left to discover it, they conclude the
    // product is broken.
    renderShell();
    pressKey("?");
    await waitFor(() => expect(sheet()).toBeTruthy());
    expect(screen.getByText(/why not ctrl\+a and f12/i)).toBeTruthy();
  });

  it("closes on Escape", async () => {
    renderShell();
    pressKey("?");
    await waitFor(() => expect(sheet()).toBeTruthy());
    fireEvent.keyDown(sheet()!, { key: "Escape" });
    await waitFor(() => expect(sheet()).toBeNull());
  });
});

// ===========================================================================
// 8. CROSS-CUTTING CONTRACTS
// ===========================================================================
describe("Phase 3 — keyboard model contracts", () => {
  it("EVERY cheatsheet entry is grouped — no orphans", () => {
    // The cheatsheet renders by group. An entry with an unknown group would be
    // silently invisible: documented but undiscoverable.
    for (const k of CONSOLE_KEYMAP) {
      expect(KEYMAP_GROUPS, `"${k.keys}" has an unlisted group`).toContain(k.group);
    }
  });

  it("no two cheatsheet rows claim the same key for different actions", () => {
    const byKey = new Map<string, string>();
    for (const k of CONSOLE_KEYMAP) {
      const prev = byKey.get(k.keys);
      expect(prev === undefined || prev === k.action, `${k.keys} is listed twice`).toBe(true);
      byKey.set(k.keys, k.action);
    }
  });

  it("does not bind keys the browser reserves", () => {
    // Documented in useHotkeys.ts. Listing one would be a promise we cannot
    // keep — the page never receives the keydown.
    const forbidden = ["Ctrl+A", "Ctrl+N", "Ctrl+W", "Ctrl+T", "Ctrl+Q", "F12"];
    for (const f of forbidden) {
      expect(CONSOLE_KEYMAP.some((k) => k.keys === f), `${f} must not be bound`).toBe(false);
    }
  });

  it("a bare letter typed into a field does not fire a hotkey", async () => {
    renderShell();
    pressKey("k", { ctrlKey: true });
    await waitFor(() => expect(screen.queryByPlaceholderText(/go to/i)).toBeTruthy());
    const input = screen.getByPlaceholderText(/go to/i);
    fireEvent.change(input, { target: { value: "n" } });
    expect(screen.queryByPlaceholderText(/go to/i)).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("Ctrl+S toasts when no screen can save", async () => {
    renderShell();
    pressKey("s", { ctrlKey: true });
    await waitFor(() => expect(screen.getByText(/nothing to save/i)).toBeTruthy());
  });

  it("Ctrl+S reaches a screen that CAN save", async () => {
    const save = vi.fn();
    renderShell({ save });
    pressKey("s", { ctrlKey: true });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });

  it("Escape closes the innermost overlay first", async () => {
    // The cheatsheet opened over the palette must close alone, leaving the
    // palette up — not close both, and not trigger a screen's discard prompt.
    renderShell();
    pressKey("k", { ctrlKey: true });
    await waitFor(() => expect(screen.queryByPlaceholderText(/go to/i)).toBeTruthy());
    pressKey("?");
    await waitFor(() => expect(document.querySelector(".vc-sheet")).toBeTruthy());
    pressKey("Escape");
    await waitFor(() => expect(document.querySelector(".vc-sheet")).toBeNull());
    expect(screen.queryByPlaceholderText(/go to/i)).toBeTruthy();
  });
});
