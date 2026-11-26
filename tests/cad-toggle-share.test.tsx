import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  replace: vi.fn(),
  status: vi.fn(),
  actions: {} as Record<string, any>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
}));

vi.mock("../app/[slug]/console/ConsoleShell", () => ({
  useConsole: () => ({
    slug: "kprupvc",
    clientId: "kprupvc",
    toast: mocks.toast,
    openQuickCreate: vi.fn(),
  }),
  useConsoleStatus: (status: unknown) => mocks.status(status),
  useConsoleAction: (name: string, action: unknown) => {
    mocks.actions[name] = action;
  },
}));

vi.mock("../app/[slug]/console/_components/LivePreview", () => ({
  LivePreview: () => <div data-testid="live-preview" />,
}));

import QuotationEditor, { blankHeader } from "../app/[slug]/console/quotations/QuotationEditor";
import { UIProvider } from "../src/lib/hooks/useUI";

describe("QuotationEditor CAD toggle persistence and share link generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("persists CAD toggle state in UI preferences across reloads", async () => {
    const { unmount } = render(
      <UIProvider clientId="kprupvc">
        <QuotationEditor
          quotationId="quote-1"
          companyName="KPR UPVC"
          initial={{
            header: { ...blankHeader(), quote_no: "KPR-1", customer_name: "Shivani College" },
            measured: [],
            unmeasured: [],
          }}
        />
      </UIProvider>
    );

    const cadBtn = screen.getByText("CAD: On");
    expect(cadBtn).toBeTruthy();

    // Toggle CAD Off
    fireEvent.click(cadBtn);
    expect(screen.getByText("CAD: Off")).toBeTruthy();

    unmount();

    // Re-mount (simulating reload or next opening)
    render(
      <UIProvider clientId="kprupvc">
        <QuotationEditor
          quotationId="quote-1"
          companyName="KPR UPVC"
          initial={{
            header: { ...blankHeader(), quote_no: "KPR-1", customer_name: "Shivani College" },
            measured: [],
            unmeasured: [],
          }}
        />
      </UIProvider>
    );

    // Should stay CAD: Off
    expect(screen.getByText("CAD: Off")).toBeTruthy();
  });

  it("appends &cad=0 to share link when CAD is toggled off", async () => {
    let clipboardText = "";
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(async (text: string) => {
          clipboardText = text;
        }),
      },
    });

    const windowOpenSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: "token123" }),
    } as Response);

    render(
      <UIProvider clientId="kprupvc">
        <QuotationEditor
          quotationId="quote-1"
          companyName="KPR UPVC"
          initial={{
            header: {
              ...blankHeader(),
              quote_no: "KPRUPVC-26112026-0441",
              customer_name: "Shivani College",
              contact_no: "9876543210",
            },
            measured: [],
            unmeasured: [],
          }}
        />
      </UIProvider>
    );

    // Turn CAD Off
    fireEvent.click(screen.getByText("CAD: On"));
    expect(screen.getByText("CAD: Off")).toBeTruthy();

    // Click WhatsApp share
    const waBtn = screen.getByText("WhatsApp");
    await act(async () => {
      fireEvent.click(waBtn);
    });

    expect(clipboardText).toContain("?token=token123&cad=0");
    expect(windowOpenSpy).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent("?token=token123&cad=0")),
      "_blank",
      "noopener,noreferrer"
    );
    // WhatsApp text should not promise CAD diagrams
    const callUrl = String(windowOpenSpy.mock.calls[0][0]);
    expect(decodeURIComponent(callUrl)).not.toContain("2D CAD window elevation diagrams");
  });
});
