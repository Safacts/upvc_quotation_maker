import React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CustomerPortal from "../app/[slug]/home/CustomerPortal";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/slug", () => ({ slugify: (value: string) => value.toLowerCase() }));
let statsData: Record<string, unknown>;
const emptyStats = { totalCount: 0, totalQuoted: 0, monthChangePercent: 0, wonCount: 0,
  wonQuoted: 0, winRate: 0, countsByStatus: {}, weeklyBars: [], pendingFollowUps: [] };

beforeEach(() => {
  statsData = { error: "Statistics unavailable in this interaction fixture" };
  localStorage.setItem("portal_session", "active");
  localStorage.setItem("portal_role", "customer");
  localStorage.setItem("portal_client_id", "demo");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: true,
    json: async () => url === "/api/portal_auth"
      ? { role: "customer", client_id: "demo" }
      : statsData,
  })));
});
afterEach(() => vi.unstubAllGlobals());

async function openPortal() {
  render(<CustomerPortal slug="demo" client={{ id: "demo", config: {
    companyName: "Demo Windows", companyProprietor: "Demo Owner",
  } }} />);
  await screen.findByRole("heading", { name: /Welcome back/i });
}

describe("Premium portal interaction regressions", () => {
  it("shows recovery instead of silently hiding failed statistics", async () => {
    await openPortal();
    const retry = await screen.findByRole("button", { name: "Retry figures" });
    statsData = emptyStats;
    fireEvent.click(retry);
    expect(await screen.findByText("No quotes waiting for a follow-up.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry figures" })).toBeNull();
  });

  it("does not claim success when clipboard access is denied", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: vi.fn().mockRejectedValue(new Error("Denied")),
    } });
    await openPortal();
    fireEvent.click(screen.getByRole("button", { name: "Copy Showroom Link" }));
    expect(await screen.findByText(/Couldn’t copy automatically/)).toBeTruthy();
    expect(screen.queryByText(/Showroom link copied to clipboard/)).toBeNull();
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("offers a direct, keyboard-accessible path to pending follow-ups", async () => {
    statsData = { ...emptyStats, totalCount: 1, pendingFollowUps: [{
      id: "sample", customer_name: "Demo customer", quote_no: "DEMO-1", total: 100,
      created_at: "2026-09-01T12:00:00Z",
    }] };
    await openPortal();
    fireEvent.click(await screen.findByRole("button", { name: "View follow-ups" }));
    expect(document.activeElement).toBe(screen.getByRole("region", { name: "Quotes to follow up" }));
    expect(screen.queryByText("Action Required")).toBeNull();
  });

  it("does not present an urgent action when there are no follow-ups", async () => {
    statsData = emptyStats;
    await openPortal();
    expect(await screen.findByText("No quotes waiting for a follow-up.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "View follow-ups" })).toBeNull();
  });

  it("keeps labelled estimator inputs and exposes selected presets", async () => {
    await openPortal();
    fireEvent.change(screen.getByLabelText("Width (Ft)"), { target: { value: "6" } });
    expect(screen.getByText("Approx 24.0 Sq.Ft")).toBeTruthy();
    expect(screen.getByText("₹ 11,520")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fixed" }));
    expect(screen.getByRole("button", { name: "Fixed" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "2-Track" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("opens navigation with a named control and restores focus on Escape", async () => {
    await openPortal();
    const toggle = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close navigation" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });
});
