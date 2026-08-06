import { expect, test, describe } from "vitest";
import { CovenantRuntime } from "../src/lib/covenant/runtime";
import { generateKeyPair, signMessage, canonicalRequestMessage } from "../src/lib/covenant/crypto";
import { resolveSigningKeyPair } from "../src/lib/covenant/evidence-standard";

describe("Covenant Phase 2 - Execution Boundary & Cryptography", () => {
  test("Runtime initialization fails closed if production keys are missing", () => {
    // Save original env
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.COVENANT_EVIDENCE_SIGNING_KEY;
    const originalKeyId = process.env.COVENANT_EVIDENCE_KEY_ID;

    try {
      process.env.NODE_ENV = "production";
      process.env.COVENANT_EVIDENCE_SIGNING_KEY = "";
      process.env.COVENANT_EVIDENCE_KEY_ID = "";

      expect(() => {
        // Force evaluation of resolveSigningKeyPair via Runtime
        resolveSigningKeyPair();
      }).toThrow(/COVENANT_EVIDENCE_SIGNING_KEY and COVENANT_EVIDENCE_KEY_ID are required in production/);
      
      expect(() => {
        new CovenantRuntime();
      }).toThrow(/COVENANT_EVIDENCE_SIGNING_KEY and COVENANT_EVIDENCE_KEY_ID are required in production/);
    } finally {
      if (originalEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalEnv;
      if (originalKey === undefined) delete process.env.COVENANT_EVIDENCE_SIGNING_KEY; else process.env.COVENANT_EVIDENCE_SIGNING_KEY = originalKey;
      if (originalKeyId === undefined) delete process.env.COVENANT_EVIDENCE_KEY_ID; else process.env.COVENANT_EVIDENCE_KEY_ID = originalKeyId;
    }
  });

  test("Runtime in development allows ephemeral keys", () => {
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.COVENANT_EVIDENCE_SIGNING_KEY;
    const originalKeyId = process.env.COVENANT_EVIDENCE_KEY_ID;

    try {
      process.env.NODE_ENV = "development";
      delete process.env.COVENANT_EVIDENCE_SIGNING_KEY;
      delete process.env.COVENANT_EVIDENCE_KEY_ID;

      const runtime = new CovenantRuntime();
      expect(runtime).toBeDefined();
      expect(runtime.intermediary).toBeDefined();
    } finally {
      if (originalEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalEnv;
      if (originalKey === undefined) delete process.env.COVENANT_EVIDENCE_SIGNING_KEY; else process.env.COVENANT_EVIDENCE_SIGNING_KEY = originalKey;
      if (originalKeyId === undefined) delete process.env.COVENANT_EVIDENCE_KEY_ID; else process.env.COVENANT_EVIDENCE_KEY_ID = originalKeyId;
    }
  });

  test("Denied requests generate authoritative denial receipts but NOT execution evidence", async () => {
    const runtime = new CovenantRuntime();
    const agentKeys = generateKeyPair();

    runtime.registerAgent({
      agent_id: "test-agent-1",
      agent_name: "Test Agent",
      owner_id: "owner-1",
      public_key: agentKeys.publicKeyB64,
      capabilities_manifest: "none",
      created_at: new Date().toISOString(),
      identity_proof: "proof",
      metadata: { version: "1.0", framework: "test", inference_provider: "other", tier: "service" },
    });

    runtime.registerCapability({
      capability_id: "test-cap",
      capability_name: "Test Cap",
      provider_id: "test",
      endpoint: "local://test",
      input_schema: {},
      output_schema: {},
      public_key: generateKeyPair().publicKeyB64,
      created_at: new Date().toISOString(),
      version: "1.0",
      identity_proof: "proof",
      metadata: { category: "tool", requires_approval: false, cost: "free", rate_limit: 100 },
    });

    // Policy that denies everything
    runtime.registerPolicy({
      policy_id: "deny-policy",
      policy_name: "Deny All",
      version: "1",
      tier: "system",
      created_by: "system",
      created_at: new Date().toISOString(),
      rules: [{
        rule_id: "rule1",
        effect: "deny",
        principal: "*",
        action: "*",
        conditions: {}
      }],
      metadata: { enforcement_mode: "strict", escalation_threshold: 0, audit_trail: true }
    });

    const requestObj = {
      connection_id: "conn-1",
      agent_id: "test-agent-1",
      capability_id: "test-cap",
      action: "doSomething",
      input: {},
      context: {},
      timestamp: new Date().toISOString()
    };
    
    const message = canonicalRequestMessage(requestObj as any);
    const request = {
      ...requestObj,
      agent_signature: signMessage(message, agentKeys.privateKeyB64)
    };

    const res = await runtime.process(request);
    
    // The response should return an evidence hash, which corresponds to the intermediary receipt.
    expect(res.status).toBe("denied");
    expect(res.evidence_hash).toBeDefined();

    // Verify it is an intermediary receipt, not execution evidence.
    const receipts = runtime.intermediary.getReceipts();
    expect(receipts.length).toBeGreaterThan(0);
    const receipt = receipts.find(r => r.receipt_hash.value === res.evidence_hash);
    expect(receipt).toBeDefined();
    expect(receipt?.decision.type).toBe("denied");
  });
});
