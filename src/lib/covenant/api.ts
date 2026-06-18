/**
 * Snapshot + discovery helpers — turn live engine state into the shapes the UI
 * consumes. Everything here is plain-serializable.
 */

import { getEngine } from "./engine";
import type {
  AgentIdentity,
  CapabilityIdentity,
  CostAllocationRecord,
  Decision,
  EffectivePermissions,
  Evidence,
  Policy,
  RiskProfile,
  TrustScore,
} from "./types";

export interface AgentView {
  identity: AgentIdentity;
  trust: TrustScore | undefined;
  risk: RiskProfile;
  spend: number;
  suspended: boolean;
}

export interface PolicyView {
  policy: Policy;
  enabled: boolean;
}

export interface Metrics {
  total: number;
  authorized: number;
  denied: number;
  quarantined: number;
  errored: number;
  agents: number;
  capabilities: number;
  anomalies: number;
  quarantine_open: number;
  authorized_rate: number;
}

export interface Snapshot {
  metrics: Metrics;
  agents: AgentView[];
  capabilities: CapabilityIdentity[];
  policies: PolicyView[];
  audit: Evidence[];
  anomalies: ReturnType<ReturnType<typeof getEngine>["runtime"]["safety"]["listAnomalies"]>;
  quarantine: ReturnType<ReturnType<typeof getEngine>["runtime"]["safety"]["listQuarantine"]>;
  cost: CostAllocationRecord[];
}

export function buildAgentView(agent_id: string): AgentView | undefined {
  const engine = getEngine();
  const rt = engine.runtime;
  const identity = rt.agents.get(agent_id);
  if (!identity) return undefined;
  const trust = rt.getTrust(agent_id);
  const anomalies = rt.safety.listAnomalies(200).filter((a) => a.agent_id === agent_id);
  const spend = rt.intelligence.totalSpend(agent_id);
  const risk = rt.intelligence.assessRisk(trust, anomalies.slice(0, 10), spend, 1000);
  return { identity, trust, risk, spend, suspended: rt.suspended.has(agent_id) };
}

export function buildSnapshot(): Snapshot {
  const engine = getEngine();
  const rt = engine.runtime;
  const audit = rt.getAuditLog(200);

  const count = (s: Decision): number =>
    audit.filter((e) => e.result.status === s).length;
  const authorized = count("authorized");
  const denied = count("denied");
  const quarantined = count("quarantined");
  const errored = count("error");
  const total = audit.length;

  const agents = [...rt.agents.keys()]
    .map((id) => buildAgentView(id))
    .filter((v): v is AgentView => Boolean(v));

  const quarantine = rt.safety.listQuarantine();

  return {
    metrics: {
      total,
      authorized,
      denied,
      quarantined,
      errored,
      agents: rt.agents.size,
      capabilities: rt.capabilities.size,
      anomalies: rt.safety.listAnomalies(500).length,
      quarantine_open: quarantine.filter((q) => q.status === "quarantined").length,
      authorized_rate: total ? Math.round((authorized / total) * 100) : 0,
    },
    agents,
    capabilities: [...rt.capabilities.values()],
    policies: rt.listPoliciesWithState(),
    audit,
    anomalies: rt.safety.listAnomalies(60),
    quarantine,
    cost: rt.intelligence.listRecords(60),
  };
}

export interface DiscoveredCapability {
  capability: CapabilityIdentity;
  permissions: EffectivePermissions;
}

export function composeFor(agent_id: string, capability_id: string) {
  const engine = getEngine();
  const rt = engine.runtime;
  const trust = rt.getTrust(agent_id);
  const delegation = rt.governance.getDelegation(agent_id, capability_id);
  return rt.governance.effectivePermissions(
    rt.activePolicies(),
    agent_id,
    capability_id,
    trust,
    delegation?.depth ?? 0,
  );
}

/** Capability discovery for an agent — "what can I do, right now?" */
export function discover(agent_id: string): DiscoveredCapability[] {
  const engine = getEngine();
  const rt = engine.runtime;
  const trust = rt.getTrust(agent_id);
  return [...rt.capabilities.values()].map((capability) => {
    const delegation = rt.governance.getDelegation(agent_id, capability.capability_id);
    const { permissions } = rt.governance.effectivePermissions(
      rt.activePolicies(),
      agent_id,
      capability.capability_id,
      trust,
      delegation?.depth ?? 0,
    );
    return { capability, permissions };
  });
}
