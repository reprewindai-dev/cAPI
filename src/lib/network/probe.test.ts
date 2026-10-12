import { afterEach, describe, expect, it, vi } from "vitest";
import { probe, probeTimeoutMs } from "./probe";

/** A fetch that answers after `ms`, or rejects when its signal aborts first. */
function slowFetch(ms: number) {
  return vi.fn((_url: string, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(Response.json({ status: "ok" })), ms);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("aborted", "AbortError"));
      });
    }),
  );
}

describe("dependency probe timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("defaults to 5000 ms and honours CAPI_PROBE_TIMEOUT_MS", () => {
    vi.stubEnv("CAPI_PROBE_TIMEOUT_MS", undefined);
    expect(probeTimeoutMs()).toBe(5_000);
    vi.stubEnv("CAPI_PROBE_TIMEOUT_MS", "750");
    expect(probeTimeoutMs()).toBe(750);
    for (const bad of ["", "0", "-1", "soon"]) {
      vi.stubEnv("CAPI_PROBE_TIMEOUT_MS", bad);
      expect(probeTimeoutMs()).toBe(5_000);
    }
  });

  it("keeps a slow-but-answering dependency healthy under the default", async () => {
    vi.useFakeTimers();
    vi.stubEnv("CAPI_PROBE_TIMEOUT_MS", undefined);
    vi.stubGlobal("fetch", slowFetch(2_500));

    const result = probe("https://pgl.test");
    await vi.advanceTimersByTimeAsync(2_500);
    await expect(result).resolves.toMatchObject({ state: "healthy", host: "pgl.test" });
  });

  it("reports unavailable once the configured timeout elapses", async () => {
    vi.useFakeTimers();
    vi.stubEnv("CAPI_PROBE_TIMEOUT_MS", "1000");
    vi.stubGlobal("fetch", slowFetch(2_500));

    const result = probe("https://pgl.test");
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(result).resolves.toMatchObject({ state: "unavailable", host: "pgl.test" });
  });
});
