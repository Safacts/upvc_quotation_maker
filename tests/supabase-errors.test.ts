import { afterEach, describe, expect, it, vi } from "vitest";
import { supaGet, SupabaseRequestError } from "@/lib/supabase";

describe("Supabase sync failure classification", () => {
  afterEach(() => vi.restoreAllMocks());

  it("classifies a network failure as retryable server_unreachable without leaking internals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND internal-db")));

    await expect(supaGet("content_manifest", { client_id: "eq.tenant" })).rejects.toMatchObject({
      name: "SupabaseRequestError",
      kind: "server_unreachable",
      retryable: true,
      message: "Sync service is unreachable. Please try again when connected.",
    });
  });

  it("classifies 5xx as retryable and 4xx as non-retryable", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("database down", { status: 503 }))
      .mockResolvedValueOnce(new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const serverFailure = supaGet("content_manifest");
    await expect(serverFailure).rejects.toMatchObject({
      kind: "server_unreachable",
      status: 503,
      retryable: true,
    });

    const clientFailure = supaGet("content_manifest");
    await expect(clientFailure).rejects.toMatchObject({
      kind: "http",
      status: 400,
      retryable: false,
    });
  });

  it("exposes a typed error for route-level machine-readable handling", () => {
    const error = new SupabaseRequestError("timeout", "retry", 504);
    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe("timeout");
    expect(error.retryable).toBe(true);
  });

  it("supports repeated PostgREST filters for bounded date windows", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await supaGet("quotations", {
      created_at: ["gte.2026-09-12T00:00:00.000Z", "lt.2026-09-13T00:00:00.000Z"],
    });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("created_at=gte.2026-09-12T00%3A00%3A00.000Z");
    expect(url).toContain("created_at=lt.2026-09-13T00%3A00%3A00.000Z");
  });
});
