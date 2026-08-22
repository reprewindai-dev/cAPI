import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { toolRegistry } from "@/lib/covenant/tool-registry";
import { POST } from "./route";

describe("transparent proxy CAPPO admission boundary", () => {
  beforeEach(() => {
    process.env.CAPPO_PROXY_KEY = "cappo-proxy-key";
    toolRegistry.set("server-1", [], {
      server_id: "server-1",
      base_url: "https://provider.test",
      openapi_url: "https://provider.test/openapi.json",
      registered_at: new Date(0).toISOString(),
    });
  });

  afterEach(() => {
    delete process.env.CAPPO_PROXY_KEY;
    vi.restoreAllMocks();
  });

  it("rejects a direct internal-key call without prior CAPPO admission proof", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await POST(new NextRequest("https://capi.veklom.com/api/proxy/server-1/write", {
      method: "POST",
      headers: { "x-api-key": "cappo-proxy-key" },
      body: "{}",
    }), { params: Promise.resolve({ serverId: "server-1", path: ["write"] }) });

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("forwards only a CAPPO-authenticated admitted execution", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const response = await POST(new NextRequest("https://capi.veklom.com/api/proxy/server-1/write", {
      method: "POST",
      headers: {
        "x-api-key": "cappo-proxy-key",
        "x-cappo-execution-id": "exec-1",
      },
      body: "{}",
    }), { params: Promise.resolve({ serverId: "server-1", path: ["write"] }) });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});
