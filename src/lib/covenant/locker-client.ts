/**
 * Lockerphycer Integration Client for cAPI.
 * 
 * Fetches real agent identities, Ed25519 public keys, and governance policies
 * from the Sovereign AI Security Infrastructure (Lockerphycer).
 */

import type { AgentIdentity, Policy, CapabilityIdentity } from "./types";

const LOCKERPHYCER_URL = process.env.LOCKERPHYCER_URL || "http://lockerphycer-api:8092";

// Memory cache for zero-latency lookups on the edge
const agentCache = new Map<string, { identity: AgentIdentity; expiresAt: number }>();
const policyCache = new Map<string, { policy: Policy; expiresAt: number }>();
const CACHE_TTL_MS = 60000; // 1 minute cache for performance

export class LockerphycerClient {
  
  static async getAgentIdentity(agent_id: string): Promise<AgentIdentity | null> {
    const cached = agentCache.get(agent_id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.identity;
    }

    try {
      // Direct integration with Lockerphycer API
      const res = await fetch(`${LOCKERPHYCER_URL}/api/v1/agents/${agent_id}`, {
        headers: { "x-internal-token": process.env.LOCKERPHYCER_INTERNAL_TOKEN || "" }
      });
      
      if (!res.ok) return null;
      
      const identity: AgentIdentity = await res.json();
      agentCache.set(agent_id, { identity, expiresAt: Date.now() + CACHE_TTL_MS });
      
      return identity;
    } catch (e) {
      console.error(`[Lockerphycer] Failed to fetch agent ${agent_id}:`, e);
      return null;
    }
  }

  static async getPolicy(policy_id: string): Promise<Policy | null> {
    const cached = policyCache.get(policy_id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.policy;
    }

    try {
      const res = await fetch(`${LOCKERPHYCER_URL}/api/v1/policies/${policy_id}`, {
        headers: { "x-internal-token": process.env.LOCKERPHYCER_INTERNAL_TOKEN || "" }
      });
      
      if (!res.ok) return null;
      
      const policy: Policy = await res.json();
      policyCache.set(policy_id, { policy, expiresAt: Date.now() + CACHE_TTL_MS });
      
      return policy;
    } catch (e) {
      console.error(`[Lockerphycer] Failed to fetch policy ${policy_id}:`, e);
      return null;
    }
  }

  static async registerAuditRecord(record: any): Promise<boolean> {
    try {
      const res = await fetch(`${LOCKERPHYCER_URL}/api/v1/audit/covenant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-token": process.env.LOCKERPHYCER_INTERNAL_TOKEN || ""
        },
        body: JSON.stringify(record)
      });
      return res.ok;
    } catch (e) {
      console.error(`[Lockerphycer] Failed to forward audit record:`, e);
      return false;
    }
  }
}
