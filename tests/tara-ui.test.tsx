import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Page from "../app/admin/agent/page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function response(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  push.mockReset();
  vi.stubGlobal("fetch", vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      return Promise.resolve(response({ reply: "Verified answer", logs: ["Checked the database"], conversationId: "11111111-1111-4111-8111-111111111111" }));
    }
    if (init?.method === "DELETE") return Promise.resolve(response({ ok: true }));
    if (url.includes("conversationId=")) return Promise.resolve(response({ messages: [] }));
    return Promise.resolve(response({ conversations: [] }));
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Tara chat workspace", () => {
  it("renders accessible empty-state actions and a labelled composer", async () => {
    render(<Page />);

    expect(await screen.findByText("No past chats yet. Start with a question below.")).toBeTruthy();
    expect(screen.getByRole("log", { name: "Tara conversation" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Ask Tara" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "How many quotations were made by all clients today?" })).toBeTruthy();
  });

  it("puts a quick evidence prompt in the composer and submits it", async () => {
    render(<Page />);
    const quickPrompt = await screen.findByRole("button", { name: "What can you do as Tara?" });
    const composer = screen.getByRole("textbox", { name: "Ask Tara" }) as HTMLTextAreaElement;

    fireEvent.click(quickPrompt);
    expect(composer.value).toBe("What can you do as Tara?");
    fireEvent.keyDown(composer, { key: "Enter" });

    expect(await screen.findByText("Verified answer")).toBeTruthy();
    expect(screen.getByText("Automated actions (1)")).toBeTruthy();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/admin/agent", expect.objectContaining({ method: "POST" }));
  });

  it("shows a retryable request error without fabricating an assistant message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.resolve(response({ error: "Tara could not reach the data service right now." }, 503));
      return Promise.resolve(response({ conversations: [] }));
    }));
    render(<Page />);
    const composer = await screen.findByRole("textbox", { name: "Ask Tara" }) as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: "Check today's quotations" } });
    fireEvent.keyDown(composer, { key: "Enter" });

    expect(await screen.findByText("Tara could not finish that request.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry request" })).toBeTruthy();
    expect(screen.queryByText(/^Error:/)).toBeNull();
  });

  it("exposes chat selection and delete controls to keyboard and assistive technology", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: RequestInfo | URL) => {
      if (String(input).includes("conversationId=")) return Promise.resolve(response({ messages: [] }));
      return Promise.resolve(response({ conversations: [{
        id: "11111111-1111-4111-8111-111111111111",
        title: "Daily report",
        created_at: "2026-09-12T00:00:00.000Z",
        updated_at: "2026-09-12T00:01:00.000Z",
      }] }));
    }));
    render(<Page />);

    expect(await screen.findByRole("button", { name: "Open chat Daily report" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete chat Daily report" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open chat Daily report" }).getAttribute("aria-current")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open chat Daily report" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Open chat Daily report" }).getAttribute("aria-current")).toBe("page"));
  });
});
