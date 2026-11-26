import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QuotationClient from "../app/quote/[id]/QuotationClient";

describe("QuotationClient CAD visibility based on URL parameter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("hides 2D CAD schedule and view buttons when cad=0 is in URL", async () => {
    delete (window as any).location;
    (window as any).location = new URL("https://upvcquotationmaker.vercel.app/quote/test-quote-1?token=tok123&cad=0");

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        quotation: {
          id: "test-quote-1",
          quote_no: "KPRUPVC-26112026-0441",
          customer_name: "Shivani College",
          status: "draft",
          client_id: "kprupvc",
        },
        measured: [
          {
            description: "2 Track Sliding Window",
            width: 1200,
            height: 1500,
            units: 2,
            rate: 450,
            amount: 17437,
            totalSqft: 38.75,
            unitSqft: 19.37,
            glass: "5mm Clear",
          },
        ],
        unmeasured: [],
        clientConfig: { companyName: "KPR UPVC" },
      }),
    } as Response);

    render(<QuotationClient params={Promise.resolve({ id: "test-quote-1" })} />);

    await waitFor(() => {
      expect(screen.getByText("Shivani College")).toBeTruthy();
    });

    // When cad=0, CAD section must NOT be rendered
    expect(screen.queryByText("2D CAD Elevation & Dimension Schedule")).toBeNull();
    expect(screen.queryByText("View CAD Elevation ▼")).toBeNull();
    expect(screen.queryByText("Full Document & CAD Schedule")).toBeNull();
    expect(screen.queryByText(/CAD Window Elevations/)).toBeNull();
  });

  it("shows CAD schedule when cad parameter is not 0", async () => {
    delete (window as any).location;
    (window as any).location = new URL("https://upvcquotationmaker.vercel.app/quote/test-quote-1?token=tok123");

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        quotation: {
          id: "test-quote-1",
          quote_no: "KPRUPVC-26112026-0441",
          customer_name: "Shivani College",
          status: "draft",
          client_id: "kprupvc",
        },
        measured: [
          {
            description: "2 Track Sliding Window",
            width: 1200,
            height: 1500,
            units: 2,
            rate: 450,
            amount: 17437,
            totalSqft: 38.75,
            unitSqft: 19.37,
            glass: "5mm Clear",
          },
        ],
        unmeasured: [],
        clientConfig: { companyName: "KPR UPVC" },
      }),
    } as Response);

    render(<QuotationClient params={Promise.resolve({ id: "test-quote-1" })} />);

    await waitFor(() => {
      expect(screen.getByText("Shivani College")).toBeTruthy();
    });

    expect(screen.getByText("2D CAD Elevation & Dimension Schedule")).toBeTruthy();
    expect(screen.getByText("View CAD Elevation ▼")).toBeTruthy();
  });
});
