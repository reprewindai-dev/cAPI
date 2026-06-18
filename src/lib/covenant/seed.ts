/**
 * Covenant seed fleet.
 *
 * A realistic set of agents, capabilities, three-tier policies, cost models,
 * and behavioral baselines — plus warm-up traffic so the ledger, trust scores,
 * and anomaly feed are alive on first load.
 */

import type { CovenantEngine } from "./engine";
import type {
  AgentIdentity,
  CapabilityIdentity,
  GovernanceTier,
  InferenceProvider,
  Policy,
} from "./types";

function allHours(): number[] {
  return Array.from({ length: 24 }, (_, i) => i);
}

function agent(
  engine: CovenantEngine,
  id: string,
  name: string,
  owner: string,
  provider: InferenceProvider,
  tier: GovernanceTier,
): AgentIdentity {
  const kp = engine.newKeyPair();
  engine.registerKey(id, kp.privateKeyB64);
  return {
    agent_id: id,
    agent_name: name,
    owner_id: owner,
    public_key: kp.publicKeyB64,
    capabilities_manifest: `ipfs://manifest/${id}`,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    identity_proof: `proof:${id}`,
    metadata: {
      version: "1.0.0",
      framework: "Veklom",
      inference_provider: provider,
      tier,
    },
  };
}

function capability(
  id: string,
  name: string,
  provider: string,
  endpoint: string,
  category: CapabilityIdentity["metadata"]["category"],
  cost: CapabilityIdentity["metadata"]["cost"],
  requires_approval: boolean,
  rate_limit: number,
): CapabilityIdentity {
  return {
    capability_id: id,
    capability_name: name,
    provider_id: provider,
    endpoint,
    input_schema: { type: "object" },
    output_schema: { type: "object" },
    public_key: "",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(),
    version: "1.0.0",
    identity_proof: `proof:${id}`,
    metadata: { category, requires_approval, cost, rate_limit },
  };
}

export function seedFleet(engine: CovenantEngine): void {
  const rt = engine.runtime;

  // ----- agents -----
  const atlas = agent(engine, "agent-atlas", "Atlas Orchestrator", "owner-acme", "claude", "service");
  const scout = agent(engine, "agent-scout", "Scout Researcher", "owner-acme", "gpt", "user");
  const ledger = agent(engine, "agent-ledger", "Ledger Payments", "owner-acme", "gemini", "service");
  const echo = agent(engine, "agent-echo", "Echo Support", "owner-acme", "llama", "user");
  const vector = agent(engine, "agent-vector", "Vector (untrusted)", "owner-acme", "other", "user");
  [atlas, scout, ledger, echo, vector].forEach((a) => rt.registerAgent(a));

  // ----- capabilities -----
  const caps: CapabilityIdentity[] = [
    capability("cap-search", "Web Search", "tavily", "http://tools/search", "tool", "free", false, 120),
    capability("cap-summarize", "Summarize", "local", "local://summarize", "tool", "free", false, 240),
    capability("cap-db-read", "Customer DB · Read", "postgres", "mcp://db/read", "database", "credits", false, 100),
    capability("cap-db-write", "Customer DB · Write", "postgres", "mcp://db/write", "database", "credits", true, 30),
    capability("cap-payment", "Issue Payment", "stripe", "http://pay/issue", "service", "payment", true, 20),
    capability("cap-email", "Send Email", "resend", "http://comms/email", "service", "credits", false, 60),
    capability("cap-purge", "Purge Records", "postgres", "mcp://db/purge", "database", "credits", true, 5),
  ];
  caps.forEach((c) => rt.registerCapability(c));

  // ----- policies (system → owner → runtime) -----
  const systemGuardrails: Policy = {
    policy_id: "pol-system-guardrails",
    policy_name: "System Guardrails",
    version: "2.0.0",
    tier: "system",
    created_by: "veklom",
    created_at: new Date().toISOString(),
    rules: [
      { rule_id: "sg-1", effect: "deny", principal: "*", action: "cap-purge", conditions: {} },
    ],
    metadata: { enforcement_mode: "strict", escalation_threshold: 100, audit_trail: true },
  };

  const ownerPayments: Policy = {
    policy_id: "pol-owner-payments",
    policy_name: "Payments Authority",
    version: "1.3.0",
    tier: "owner",
    created_by: "owner-acme",
    created_at: new Date().toISOString(),
    rules: [
      {
        rule_id: "op-1",
        effect: "allow",
        principal: "agent-ledger",
        action: "cap-payment",
        conditions: { trust_minimum: 70, requires_approval: true, approval_path: "human:cfo", rate_limit: 20 },
      },
    ],
    metadata: { enforcement_mode: "strict", escalation_threshold: 80, audit_trail: true },
  };

  const ownerData: Policy = {
    policy_id: "pol-owner-data",
    policy_name: "Data Access",
    version: "1.1.0",
    tier: "owner",
    created_by: "owner-acme",
    created_at: new Date().toISOString(),
    rules: [
      {
        rule_id: "od-1",
        effect: "allow",
        principal: "agent-atlas",
        action: "cap-db-write",
        conditions: { trust_minimum: 60, requires_approval: true, approval_path: "human:data-owner" },
      },
      {
        rule_id: "od-2",
        effect: "allow",
        principal: "*",
        action: "cap-db-read",
        conditions: { trust_minimum: 45, rate_limit: 100 },
      },
    ],
    metadata: { enforcement_mode: "strict", escalation_threshold: 90, audit_trail: true },
  };

  const runtimeDefaults: Policy = {
    policy_id: "pol-runtime-defaults",
    policy_name: "Runtime Defaults",
    version: "1.0.0",
    tier: "runtime",
    created_by: "covenant",
    created_at: new Date().toISOString(),
    rules: [
      {
        rule_id: "rd-1",
        effect: "allow",
        principal: "*",
        action: "cap-search|cap-summarize|cap-email",
        conditions: { trust_minimum: 30, rate_limit: 100 },
      },
      {
        rule_id: "rd-2",
        effect: "allow",
        principal: "agent-atlas",
        action: "cap-search|cap-summarize|cap-email|cap-db-read|cap-payment",
        conditions: { trust_minimum: 50 },
      },
    ],
    metadata: { enforcement_mode: "strict", escalation_threshold: 100, audit_trail: true },
  };

  [systemGuardrails, ownerPayments, ownerData, runtimeDefaults].forEach((p) => rt.registerPolicy(p));

  // ----- cost models + budgets -----
  rt.intelligence.registerCostModel({ capability_id: "cap-db-read", cost_per_call: 2, currency: "credits", budget_per_agent: 500, overage_policy: "deny" });
  rt.intelligence.registerCostModel({ capability_id: "cap-db-write", cost_per_call: 5, currency: "credits", budget_per_agent: 300, overage_policy: "escalate" });
  rt.intelligence.registerCostModel({ capability_id: "cap-payment", cost_per_call: 10, currency: "usd", budget_per_agent: 1000, overage_policy: "escalate" });
  rt.intelligence.registerCostModel({ capability_id: "cap-email", cost_per_call: 1, currency: "credits", budget_per_agent: 200, overage_policy: "deny" });

  // ----- behavioral baselines -----
  for (const a of [atlas, scout, ledger, echo]) {
    rt.safety.setBaseline({
      agent_id: a.agent_id,
      observation_window_days: 30,
      avg_requests_per_hour: 24,
      std_dev_requests_per_hour: 6,
      avg_failure_rate: 0.04,
      typical_capabilities: { "cap-search": 80, "cap-summarize": 60, "cap-db-read": 40, "cap-email": 25 },
      typical_time_windows: allHours(),
      confidence_score: 92,
      last_updated: new Date().toISOString(),
      is_locked: true,
    });
  }
  // Vector has a tight baseline so deviations are obvious.
  rt.safety.setBaseline({
    agent_id: vector.agent_id,
    observation_window_days: 12,
    avg_requests_per_hour: 3,
    std_dev_requests_per_hour: 1,
    avg_failure_rate: 0.02,
    typical_capabilities: { "cap-search": 10 },
    typical_time_windows: [9, 10, 11, 12, 13, 14, 15, 16, 17],
    confidence_score: 64,
    last_updated: new Date().toISOString(),
    is_locked: false,
  });

  // ----- warm-up traffic (real signed calls through the pipeline) -----
  const warm: Array<{ agent: string; cap: string; action: string; approvals?: string[] }> = [
    { agent: "agent-scout", cap: "cap-search", action: "query" },
    { agent: "agent-scout", cap: "cap-summarize", action: "run" },
    { agent: "agent-atlas", cap: "cap-db-read", action: "select" },
    { agent: "agent-atlas", cap: "cap-search", action: "query" },
    { agent: "agent-echo", cap: "cap-email", action: "send" },
    { agent: "agent-ledger", cap: "cap-payment", action: "issue", approvals: ["human:cfo"] },
    { agent: "agent-scout", cap: "cap-db-read", action: "select" },
    { agent: "agent-atlas", cap: "cap-summarize", action: "run" },
    { agent: "agent-echo", cap: "cap-search", action: "query" },
    { agent: "agent-ledger", cap: "cap-db-read", action: "select" },
  ];
  for (const w of warm) {
    engine.signAndProcess({ agent_id: w.agent, capability_id: w.cap, action: w.action, input: { q: "warm" }, approvals: w.approvals });
  }

  // A couple of denials/anomalies to populate the safety + audit views.
  engine.signAndProcess({ agent_id: "agent-vector", capability_id: "cap-purge", action: "purge", input: {} }); // system deny
  for (let i = 0; i < 14; i++) {
    engine.signAndProcess({ agent_id: "agent-vector", capability_id: "cap-search", action: "query", input: { i } });
  }
}
