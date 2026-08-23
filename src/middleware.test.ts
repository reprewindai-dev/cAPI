import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

const protectedPaths = [
  "/api/mount/authorize",
  "/api/mount/execute",
  "/api/request",
  "/api/capi/v1/execute",
  "/api/llm/ollama",
  "/api/adapters/qwen",
  "/api/v1/registry/register",
  "/api/v1/registry/heartbeat",
  "/api/v1/registry/services/example/heartbeat",
  "/api/mcp/servers",
  "/api/proxy/server/tool",
  "/api/outly/intercept",
  "/api/outly/outcome",
  "/api/ops/validate",
];

function request(path: string, method = "POST", headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, { method, headers });
}

afterEach(() => {
  delete process.env.COVENANT_ADMIN_TOKEN;
  delete process.env.BYOS_INTERNAL_API_KEY;
});

describe("API default-deny middleware", () => {
  it.each(protectedPaths)("rejects anonymous access to %s", async (path) => {
    process.env.COVENANT_ADMIN_TOKEN = "admin-secret";
    process.env.BYOS_INTERNAL_API_KEY = "internal-secret";

    const response = await middleware(request(path));

    expect(response.status).toBe(401);
  });

  it("does not treat x-api-key as an admin credential", async () => {
    process.env.COVENANT_ADMIN_TOKEN = "admin-secret";
    process.env.BYOS_INTERNAL_API_KEY = "admin-secret";

    const response = await middleware(
      request("/api/mcp/servers", "GET", { "x-api-key": "admin-secret" }),
    );

    expect(response.status).toBe(401);
  });

  it("fails closed when an authenticated lane is not configured", async () => {
    const response = await middleware(request("/api/mcp/servers", "GET"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "COVENANT_ADMIN_TOKEN is not configured; admin route is locked",
    });
  });

  it("allows only safe methods through the public lane", async () => {
    const getResponse = await middleware(request("/api/well-known/ai-catalog.json", "GET"));
    const postResponse = await middleware(request("/api/well-known/ai-catalog.json", "POST"));

    expect(getResponse.headers.get("x-middleware-next")).toBe("1");
    expect(postResponse.status).toBe(405);
  });

  it("rejects unknown API paths by default", async () => {
    process.env.COVENANT_ADMIN_TOKEN = "admin-secret";
    process.env.BYOS_INTERNAL_API_KEY = "internal-secret";

    const response = await middleware(request("/api/route-added-without-admission"));

    expect(response.status).toBe(404);
  });
});
