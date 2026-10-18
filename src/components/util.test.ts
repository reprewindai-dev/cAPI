import { afterEach, describe, expect, it, vi } from "vitest";
import { getList } from "./util";

const respond = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

afterEach(() => vi.unstubAllGlobals());

describe("getList", () => {
  it("returns the data list from a successful response", async () => {
    respond(200, { data: [{ id: "a" }] });
    expect(await getList("/x")).toEqual({ ok: true, items: [{ id: "a" }] });
  });

  it("surfaces the API's error on a 503 instead of undefined data", async () => {
    respond(503, { error: "capability registry integration is not configured" });
    expect(await getList("/x")).toEqual({
      ok: false,
      status: 503,
      error: "capability registry integration is not configured",
    });
  });

  it("treats a successful response without a data list as an error", async () => {
    respond(200, { items: [] });
    expect(await getList("/x")).toEqual({ ok: false, status: 200, error: "response has no data list" });
  });

  it("handles a body that is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>bad gateway</html>", { status: 502, statusText: "Bad Gateway" })));
    expect(await getList("/x")).toEqual({ ok: false, status: 502, error: "Bad Gateway" });
  });

  it("handles a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    expect(await getList("/x")).toEqual({ ok: false, status: 0, error: "fetch failed" });
  });
});
