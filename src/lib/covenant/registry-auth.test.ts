import { afterEach, describe, expect, it } from "vitest";
import { checkRegistryAuth } from "./registry-auth";

const originalCanonical = process.env.COVENANT_REGISTRY_API_KEY;
const originalLegacy = process.env.CAPI_REGISTRY_TOKEN;
const originalEnvironment = process.env.NODE_ENV;

const restore = (name: string, value: string | undefined) => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

afterEach(() => {
  restore("COVENANT_REGISTRY_API_KEY", originalCanonical);
  restore("CAPI_REGISTRY_TOKEN", originalLegacy);
  restore("NODE_ENV", originalEnvironment);
});

const request = (token?: string) =>
  new Request("http://capi.test/api/v1/registry/register", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });

describe("registry authentication configuration", () => {
  it("uses the canonical token when configured", () => {
    restore("NODE_ENV", "production");
    process.env.COVENANT_REGISTRY_API_KEY = "canonical";
    process.env.CAPI_REGISTRY_TOKEN = "legacy";

    expect(checkRegistryAuth(request("canonical"))).toEqual({
      ok: true,
      authenticated: true,
      configurationError: false,
    });
    expect(checkRegistryAuth(request("legacy")).ok).toBe(false);
  });

  it("falls back to the legacy token only when the canonical variable is absent", () => {
    restore("NODE_ENV", "production");
    delete process.env.COVENANT_REGISTRY_API_KEY;
    process.env.CAPI_REGISTRY_TOKEN = "legacy";

    expect(checkRegistryAuth(request("legacy")).ok).toBe(true);
  });

  it("fails closed when the canonical variable is present but blank", () => {
    restore("NODE_ENV", "production");
    process.env.COVENANT_REGISTRY_API_KEY = "   ";
    process.env.CAPI_REGISTRY_TOKEN = "legacy";

    expect(checkRegistryAuth(request("legacy"))).toEqual({
      ok: false,
      authenticated: false,
      configurationError: true,
    });
  });
});
