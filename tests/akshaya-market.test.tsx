import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Page from "../app/[slug]/AkshayaMarketPage";

const client = { id: "akshaya upvc", config: { companyName: "Akshaya", companyContact: "9876543210", logoUrl: "configured-client-logo" } };
beforeEach(() => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ reviews: [] }) })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("Akshaya market page", () => {
  it("renders Akshaya's existing client logo in the header and footer", () => {
    render(<Page client={client} slug="akshaya-upvc" />);
    const logos = screen.getAllByRole("img", { name: "Akshaya logo" });
    expect(logos.length).toBe(2);
    expect(logos[0].getAttribute("src")).toBe(client.config.logoUrl);
    expect(document.querySelector(".ak-brand-mark")).toBeNull();
  });

  it("uses the latest client-configured logo when the market data changes", () => {
    const { rerender } = render(<Page client={client} slug="akshaya-upvc" />);
    const updatedLogoUrl = "/uploaded/akshaya-logo-v2.png";
    rerender(<Page client={{ ...client, config: { ...client.config, logoUrl: updatedLogoUrl } }} slug="akshaya-upvc" />);
    expect(screen.getAllByRole("img", { name: "Akshaya logo" }).map((logo) => logo.getAttribute("src"))).toEqual([updatedLogoUrl, updatedLogoUrl]);
  });

  it("updates estimates and encodes real message line breaks", () => {
    render(<Page client={client} slug="akshaya-upvc" />);
    const link = screen.getByRole("link", { name: /Send this to Akshaya/ });
    const initial = new URL(link.getAttribute("href")!).searchParams.get("text")!;
    expect(initial).toContain(String.fromCharCode(10));
    expect(initial).not.toContain(String.fromCharCode(92) + "n");
    fireEvent.click(screen.getByRole("button", { name: "Casement windows" }));
    expect(link.getAttribute("href")).not.toContain("Opening%3A%20Sliding");
    expect(new URL(link.getAttribute("href")!).searchParams.get("text")).toContain("Casement windows");
  });
  it("does not direct prospects to a placeholder number", () => {
    render(<Page client={{ ...client, config: { ...client.config, companyContact: "9999999999" } }} slug="akshaya-upvc" />);
    expect((screen.getByRole("button", { name: /Request my measurement/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('a[href*="9999999999"]')).toBeNull();
  });
  it("retains enquiry fields in the WhatsApp retry link", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<Page client={client} slug="akshaya-upvc" />);
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Test customer" } });
    fireEvent.change(screen.getByPlaceholderText("10-digit mobile number"), { target: { value: "9876543210" } });
    fireEvent.click(screen.getByRole("button", { name: /Request my measurement/ }));
    const retry = screen.getByRole("link", { name: "Open WhatsApp" });
    expect(retry.getAttribute("href")).toBe(open.mock.calls[0][0]);
    expect(decodeURIComponent(retry.getAttribute("href")!)).toContain("Test customer");
  });
  it("distinguishes review failure from an empty feed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<Page client={client} slug="akshaya-upvc" />);
    await waitFor(() => expect(screen.getByText("Customer feedback is temporarily unavailable.")).not.toBeNull());
  });
  it("closes mobile navigation with Escape", () => {
    render(<Page client={client} slug="akshaya-upvc" />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Open menu" }).getAttribute("aria-expanded")).toBe("false");
  });
});
