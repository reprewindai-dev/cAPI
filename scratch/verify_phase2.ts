import { CovenantRuntime } from "../src/lib/covenant/runtime";
import { generateKeyPair } from "../src/lib/covenant/crypto";
import { randomUUID } from "node:crypto";

async function run() {
  const runtime = new CovenantRuntime();
  
  // Register Agent
  const agentKeys = generateKeyPair();
  const agentId = "agent-alpha";
  runtime.registerAgent({
    agent_id: agentId,
    agent_name: "Alpha Agent",
    owner_id: "user-123",
    public_key: agentKeys.publicKeyB64,
    capabilities_manifest: "{}",
    created_at: new Date().toISOString(),
    identity_proof: "proof",
    metadata: {
      version: "1.0",
      framework: "custom",
      inference_provider: "llama",
      tier: "system"
    }
  });

  // Register Capability
  const capId = "cap-local";
  runtime.registerCapability({
    capability_id: capId,
    capability_name: "Local Capability",
    provider_id: "system",
    endpoint: "local://stub",
    input_schema: {},
    output_schema: {},
    public_key: "",
    created_at: new Date().toISOString(),
    version: "1.0",
    identity_proof: "",
    metadata: {
      category: "tool",
      requires_approval: false,
      cost: "free",
      rate_limit: 100
    }
  });

  // Register Policy
  runtime.registerPolicy({
    policy_id: "policy-1",
    policy_name: "Allow Local",
    version: "1.0",
    tier: "system",
    created_by: "admin",
    created_at: new Date().toISOString(),
    rules: [{
      rule_id: "r1",
      effect: "allow",
      principal: agentId,
      action: capId,
      conditions: {}
    }],
    metadata: {
      enforcement_mode: "strict",
      escalation_threshold: 0,
      audit_trail: true
    }
  });

  // Issue Delegation via capability-attenuation
  const delegatorKeys = generateKeyPair();
  runtime.governance.registry.registerAgent(agentId, delegatorKeys.publicKeyB64);
  
  const del = runtime.governance.registry.createDelegation({
    delegator_agent_id: agentId,
    delegator_private_key_b64: delegatorKeys.privateKeyB64,
    delegatee_agent_id: agentId,
    delegator_capabilities: [{ resource: capId, action: capId }],
    granted_capabilities: [{ resource: capId, action: capId }],
    audience: "all",
    expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    max_delegation_depth: 2,
    current_delegation_depth: 0,
    reason: "Test delegation"
  });
  console.log("Delegation created:", !!del.delegation);

  // Execute Request
  const req = {
    connection_id: randomUUID(),
    agent_id: agentId,
    agent_signature: "mock",
    capability_id: capId,
    action: capId,
    input: {},
    context: {},
    timestamp: new Date().toISOString()
  };
  
  // Actually we need a real agent signature for Phase 1
  const { canonicalRequestMessage, signMessage } = await import("../src/lib/covenant/crypto");
  const msg = canonicalRequestMessage(req);
  req.agent_signature = signMessage(msg, agentKeys.privateKeyB64);
  
  process.env.COVENANT_ALLOW_LOCAL_EXECUTION = "true";
  
  const res = await runtime.process(req);
  
  console.log("Phase 2 Test Result:");
  console.log(`Status: ${res.status}`);
  console.log(`Evidence Hash: ${res.evidence_hash}`);
  if (res.result) {
    console.log(`Receipt attached:`, !!res.result.output._receipt);
  }
}

run().catch(console.error);
