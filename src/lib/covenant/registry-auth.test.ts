import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { timingSafeEqual } from "crypto";
import { checkRegistryAuth } from "./registry-auth";

vi.mock("crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("crypto")>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_TOKEN = process.env.CAPI_REGISTRY_TOKEN;
const mutableEnv = process.env as Record<string, string | undefined>;

function withBearer(token: string | undefined) {
  return new Request("http://localhost/api/v1/registry/register", {
    method: "POST",
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

beforeEach(() => {
  vi.mocked(timingSafeEqual).mockClear();
  mutableEnv.NODE_ENV = "production";
  process.env.CAPI_REGISTRY_TOKEN = "registry-secret";
});

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.CAPI_REGISTRY_TOKEN;
  else process.env.CAPI_REGISTRY_TOKEN = ORIGINAL_TOKEN;
  if (ORIGINAL_NODE_ENV === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = ORIGINAL_NODE_ENV;
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
