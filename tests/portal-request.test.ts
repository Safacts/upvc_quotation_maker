import { afterEach, describe, expect, it, vi } from "vitest";
import { portalRequest } from "../src/lib/portal-request";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("bounded portal requests", () => {
  it("rejects HTTP failure even if JSON has no error field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    await expect(portalRequest("/api/portal_settings", { method: "POST" })).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("stops a hanging request without retrying a potentially completed write", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    })));
    const result = expect(portalRequest("/api/portal_settings", { method: "POST" }, 100)).rejects.toThrow("aborted");
    await vi.advanceTimersByTimeAsync(100);
    await result;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
