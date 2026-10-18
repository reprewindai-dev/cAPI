import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AuthorityDenied,
  IntegrationUnavailable,
  postIntegration,
} from "../src/lib/covenant/integrations";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("postIntegration fail-closed authority boundary", () => {
  it("does not replay a prior successful response after the authority service fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ decision: "APPROVED" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response("upstream failure", { status: 503 }));

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postIntegration("https://cappo.example.test/authorize", { run_id: "run-1" }),
    ).resolves.toEqual({ decision: "APPROVED" });

    await expect(
      postIntegration("https://cappo.example.test/authorize", { run_id: "run-1" }),
    ).rejects.toBeInstanceOf(IntegrationUnavailable);
  });

  it("does not replay a prior successful response after a network rejection", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ decision: "APPROVED" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockRejectedValueOnce(new Error("network unavailable"));

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postIntegration("https://cappo.example.test/authorize", { run_id: "run-network" }),
    ).resolves.toEqual({ decision: "APPROVED" });

    await expect(
      postIntegration("https://cappo.example.test/authorize", { run_id: "run-network" }),
    ).rejects.toBeInstanceOf(IntegrationUnavailable);
  });

  it("does not replay a prior successful response after the three-second timeout", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ decision: "APPROVED" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockImplementationOnce((_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postIntegration("https://cappo.example.test/authorize", { run_id: "run-timeout" }),
    ).resolves.toEqual({ decision: "APPROVED" });

    vi.useFakeTimers();
    const timedOutRequest = postIntegration("https://cappo.example.test/authorize", {
      run_id: "run-timeout",
    });
    const timeoutExpectation = expect(timedOutRequest).rejects.toBeInstanceOf(
      IntegrationUnavailable,
    );

    await vi.advanceTimersByTimeAsync(3000);
    await timeoutExpectation;
  });

  it("preserves explicit authority denial", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("denied", { status: 403 })),
    );

    await expect(
      postIntegration("https://cappo.example.test/authorize", { run_id: "run-2" }),
    ).rejects.toBeInstanceOf(AuthorityDenied);
  });

  it("fails closed on invalid success payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(["not", "an", "authority", "object"]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(
      postIntegration("https://cappo.example.test/authorize", { run_id: "run-3" }),
    ).rejects.toBeInstanceOf(IntegrationUnavailable);
  });
});
