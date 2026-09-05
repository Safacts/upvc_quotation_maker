import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(), replace: vi.fn(), status: vi.fn(),
  actions: {} as Record<string, any>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, push: vi.fn() }) }));
vi.mock("../app/[slug]/console/ConsoleShell", () => ({
  useConsole: () => ({ slug: "kprupvc", clientId: "kprupvc", toast: mocks.toast, openQuickCreate: vi.fn() }),
  useConsoleStatus: (status: unknown) => mocks.status(status),
  useConsoleAction: (name: string, action: unknown) => { mocks.actions[name] = action; },
}));
vi.mock("../app/[slug]/console/_components/LivePreview", () => ({ LivePreview: () => <div /> }));
import QuotationEditor, { blankHeader } from "../app/[slug]/console/quotations/QuotationEditor";

function mount(id: string | null = "quote-1") {
  render(<QuotationEditor quotationId={id} companyName="Test Shop" initial={{
    header: { ...blankHeader(), quote_no: "KPR-1", customer_name: "Before", email: "buyer@example.com" },
    measured: [], unmeasured: [],
  }} />);
}
function edit(value: string) { fireEvent.change(screen.getByPlaceholderText("Customer name"), { target: { value } }); }
function deferred() {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>((r) => { resolve = r; });
  return { promise, resolve };
}
const ok = { ok: true, json: async () => ({ id: "quote-1" }) };
const status = () => mocks.status.mock.calls.at(-1)?.[0];

describe("quotation save and delivery feedback", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("locks same-tick save actions and preserves newer edits until a follow-up autosave", async () => {
    const pending = deferred();
    vi.mocked(fetch).mockReturnValueOnce(pending.promise).mockResolvedValue(ok as Response);
    mount(); edit("Snapshot");
    act(() => { void mocks.actions.save(); void mocks.actions.save(); });
    expect(fetch).toHaveBeenCalledTimes(1);
    edit("Newer edit");
    await act(async () => { pending.resolve(ok); });
    expect(status().dirty).toBe(true);
    expect(status().count).toContain("unsaved");
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).customer_name).toBe("Newer edit");
    expect(status().dirty).toBe(false);
  });

  it("does not navigate away from a newly saved draft with newer unsaved edits", async () => {
    const pending = deferred(); vi.mocked(fetch).mockReturnValue(pending.promise);
    mount(null); edit("Snapshot");
    act(() => { void mocks.actions.save(); });
    edit("Newer edit");
    await act(async () => { pending.resolve(ok); });
    expect(status().dirty).toBe(true);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("pauses failed autosave without repeated requests and retries explicitly", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response).mockResolvedValue(ok as Response);
    mount(); edit("Keep me");
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.getByRole("alert").textContent).toContain("Auto-save paused");
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(status().dirty).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Retry Save" })); });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(status().dirty).toBe(false);
  });

  it("blocks PDF and email while dirty or a clean record save is in flight", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const pending = deferred(); vi.mocked(fetch).mockReturnValue(pending.promise);
    mount();
    act(() => { void mocks.actions.save(); mocks.actions.export(); });
    fireEvent.click(screen.getByTitle("Email the saved quotation as a PDF"));
    expect(fetch).toHaveBeenCalledTimes(1); expect(open).not.toHaveBeenCalled();
    edit("Dirty");
    act(() => { mocks.actions.export(); });
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining("latest changes"), "info");
  });

  it("shows sending progress and prevents duplicate emails until completion", async () => {
    const pending = deferred();
    vi.mocked(fetch).mockReturnValueOnce(pending.promise).mockResolvedValue(ok as Response);
    mount();
    const button = screen.getByTitle("Email the saved quotation as a PDF") as HTMLButtonElement;
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(fetch).toHaveBeenCalledTimes(1); expect(button.disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Sending quotation");
    await act(async () => { pending.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }); });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe("/api/send_email");
    expect(button.disabled).toBe(false);
    expect(mocks.toast).toHaveBeenCalledWith("Quotation emailed to buyer@example.com", "ok");
  });
});
