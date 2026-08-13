/** Console UI rendering and interaction tests. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";
import { createColumnHelper } from "@tanstack/react-table";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/testclient/console",
}));
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ customer: { id: "c1" } }) }));

import ConsoleShell, { useConsoleAction } from "../app/[slug]/console/ConsoleShell";
import { UIProvider } from "../src/lib/hooks/useUI";
import { DataGrid } from "../app/[slug]/console/_components/DataGrid";
import { LivePreview } from "../app/[slug]/console/_components/LivePreview";
import { CONSOLE_KEYMAP, KEYMAP_GROUPS } from "../src/lib/hooks/useHotkeys";

function ProbeScreen({ spies }: { spies: Record<string, () => void> }) {
  useConsoleAction("config", spies.config ?? null);
  useConsoleAction("prevRecord", spies.prevRecord ?? null);
  useConsoleAction("nextRecord", spies.nextRecord ?? null);
  useConsoleAction("quickCreate", spies.quickCreate ?? null);
  useConsoleAction("save", spies.save ?? null);
  useConsoleAction("duplicate", spies.duplicate ?? null);
  return <div data-testid="child-content" />;
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

function pressKey(key: string, opts: KeyboardEventInit = {}) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      key, bubbles: true, cancelable: true,
      ctrlKey: opts.ctrlKey ?? false, altKey: opts.altKey ?? false,
      shiftKey: opts.shiftKey ?? false, metaKey: opts.metaKey ?? false, ...opts,
    }));
  });
}

const Z = { totalMeasured: 0, totalUnmeasured: 0, subtotal: 0, transport: 0, netTotal: 0, gstPercentage: 0, gstAmount: 0, grandTotal: 0, totalSqft: 0 };
const HDR = { quote_no: "Q-001", date: "2026-08-13", customer_name: "Test Customer", contact_no: "9876543210", email: "", address: "", reference: "", include_gst: true, gst_percentage: "18" };

beforeEach(() => { mockPush.mockClear(); localStorage.clear(); sessionStorage.clear(); });

// 1. SIDEBAR
describe("ConsoleShell — sidebar", () => {
  it("renders all 5 nav items with company name", () => {
    renderShell();
    const nav = [...document.querySelectorAll(".vc-nav-label")].map((e) => e.textContent?.trim());
    for (const l of ["Overview", "Quotations", "Customers", "Products", "Reports"]) expect(nav).toContain(l);
    expect(screen.getByText("Test Company")).toBeTruthy();
    expect(screen.getByText("Ops Console")).toBeTruthy();
  });
  it("highlights active item and navigates on click", () => {
    renderShell();
    expect(document.querySelectorAll(".vc-nav-item")[0]?.classList.contains("vc-active")).toBe(true);
    fireEvent.click(screen.getByText("Quotations"));
    expect(mockPush).toHaveBeenCalledWith("/testclient/console/quotations");
  });
});

// 2. COMMAND PALETTE
describe("ConsoleShell — command palette", () => {
  const pal = () => screen.queryByPlaceholderText(/go to/i);
  it("opens on Ctrl+K, closes on Escape", async () => {
    renderShell();
    pressKey("k", { ctrlKey: true });
    await waitFor(() => expect(pal()).toBeTruthy());
    pressKey("Escape");
    await waitFor(() => expect(pal()).toBeNull());
  });
  it("opens on Alt+G", async () => {
    renderShell();
    pressKey("g", { altKey: true });
    await waitFor(() => expect(pal()).toBeTruthy());
  });
  it("filters by substring", async () => {
    renderShell();
    pressKey("k", { ctrlKey: true });
    await waitFor(() => expect(pal()).toBeTruthy());
    fireEvent.change(pal()!, { target: { value: "quot" } });
    const labels = [...document.querySelectorAll(".vc-palette-item")].map((e) => e.textContent || "");
    expect(labels.some((l) => l.startsWith("Quotations"))).toBe(true);
    expect(labels.some((l) => l.startsWith("Overview"))).toBe(false);
  });
  it("shows 'No matches' for gibberish", async () => {
    renderShell();
    pressKey("k", { ctrlKey: true });
    await waitFor(() => expect(pal()).toBeTruthy());
    fireEvent.change(pal()!, { target: { value: "zzzznothing" } });
    expect(screen.getByText(/no matches/i)).toBeTruthy();
  });
  it("navigates on click and exposes key features", async () => {
    renderShell();
    pressKey("k", { ctrlKey: true });
    await waitFor(() => expect(pal()).toBeTruthy());
    fireEvent.mouseDown(document.querySelector(".vc-palette-item")!);
    expect(mockPush).toHaveBeenCalled();
  });
  it("lists Change Period, Calculator, New Customer", async () => {
    renderShell();
    pressKey("k", { ctrlKey: true });
    await waitFor(() => expect(pal()).toBeTruthy());
    expect(screen.getByText("Change Period")).toBeTruthy();
    expect(screen.getByText("Calculator")).toBeTruthy();
    expect(screen.getByText("New Customer")).toBeTruthy();
  });
});

// 3. KEYBOARD DISPATCH
describe("ConsoleShell — keyboard dispatch", () => {
  it("Ctrl+S calls save or toasts when unregistered", async () => {
    const save = vi.fn();
    renderShell({ save });
    pressKey("s", { ctrlKey: true });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });
  it("Ctrl+S toasts when no screen can save", async () => {
    renderShell();
    pressKey("s", { ctrlKey: true });
    await waitFor(() => expect(screen.getByText(/nothing to save/i)).toBeTruthy());
  });
  it("Ctrl+, dispatches config", async () => {
    const config = vi.fn();
    renderShell({ config });
    pressKey(",", { ctrlKey: true });
    await waitFor(() => expect(config).toHaveBeenCalledTimes(1));
  });
  it("PgUp/PgDn dispatch prevRecord/nextRecord", async () => {
    const prevRecord = vi.fn();
    const nextRecord = vi.fn();
    renderShell({ prevRecord, nextRecord });
    pressKey("PageUp");
    await waitFor(() => expect(prevRecord).toHaveBeenCalledTimes(1));
    pressKey("PageDown");
    await waitFor(() => expect(nextRecord).toHaveBeenCalledTimes(1));
  });
  it("PgDn does NOT fire in a textarea", () => {
    const nextRecord = vi.fn();
    renderShell({ nextRecord });
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    ta.focus();
    act(() => { ta.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", bubbles: true })); });
    expect(nextRecord).not.toHaveBeenCalled();
    ta.remove();
  });
  it("Alt+D dispatches duplicate", async () => {
    const duplicate = vi.fn();
    renderShell({ duplicate });
    pressKey("d", { altKey: true });
    await waitFor(() => expect(duplicate).toHaveBeenCalledTimes(1));
  });
  it("Escape closes innermost overlay first", async () => {
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

// 4. PERIOD SELECTOR
describe("ConsoleShell — period selector", () => {
  const dlg = () => document.querySelector(".vc-period");
  it("defaults to FY and opens on F2", async () => {
    renderShell();
    expect(document.querySelector(".vc-period-chip")?.textContent).toMatch(/FY \d{4}-\d{2}/);
    pressKey("F2");
    await waitFor(() => expect(dlg()).toBeTruthy());
  });
  it("shows FY presets, no calendar-year option", async () => {
    renderShell();
    pressKey("F2");
    await waitFor(() => expect(dlg()).toBeTruthy());
    expect(screen.getByText("This Financial Year")).toBeTruthy();
    expect(screen.queryByText("This Year")).toBeNull();
  });
  it("applies preset and updates topbar chip", async () => {
    renderShell();
    pressKey("F2");
    await waitFor(() => expect(dlg()).toBeTruthy());
    fireEvent.click(screen.getByText("This Month"));
    fireEvent.click(screen.getByText(/^Apply/));
    await waitFor(() => expect(dlg()).toBeNull());
    expect(document.querySelector(".vc-period-chip")?.textContent).toContain("This Month");
  });
  it("closes on Escape WITHOUT applying", async () => {
    renderShell();
    const before = document.querySelector(".vc-period-chip")?.textContent;
    pressKey("F2");
    await waitFor(() => expect(dlg()).toBeTruthy());
    fireEvent.click(screen.getByText("Today"));
    fireEvent.keyDown(dlg()!, { key: "Escape" });
    await waitFor(() => expect(dlg()).toBeNull());
    expect(document.querySelector(".vc-period-chip")?.textContent).toBe(before);
  });
});

// 5. INLINE CALCULATOR
describe("ConsoleShell — inline calculator", () => {
  const calc = () => document.querySelector(".vc-calc");
  function focusAmt(): HTMLInputElement {
    const i = document.createElement("input");
    i.className = "vc-num"; i.setAttribute("inputmode", "decimal"); i.value = "1000";
    document.body.appendChild(i); i.focus(); return i;
  }
  it("opens seeded with field value", async () => {
    renderShell(); focusAmt();
    pressKey("/", { ctrlKey: true });
    await waitFor(() => expect(calc()).toBeTruthy());
    expect(document.querySelector<HTMLInputElement>(".vc-calc-input")?.value).toBe("1000");
  });
  it("evaluates live and errors on invalid", async () => {
    renderShell(); focusAmt();
    pressKey("/", { ctrlKey: true });
    await waitFor(() => expect(calc()).toBeTruthy());
    const i = document.querySelector<HTMLInputElement>(".vc-calc-input")!;
    fireEvent.change(i, { target: { value: "1000 + 18%" } });
    await waitFor(() => expect(document.querySelector(".vc-calc-result")?.textContent).toContain("1180"));
    fireEvent.change(i, { target: { value: "1200*" } });
    await waitFor(() => expect(document.querySelector(".vc-calc-error")).toBeTruthy());
  });
  it("writes result on Enter", async () => {
    const f = focusAmt(); renderShell(); f.focus();
    pressKey("/", { ctrlKey: true });
    await waitFor(() => expect(calc()).toBeTruthy());
    fireEvent.change(document.querySelector<HTMLInputElement>(".vc-calc-input")!, { target: { value: "1000 + 18%" } });
    fireEvent.keyDown(document.querySelector(".vc-calc-input")!, { key: "Enter" });
    await waitFor(() => expect(calc()).toBeNull());
    expect(f.value).toBe("1180"); f.remove();
  });
  it("explains on non-numeric field", async () => {
    renderShell();
    const t = document.createElement("input"); t.setAttribute("data-calc", "off");
    document.body.appendChild(t); t.focus();
    pressKey("/", { ctrlKey: true });
    await waitFor(() => expect(screen.getByText(/amount and quantity fields/i)).toBeTruthy());
    expect(calc()).toBeNull(); t.remove();
  });
});

// 6. CHEATSHEET
describe("ConsoleShell — cheatsheet", () => {
  const sh = () => document.querySelector(".vc-sheet");
  it("opens on ? and Shift+/", async () => {
    renderShell(); pressKey("?");
    await waitFor(() => expect(sh()).toBeTruthy());
    fireEvent.keyDown(sh()!, { key: "Escape" });
    await waitFor(() => expect(sh()).toBeNull());
    pressKey("/", { shiftKey: true });
    await waitFor(() => expect(sh()).toBeTruthy());
  });
  it("groups shortcuts and lists Phase 3 keys", async () => {
    renderShell(); pressKey("?");
    await waitFor(() => expect(sh()).toBeTruthy());
    for (const g of KEYMAP_GROUPS) expect(screen.getByText(g)).toBeTruthy();
    const badges = [...sh()!.querySelectorAll(".vc-kbd")].map((e) => e.textContent);
    for (const k of ["F2", "Ctrl+,", "Ctrl+/", "Alt+C", "PgUp", "PgDn"]) expect(badges).toContain(k);
  });
});

// 7. DATA GRID
describe("DataGrid", () => {
  type R = { name: string; amount: number };
  const col = createColumnHelper<R>();
  const cols = [col.accessor("name", { header: "Name" }), col.accessor("amount", { header: "Amount" })];
  const data: R[] = [{ name: "Window 1200x1500", amount: 5000 }, { name: "Door Panel", amount: 3000 }];
  it("renders rows and headers", () => {
    render(<DataGrid data={data} columns={cols} getRowId={(r) => r.name} />);
    expect(screen.getByText("Window 1200x1500")).toBeTruthy();
    expect(screen.getByText("Door Panel")).toBeTruthy();
    expect(screen.getByText("Name")).toBeTruthy();
  });
  it("shows empty state when data is empty and not loading", () => {
    render(<DataGrid data={[]} columns={cols} getRowId={(r) => r.name} emptyTitle="No data" />);
    expect(screen.getByText("No data")).toBeTruthy();
  });
  it("shows loading spinner when loading and empty", () => {
    const { container } = render(<DataGrid data={[]} columns={cols} getRowId={(r) => r.name} loading />);
    expect(container.querySelector(".vc-spinner")).toBeTruthy();
  });
});

// 8. LIVE PREVIEW
describe("LivePreview", () => {
  it("renders company name, customer, and quotation title", async () => {
    render(<LivePreview header={HDR} measured={[]} unmeasured={[]} totals={Z} companyName="Vitharn Industries" />);
    await waitFor(() => expect(screen.getByText("Vitharn Industries")).toBeTruthy());
    expect(screen.getByText("Test Customer")).toBeTruthy();
    expect(screen.getByText("Quotation")).toBeTruthy();
  });
  it("shows empty hint when no items", async () => {
    render(<LivePreview header={HDR} measured={[]} unmeasured={[]} totals={Z} companyName="Co" />);
    await waitFor(() => expect(screen.getByText(/line items appear here/i)).toBeTruthy());
  });
  it("renders line items and grand total", async () => {
    const m = [{ key: "m1", code: "W1", description: "Sliding Window", glass: "Clear", width: "1200", height: "1500", units: "2", rate: "450" }];
    const t = { totalMeasured: 5000, totalUnmeasured: 0, subtotal: 5000, transport: 0, netTotal: 5000, gstPercentage: 18, gstAmount: 900, grandTotal: 5900, totalSqft: 25 };
    render(<LivePreview header={HDR} measured={m} unmeasured={[]} totals={t} companyName="Co" />);
    await waitFor(() => { expect(screen.getByText("Sliding Window")).toBeTruthy(); expect(screen.getByText("Grand Total")).toBeTruthy(); });
  });
});

// 9. KEYMAP INTEGRITY
describe("Keymap integrity", () => {
  it("all entries grouped, no reserved keys bound", () => {
    for (const k of CONSOLE_KEYMAP) expect(KEYMAP_GROUPS).toContain(k.group);
    for (const f of ["Ctrl+A", "Ctrl+N", "Ctrl+W", "F12"]) expect(CONSOLE_KEYMAP.some((k) => k.keys === f)).toBe(false);
  });
});
