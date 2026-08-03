/**
 * Explicit capability attenuation for delegated agent authority.
 *
 * Delegations are signed by the delegator and constrain audience, expiry,
 * capability scope, and delegation depth. Keys and signatures use the same
 * base64 DER representation as the Covenant crypto primitives.
 */

import { randomUUID } from "node:crypto";
import { canonicalEncode } from "./evidence-standard";
import { sha256, signMessage, verifyMessage } from "./crypto";

export interface CapabilityConstraints {
  max_amount?: number;
  time_window?: {
    start_hour?: number;
    end_hour?: number;
    timezone?: string;
  };
  rate_limit?: {
    per_minute?: number;
    per_hour?: number;
    per_day?: number;
  };
}

export interface Capability {
  resource: string;
  action: string;
  constraints?: CapabilityConstraints;
}

export interface DelegatedAuthority {
  delegation_id: string;
  delegator_agent_id: string;
  delegatee_agent_id: string;
  audience: string;
  granted_capabilities: Capability[];
  excluded_capabilities?: Capability[];
  issued_at: string;
  expires_at: string;
  max_delegation_depth: number;
  current_delegation_depth: number;
  revoked_at?: string;
  revoked_by?: string;
  revocation_reason?: string;
  delegator_signature: {
    algorithm: "Ed25519";
    value: string;
  };
  reason: string;
  metadata?: Record<string, unknown>;
}

interface UnsignedDelegation {
  delegation_id: string;
  delegator_agent_id: string;
  delegatee_agent_id: string;
  audience: string;
  granted_capabilities: Capability[];
  excluded_capabilities?: Capability[];
  issued_at: string;
  expires_at: string;
  max_delegation_depth: number;
  current_delegation_depth: number;
  reason: string;
}

function unsignedDelegation(delegation: DelegatedAuthority): UnsignedDelegation {
  return {
    delegation_id: delegation.delegation_id,
    delegator_agent_id: delegation.delegator_agent_id,
    delegatee_agent_id: delegation.delegatee_agent_id,
    audience: delegation.audience,
    granted_capabilities: delegation.granted_capabilities,
    ...(delegation.excluded_capabilities === undefined
      ? {}
      : { excluded_capabilities: delegation.excluded_capabilities }),
    issued_at: delegation.issued_at,
    expires_at: delegation.expires_at,
    max_delegation_depth: delegation.max_delegation_depth,
    current_delegation_depth: delegation.current_delegation_depth,
    reason: delegation.reason,
  };
}

function capabilityMatches(left: Capability, right: Capability): boolean {
  return left.resource === right.resource && left.action === right.action;
}

export function hasCapability(
  auth: DelegatedAuthority,
  required: Capability,
): { granted: boolean; reason?: string } {
  const expires = new Date(auth.expires_at).getTime();
  if (!Number.isFinite(expires) || Date.now() > expires) {
    return { granted: false, reason: "Delegation expired" };
  }
  if (auth.revoked_at) {
    return { granted: false, reason: "Delegation revoked" };
  }
  if (auth.excluded_capabilities?.some((capability) => capabilityMatches(capability, required))) {
    return {
      granted: false,
      reason: `Capability ${required.resource}:${required.action} is explicitly excluded`,
    };
  }

  const granted = auth.granted_capabilities.find((capability) =>
    capabilityMatches(capability, required),
  );
  if (!granted) {
    return {
      granted: false,
      reason: `Capability ${required.resource}:${required.action} not in delegation`,
    };
  }

  const requestedAmount = required.constraints?.max_amount;
  const grantedAmount = granted.constraints?.max_amount;
  if (
    requestedAmount !== undefined &&
    grantedAmount !== undefined &&
    requestedAmount > grantedAmount
  ) {
    return {
      granted: false,
      reason: `Amount ${requestedAmount} exceeds max ${grantedAmount}`,
    };
  }
  return { granted: true };
}

export function validateAttenuation(
  delegatorCapabilities: Capability[],
  delegateeCapabilities: Capability[],
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  for (const delegateeCapability of delegateeCapabilities) {
    const delegatorCapability = delegatorCapabilities.find((capability) =>
      capabilityMatches(capability, delegateeCapability),
    );
    if (!delegatorCapability) {
      violations.push(
        `Delegatee granted ${delegateeCapability.resource}:${delegateeCapability.action} that delegator doesn't have`,
      );
      continue;
    }

    const delegateeAmount = delegateeCapability.constraints?.max_amount;
    const delegatorAmount = delegatorCapability.constraints?.max_amount;
    if (
      delegateeAmount !== undefined &&
      delegatorAmount !== undefined &&
      delegateeAmount > delegatorAmount
    ) {
      violations.push(
        `Delegatee max_amount ${delegateeAmount} exceeds delegator max_amount ${delegatorAmount}`,
      );
    }
  }
  return { valid: violations.length === 0, violations };
}

export class DelegationRegistry {
  private readonly delegations = new Map<string, DelegatedAuthority>();
  private readonly delegatorKeys = new Map<string, string>();

  registerAgent(agentId: string, publicKeyB64: string): void {
    this.delegatorKeys.set(agentId, publicKeyB64);
  }

  createDelegation(params: {
    delegator_agent_id: string;
    delegator_private_key_b64: string;
    delegatee_agent_id: string;
    delegator_capabilities: Capability[];
    granted_capabilities: Capability[];
    excluded_capabilities?: Capability[];
    audience: string;
    expires_at: string;
    max_delegation_depth: number;
    current_delegation_depth: number;
    reason: string;
    metadata?: Record<string, unknown>;
  }): { delegation: DelegatedAuthority | null; error?: string } {
    const expiresAt = new Date(params.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return { delegation: null, error: "Expiry time is in the past" };
    }
    const attenuation = validateAttenuation(
      params.delegator_capabilities,
      params.granted_capabilities,
    );
    if (!attenuation.valid) {
      return {
        delegation: null,
        error: `Attenuation validation failed: ${attenuation.violations.join("; ")}`,
      };
    }
    if (
      params.current_delegation_depth < 0 ||
      params.max_delegation_depth < 0 ||
      params.current_delegation_depth >= params.max_delegation_depth
    ) {
      return {
        delegation: null,
        error: `Delegation depth ${params.current_delegation_depth} exceeds max ${params.max_delegation_depth}`,
      };
    }

    const unsigned: UnsignedDelegation = {
      delegation_id: randomUUID(),
      delegator_agent_id: params.delegator_agent_id,
      delegatee_agent_id: params.delegatee_agent_id,
      audience: params.audience,
      granted_capabilities: params.granted_capabilities,
      ...(params.excluded_capabilities === undefined
        ? {}
        : { excluded_capabilities: params.excluded_capabilities }),
      issued_at: new Date().toISOString(),
      expires_at: params.expires_at,
      max_delegation_depth: params.max_delegation_depth,
      current_delegation_depth: params.current_delegation_depth,
      reason: params.reason,
    };
    const signature = signMessage(
      Buffer.from(canonicalEncode(unsigned), "utf8"),
      params.delegator_private_key_b64,
    );
    const delegation: DelegatedAuthority = {
      ...unsigned,
      ...(params.metadata === undefined ? {} : { metadata: params.metadata }),
      delegator_signature: { algorithm: "Ed25519", value: signature },
    };
    this.delegations.set(delegation.delegation_id, delegation);
    return { delegation };
  }

  verifyDelegation(delegation: DelegatedAuthority): { valid: boolean; reason?: string } {
    const expiresAt = new Date(delegation.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
      return { valid: false, reason: "Delegation expired" };
    }
    if (delegation.revoked_at) {
      return { valid: false, reason: "Delegation revoked" };
    }
    if (delegation.delegator_signature.algorithm !== "Ed25519") {
      return { valid: false, reason: "Unsupported signature algorithm" };
    }
    const publicKeyB64 = this.delegatorKeys.get(delegation.delegator_agent_id);
    if (!publicKeyB64) {
      return { valid: false, reason: "Delegator public key not found" };
    }
    return verifyMessage(
      Buffer.from(canonicalEncode(unsignedDelegation(delegation)), "utf8"),
      delegation.delegator_signature.value,
      publicKeyB64,
    )
      ? { valid: true }
      : { valid: false, reason: "Signature verification failed" };
  }

  revokeDelegation(delegationId: string, revokedBy: string, reason: string): void {
    const delegation = this.delegations.get(delegationId);
    if (!delegation || delegation.revoked_at) return;
    delegation.revoked_at = new Date().toISOString();
    delegation.revoked_by = revokedBy;
    delegation.revocation_reason = reason;
    for (const downstream of this.delegations.values()) {
      if (downstream.delegator_agent_id === delegation.delegatee_agent_id) {
        this.revokeDelegation(downstream.delegation_id, revokedBy, `Cascaded from ${delegationId}`);
      }
    }
  }

  getEffectiveCapabilities(
    agentId: string,
    audience: string,
    baseCapabilities: Capability[],
  ): Capability[] {
    const effective = [...baseCapabilities];
    for (const delegation of this.delegations.values()) {
      if (
        delegation.delegatee_agent_id === agentId &&
        delegation.audience === audience &&
        !delegation.revoked_at &&
        Date.now() <= new Date(delegation.expires_at).getTime()
      ) {
        effective.push(...delegation.granted_capabilities);
      }
    }
    return effective;
  }

  queryDelegationsForAgent(agentId: string): DelegatedAuthority[] {
    return Array.from(this.delegations.values()).filter(
      (delegation) => delegation.delegatee_agent_id === agentId,
    );
  }
}
