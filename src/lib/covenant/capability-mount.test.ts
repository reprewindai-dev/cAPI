import { describe, expect, it } from "vitest";
import { getEngine } from "./engine";
import {
  CapabilityMountRegistry,
  getMountRegistry,
  mapMountDecision,
} from "./capability-mount";
import type { CapabilityIdentity, EffectivePermissions } from "./types";

const permissions = (
  overrides: Partial<Pick<
    EffectivePermissions,
    "can_execute" | "requires_approval" | "approval_path" | "trust_required" | "trust_current"
  >> = {},
): Pick<
  EffectivePermissions,
  "can_execute" | "requires_approval" | "approval_path" | "trust_required" | "trust_current"
> => ({
  can_execute: true,
  requires_approval: false,
  approval_path: [],
  trust_required: 0,
  trust_current: 80,
  ...overrides,
});

function capability(id: string): CapabilityIdentity {
  return {
    capability_id: id,
    capability_name: `Capability ${id}`,
    description: "Test capability",
    provider_id: "provider-test",
    endpoint: "http://provider.test/capability",
    input_schema: { type: "object" },
    output_schema: { type: "object" },
    public_key: "",
    created_at: new Date().toISOString(),
    version: "1.0.0",
    identity_proof: `test:${id}`,
    metadata: {
      category: "tool",
      requires_approval: false,
      cost: "free",
      rate_limit: 10,
      tags: ["test"],
    },
  };
}

describe("mapMountDecision", () => {
  it("applies fail-closed decision precedence", () => {
    expect(mapMountDecision({
      permissions: permissions({ can_execute: false, requires_approval: true }),
      safetyBlocking: true,
      affordable: false,
      lane: 3,
      authority: "CAPPO",
    })).toEqual({
      decision: "QUARANTINE",
      reasons: ["safety_anomaly_block", "execution_requires_safety_review"],
    });
    expect(mapMountDecision({
      permissions: permissions({ can_execute: false }),
      safetyBlocking: false,
      affordable: true,
      lane: 1,
      authority: "NONE",
    }).decision).toBe("DENY");
    expect(mapMountDecision({
      permissions: permissions(),
      safetyBlocking: false,
      affordable: false,
      lane: 1,
      authority: "NONE",
    }).decision).toBe("DENY");
    expect(mapMountDecision({
      permissions: permissions({ requires_approval: true }),
      safetyBlocking: false,
      affordable: true,
      lane: 3,
      authority: "NONE",
    }).decision).toBe("HOLD");
    expect(mapMountDecision({
      permissions: permissions(),
      safetyBlocking: false,
      affordable: true,
      lane: 1,
      authority: "CAPPO",
    }).decision).toBe("HOLD");
    expect(mapMountDecision({
      permissions: permissions({ requires_approval: true, approval_path: ["owner"] }),
      safetyBlocking: false,
      affordable: true,
      lane: 1,
      authority: "NONE",
    }).decision).toBe("REQUIRE_APPROVAL");
    expect(mapMountDecision({
      permissions: permissions(),
      safetyBlocking: false,
      affordable: true,
      lane: 1,
      authority: "NONE",
    })).toEqual({ decision: "ALLOW", reasons: ["permitted"] });
  });
});

describe("CapabilityMountRegistry", () => {
  it("registers, derives protocol, persists versions, and indexes capabilities", () => {
    const registry = new CapabilityMountRegistry();
    const id = `mount-${crypto.randomUUID()}`;
    const cap = capability(`cap-${crypto.randomUUID()}`);
    const before = registry.graphVersion;
    const mount = registry.register({ mount_id: id, capability: cap });

    expect(mount.protocol).toBe("http");
    expect(mount.mount_version).toBe(before + 1);
    expect(registry.graphVersion).toBe(before + 1);
    expect(registry.get(id)).toEqual(mount);
    expect(registry.getByCapabilityId(cap.capability_id)).toEqual(mount);
    expect(registry.all()).toContainEqual(mount);
    expect(getEngine().runtime.capabilities.get(cap.capability_id)).toEqual(cap);
  });

  it("excludes expired mounts unless explicitly requested", () => {
    const registry = getMountRegistry();
    const id = `expired-${crypto.randomUUID()}`;
    registry.register({
      mount_id: id,
      capability: capability(`cap-${crypto.randomUUID()}`),
      discovery: { expires_at: new Date(Date.now() - 1000).toISOString() },
    });

    expect(registry.list().some((mount) => mount.mount_id === id)).toBe(false);
    expect(registry.list({ includeExpired: true }).some((mount) => mount.mount_id === id)).toBe(true);
  });

  it("rejects invalid registration input", () => {
    const registry = new CapabilityMountRegistry();
    expect(() => registry.register({
      mount_id: "",
      capability: capability("invalid"),
    })).toThrow("mount_id is required");
    expect(() => registry.register({
      mount_id: "invalid-lane",
      capability: capability("invalid-lane-cap"),
      lane: 4 as 1,
    })).toThrow("lane must be one of 1, 2, or 3");
  });

  it("returns a decision envelope without mutating an existing trust score", () => {
    const registry = getMountRegistry();
    const engine = getEngine();
    const agentId = `agent-${crypto.randomUUID()}`;
    const mount = registry.register({
      mount_id: `authorize-${crypto.randomUUID()}`,
      capability: capability(`authorize-cap-${crypto.randomUUID()}`),
    });
    const before = engine.runtime.getTrust(agentId);
    const beforeScore = before?.score;
    const envelope = registry.authorize(agentId, mount.mount_id);

    expect(["ALLOW", "DENY", "HOLD", "REQUIRE_APPROVAL", "QUARANTINE"]).toContain(envelope.decision);
    expect(() => new Date(envelope.evaluated_at).toISOString()).not.toThrow();
    expect(() => new Date(envelope.expires_at).toISOString()).not.toThrow();
    expect(engine.runtime.getTrust(agentId)?.score).toBe(beforeScore);
  });
});
