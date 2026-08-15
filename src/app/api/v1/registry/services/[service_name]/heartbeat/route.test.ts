import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { POST } from "./route";

const context = { params: Promise.resolve({ service_name: "cappo" }) };

describe("service-specific cAPI registry heartbeat", () => {
  const originalRegistryToken = process.env.CAPI_REGISTRY_TOKEN;

  afterEach(() => {
    if (originalRegistryToken === undefined) delete process.env.CAPI_REGISTRY_TOKEN;
    else process.env.CAPI_REGISTRY_TOKEN = originalRegistryToken;
  });

  it("rejects an unauthenticated freshness mutation before touching the registry", async () => {
    process.env.CAPI_REGISTRY_TOKEN = "registry-test-token";
    expect(process.env.CAPI_REGISTRY_TOKEN).toBe("registry-test-token");

    const response = await POST(
      new NextRequest("http://localhost/api/v1/registry/services/cappo/heartbeat", { method: "POST" }),
      context,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Invalid or missing registry token" });
  });
});
