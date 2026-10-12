import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildNetworkSnapshot, toBeaconKeys, toPackages, toVnp } from "./snapshot";

const PACKAGES = [
  {
    id: "veklom.governed-counter@v1",
    family: "sandbox",
    title: "Governed Counter",
    purpose: "Increment a counter.",
    reads: ["counter.read"],
    writes: ["counter.increment"],
    blocked: ["counter.reset"],
    outputs: ["counter.state"],
    policy_defaults: {},
    target_ref: "activation.governed-counter",
    requires_start_claim: false,
  },
  { family: "broken-without-id" },
];

describe("network snapshot mappers", () => {
  it("keeps only well-formed packages and their scope", () => {
    const out = toPackages(PACKAGES);
    expect(out).toHaveLength(1);
    expect(out?.[0]).toMatchObject({ id: "veklom.governed-counter@v1", writes: ["counter.increment"], blocked: ["counter.reset"] });
    expect(toPackages({ not: "an array" })).toBeUndefined();
  });

  it("maps VNP metrics without inventing values", () => {
    expect(toVnp({ proofState: "needs_proof", activeNodesCount: 0, expectedNodesCount: 5 })).toMatchObject({
      proof_state: "needs_proof",
      active_nodes: 0,
      expected_nodes: 5,
      active_validators: null,
    });
  });

  it("exposes only key ids and algorithms from the beacon key set", () => {
    const keys = toBeaconKeys({ issuer: "https://cappo.veklom.com", keys: [{ kid: "default", algorithm: "EdDSA", crv: "Ed25519", public_key: "x" }] });
    expect(keys).toEqual({ issuer: "https://cappo.veklom.com", keys: [{ kid: "default", algorithm: "EdDSA", curve: "Ed25519" }] });
  });
});

describe("buildNetworkSnapshot", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.CAPPO_BACKEND_URL = "https://cappo.test";
    process.env.PGL_LEDGER_URL = "https://pgl.test";
    delete process.env.LOCKERPHYCER_URL;
    delete process.env.LOCKERPHYCER_BACKEND_URL;
  });

  afterEach(() => {
    process.env = { ...original };
    vi.unstubAllGlobals();
  });

  it("reports each source's own state and never leaks dependency hosts", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/v1/capability/packages")) return Response.json(PACKAGES);
      if (url.endsWith("/v1/vnp/metrics")) return new Response("down", { status: 503 });
      if (url.endsWith("/.well-known/capability-beacon-keys")) return Response.json({ issuer: "i", keys: [] });
      if (url.endsWith("/health")) return Response.json({ status: "ok" });
      return new Response(null, { status: 404 });
    }));

    const snapshot = await buildNetworkSnapshot();
    expect(snapshot.packages.state).toBe("live");
    expect(snapshot.packages.data).toHaveLength(1);
    expect(snapshot.vnp).toEqual({ state: "unavailable", error: "HTTP 503" });
    expect(snapshot.beacon_keys.state).toBe("live");
    expect(snapshot.dependencies.cappo.state).toBe("healthy");
    expect(Object.keys(snapshot.dependencies).sort()).toEqual(["cappo", "lockerphycer", "pgl"]);
    expect(JSON.stringify(snapshot.dependencies)).not.toContain("cappo.test");
    expect(snapshot.mcp_tools.some((t) => t.name === "veklom_discover_capabilities" && t.public)).toBe(true);
    expect(snapshot.mcp_tools.some((t) => t.name === "veklom_mount_capability" && !t.public)).toBe(true);
  });

  it("marks CAPPO sources unconfigured instead of failing when CAPPO is not set", async () => {
    delete process.env.CAPPO_BACKEND_URL;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: "ok" })));
    const snapshot = await buildNetworkSnapshot();
    expect(snapshot.packages.state).toBe("unconfigured");
    expect(snapshot.vnp.state).toBe("unconfigured");
    expect(snapshot.dependencies.cappo.state).toBe("unconfigured");
  });
});

describe("buildNetworkSnapshot with a stalled service registry", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/covenant/engine");
    vi.resetModules();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("answers with the registry marked unavailable instead of hanging", async () => {
    vi.resetModules();
    vi.doMock("@/lib/covenant/engine", () => ({
      getEngine: () => ({
        services: { list: () => new Promise(() => {}), isStale: () => false },
        syncRegistry: () => new Promise(() => {}),
        registryStatus: () => ({ state: "degraded", source: "configured-registry", detail: "stalled", checked_at: "t" }),
      }),
    }));
    delete process.env.CAPPO_BACKEND_URL;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: "ok" })));
    vi.useFakeTimers();
    const { buildNetworkSnapshot: build } = await import("./snapshot");
    const pending = build();
    await vi.advanceTimersByTimeAsync(3_100);
    const snapshot = await pending;
    expect(snapshot.services).toEqual({ state: "unavailable", error: "service registry timeout" });
    expect(snapshot.registry?.detail).toBe("stalled");
  });
});
