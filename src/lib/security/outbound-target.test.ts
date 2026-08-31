import { describe, expect, it } from "vitest";
import { validateOutboundTarget, validateOutboundTargetWithAddresses } from "./outbound-target";

const publicResolver = async () => ["93.184.216.34"];

describe("validateOutboundTarget", () => {
  it("accepts an explicitly allowlisted public HTTPS host", async () => {
    const url = await validateOutboundTarget("https://api.example.com/v1", {
      production: true,
      allowedHosts: ["api.example.com"],
      resolver: publicResolver,
    });
    expect(url.hostname).toBe("api.example.com");
  });

  it("returns the exact vetted DNS answers for socket pinning", async () => {
    const validated = await validateOutboundTargetWithAddresses("https://api.example.com/v1", {
      production: true,
      allowedHosts: ["api.example.com"],
      resolver: async () => ["93.184.216.34", "93.184.216.35"],
    });

    expect(validated.url.hostname).toBe("api.example.com");
    expect(validated.addresses).toEqual(["93.184.216.34", "93.184.216.35"]);
    expect(Object.isFrozen(validated.addresses)).toBe(true);
  });

  it("fails closed in production when no host allowlist is configured", async () => {
    await expect(validateOutboundTarget("https://api.example.com", {
      production: true,
      allowedHosts: [],
      resolver: publicResolver,
    })).rejects.toMatchObject({ code: "OUTBOUND_ALLOWLIST_UNCONFIGURED" });
  });

  it.each([
    "http://127.0.0.1:8080",
    "http://169.254.169.254/latest/meta-data",
    "http://10.1.2.3",
    "http://192.168.1.2",
    "http://[::1]/",
    "http://[fec0::1]/",
  ])("rejects local or private literal address %s", async (target) => {
    await expect(validateOutboundTarget(target, {
      production: false,
      allowedHosts: [],
    })).rejects.toMatchObject({ code: "OUTBOUND_ADDRESS_FORBIDDEN" });
  });

  it("does not reject the entire public 192.0/16 range", async () => {
    const url = await validateOutboundTarget("http://192.0.10.1/", {
      production: false,
      allowedHosts: [],
    });
    expect(url.hostname).toBe("192.0.10.1");
  });

  it("rejects a public-looking hostname that resolves to a private address", async () => {
    await expect(validateOutboundTarget("https://api.example.com", {
      production: true,
      allowedHosts: ["api.example.com"],
      resolver: async () => ["10.0.0.8"],
    })).rejects.toMatchObject({ code: "OUTBOUND_ADDRESS_FORBIDDEN" });
  });

  it("fails closed when DNS resolution exceeds its deadline", async () => {
    await expect(validateOutboundTarget("https://api.example.com", {
      production: true,
      allowedHosts: ["api.example.com"],
      resolver: () => new Promise<string[]>(() => undefined),
      resolverTimeoutMs: 5,
    })).rejects.toMatchObject({ code: "OUTBOUND_DNS_TIMEOUT" });
  });

  it("rejects non-allowlisted hosts", async () => {
    await expect(validateOutboundTarget("https://other.example.com", {
      production: true,
      allowedHosts: ["api.example.com"],
      resolver: publicResolver,
    })).rejects.toMatchObject({ code: "OUTBOUND_HOST_NOT_ALLOWLISTED" });
  });

  it.each([
    "file:///etc/passwd",
    "https://user:pass@api.example.com/",
    "https://api.example.com/#fragment",
    "http://localhost:3000/",
  ])("rejects unsafe URL form %s", async (target) => {
    await expect(validateOutboundTarget(target, {
      production: false,
      allowedHosts: [],
      resolver: publicResolver,
    })).rejects.toBeTruthy();
  });
});
