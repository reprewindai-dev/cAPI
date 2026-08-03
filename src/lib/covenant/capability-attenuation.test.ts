import { describe, expect, it } from "vitest";
import { generateKeyPair } from "./crypto";
import {
  DelegationRegistry,
  hasCapability,
  validateAttenuation,
  type Capability,
} from "./capability-attenuation";

const supervisorCapabilities: Capability[] = [
  { resource: "invoice", action: "read" },
  { resource: "invoice", action: "approve", constraints: { max_amount: 100_000 } },
];

describe("capability attenuation", () => {
  it("accepts subsets and rejects escalation", () => {
    expect(validateAttenuation(supervisorCapabilities, [
      { resource: "invoice", action: "approve", constraints: { max_amount: 10_000 } },
    ]).valid).toBe(true);
    const result = validateAttenuation(supervisorCapabilities, [
      { resource: "payment", action: "execute" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.violations[0]).toContain("payment:execute");
  });

  it("creates and verifies a signed delegation", () => {
    const keys = generateKeyPair();
    const registry = new DelegationRegistry();
    registry.registerAgent("supervisor", keys.publicKeyB64);
    const result = registry.createDelegation({
      delegator_agent_id: "supervisor",
      delegator_private_key_b64: keys.privateKeyB64,
      delegatee_agent_id: "assistant",
      delegator_capabilities: supervisorCapabilities,
      granted_capabilities: [{ resource: "invoice", action: "read" }],
      audience: "https://finance.example",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      max_delegation_depth: 1,
      current_delegation_depth: 0,
      reason: "invoice review",
    });
    expect(result.delegation).not.toBeNull();
    expect(registry.verifyDelegation(result.delegation!)).toEqual({ valid: true });
  });

  it("checks granted, excluded, and constrained capabilities", () => {
    const auth = {
      delegation_id: "d",
      delegator_agent_id: "supervisor",
      delegatee_agent_id: "assistant",
      audience: "https://finance.example",
      granted_capabilities: supervisorCapabilities,
      excluded_capabilities: [{ resource: "invoice", action: "read" }],
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      max_delegation_depth: 1,
      current_delegation_depth: 0,
      reason: "test",
      delegator_signature: { algorithm: "Ed25519" as const, value: "signature" },
    };
    expect(hasCapability(auth, { resource: "invoice", action: "read" }).granted).toBe(false);
    expect(hasCapability(auth, {
      resource: "invoice",
      action: "approve",
      constraints: { max_amount: 200_000 },
    }).granted).toBe(false);
    expect(hasCapability(auth, { resource: "invoice", action: "approve" }).granted).toBe(true);
  });

  it("rejects expired delegations and cascades revocation downstream", () => {
    const keys = generateKeyPair();
    const registry = new DelegationRegistry();
    registry.registerAgent("supervisor", keys.publicKeyB64);
    const parent = registry.createDelegation({
      delegator_agent_id: "supervisor",
      delegator_private_key_b64: keys.privateKeyB64,
      delegatee_agent_id: "assistant",
      delegator_capabilities: supervisorCapabilities,
      granted_capabilities: [{ resource: "invoice", action: "read" }],
      audience: "https://finance.example",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      max_delegation_depth: 2,
      current_delegation_depth: 0,
      reason: "parent",
    }).delegation!;
    const downstream = registry.createDelegation({
      delegator_agent_id: "assistant",
      delegator_private_key_b64: keys.privateKeyB64,
      delegatee_agent_id: "worker",
      delegator_capabilities: [{ resource: "invoice", action: "read" }],
      granted_capabilities: [{ resource: "invoice", action: "read" }],
      audience: "https://finance.example",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      max_delegation_depth: 2,
      current_delegation_depth: 1,
      reason: "downstream",
    }).delegation!;
    registry.revokeDelegation(parent.delegation_id, "admin", "compromised");
    expect(registry.verifyDelegation(downstream).valid).toBe(false);
    const expired = { ...parent, revoked_at: undefined, expires_at: new Date(Date.now() - 1).toISOString() };
    expect(hasCapability(expired, { resource: "invoice", action: "read" }).reason).toBe("Delegation expired");
  });
});
