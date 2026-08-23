import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { POST } from "./route";

const context = { params: Promise.resolve({ service_name: "cappo" }) };

describe("service-specific cAPI registry heartbeat", () => {
  const originalRegistryToken = process.env.CAPI_REGISTRY_TOKEN;
  const originalInternalKey = process.env.BYOS_INTERNAL_API_KEY;

  afterEach(() => {
    if (originalRegistryToken === undefined) delete process.env.CAPI_REGISTRY_TOKEN;
    else process.env.CAPI_REGISTRY_TOKEN = originalRegistryToken;
    if (originalInternalKey === undefined) delete process.env.BYOS_INTERNAL_API_KEY;
    else process.env.BYOS_INTERNAL_API_KEY = originalInternalKey;
  });

  it("rejects an unauthenticated freshness mutation before touching the registry", async () => {
    process.env.BYOS_INTERNAL_API_KEY = "test-internal-key";
    process.env.CAPI_REGISTRY_TOKEN = "registry-test-token";
    expect(process.env.CAPI_REGISTRY_TOKEN).toBe("registry-test-token");

    const response = await POST(
      new NextRequest("http://localhost/api/v1/registry/services/cappo/heartbeat", {
        method: "POST",
        headers: { "x-api-key": "test-internal-key" },
      }),
      context,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Invalid or missing registry token" });
  });
});
