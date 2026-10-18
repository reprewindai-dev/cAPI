import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { timingSafeEqual } from "crypto";
import { checkRegistryAuth } from "./registry-auth";

vi.mock("crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("crypto")>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_TOKEN = process.env.CAPI_REGISTRY_TOKEN;
const ORIGINAL_CANONICAL = process.env.COVENANT_REGISTRY_API_KEY;
const mutableEnv = process.env as Record<string, string | undefined>;

const restore = (name: string, value: string | undefined) => {
  if (value === undefined) delete mutableEnv[name];
  else mutableEnv[name] = value;
};

function withBearer(token: string | undefined) {
  return new Request("http://localhost/api/v1/registry/register", {
    method: "POST",
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

beforeEach(() => {
  vi.mocked(timingSafeEqual).mockClear();
  mutableEnv.NODE_ENV = "production";
  delete process.env.COVENANT_REGISTRY_API_KEY;
  process.env.CAPI_REGISTRY_TOKEN = "registry-secret";
});

afterEach(() => {
  restore("CAPI_REGISTRY_TOKEN", ORIGINAL_TOKEN);
  restore("COVENANT_REGISTRY_API_KEY", ORIGINAL_CANONICAL);
  restore("NODE_ENV", ORIGINAL_NODE_ENV);
});

describe("checkRegistryAuth", () => {
  it("compares an equal-length bearer with timingSafeEqual", () => {
    expect(checkRegistryAuth(withBearer("registry-secret")).ok).toBe(true);
    expect(checkRegistryAuth(withBearer("registry-secreX")).ok).toBe(false);
    expect(vi.mocked(timingSafeEqual)).toHaveBeenCalledTimes(2);
  });

  it("treats a length mismatch as a mismatch without throwing", () => {
    expect(checkRegistryAuth(withBearer("registry-secret-longer")).ok).toBe(false);
    expect(checkRegistryAuth(withBearer("short")).ok).toBe(false);
    expect(checkRegistryAuth(withBearer(undefined)).ok).toBe(false);
    expect(vi.mocked(timingSafeEqual)).not.toHaveBeenCalled();
  });
});

describe("registry authentication configuration", () => {
  it("uses the canonical token when configured", () => {
    process.env.COVENANT_REGISTRY_API_KEY = "canonical";
    process.env.CAPI_REGISTRY_TOKEN = "legacy";

    expect(checkRegistryAuth(withBearer("canonical"))).toEqual({
      ok: true,
      authenticated: true,
      configurationError: false,
    });
    expect(checkRegistryAuth(withBearer("legacy")).ok).toBe(false);
  });

  it("falls back to the legacy token only when the canonical variable is absent", () => {
    delete process.env.COVENANT_REGISTRY_API_KEY;
    process.env.CAPI_REGISTRY_TOKEN = "legacy";

    expect(checkRegistryAuth(withBearer("legacy")).ok).toBe(true);
  });

  it("fails closed when the canonical variable is present but blank", () => {
    process.env.COVENANT_REGISTRY_API_KEY = "   ";
    process.env.CAPI_REGISTRY_TOKEN = "legacy";

    expect(checkRegistryAuth(withBearer("legacy"))).toEqual({
      ok: false,
      authenticated: false,
      configurationError: true,
    });
  });
});
