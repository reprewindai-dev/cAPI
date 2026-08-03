import { describe, expect, it } from "vitest";
import { generateKeyPair } from "./crypto";
import {
  canonicalEncode,
  EvidenceGenerator,
  getServerPublicKey,
  type ExecutionEvidence,
} from "./evidence-standard";

function evidenceParams(agentId: string) {
  return {
    agent_id: agentId,
    agent_public_key: generateKeyPair().publicKeyB64,
    request: {
      action: "approve_invoice",
      params: { amount: 50000, invoice_id: "12345" },
    },
    authorization_decision: "authorized" as const,
    policy_id: "policy-finance-approval",
    decision_reason: "agent is in the finance team",
    execution_status: "success" as const,
    execution_result: { invoice_approved: true },
    duration_ms: 145,
  };
}

describe("canonicalEncode", () => {
  it("is deterministic for nested objects and arrays", () => {
    const first = {
      z: { b: 2, a: [{ d: true, c: "value with spaces" }] },
      a: 1,
    };
    const second = {
      a: 1,
      z: { a: [{ c: "value with spaces", d: true }] , b: 2 },
    };

    expect(canonicalEncode(first)).toBe(canonicalEncode(second));
    expect(canonicalEncode(first)).toBe(
      '{"a":1,"z":{"a":[{"c":"value with spaces","d":true}],"b":2}}',
    );
  });
});

describe("EvidenceGenerator", () => {
  it("generates evidence that verifies with the exposed server public key", async () => {
    const generator = new EvidenceGenerator("server-test");
    const evidence = await generator.generateEvidence(evidenceParams("agent-a"));

    expect(evidence.actor.server_public_key).toBe(generator.serverPublicKey);
    expect(generator.getServerPublicKey()).toBe(generator.serverPublicKey);
    expect(getServerPublicKey()).toBe(generator.serverPublicKey);
    expect(generator.verifyEvidence(evidence)).toEqual({ valid: true });
  });

  it("fails closed without a signing key in production", () => {
    const env = process.env as Record<string, string | undefined>;
    const previousNodeEnv = env.NODE_ENV;
    const previousSigningKey = env.COVENANT_EVIDENCE_SIGNING_KEY;
    env.NODE_ENV = "production";
    delete env.COVENANT_EVIDENCE_SIGNING_KEY;

    try {
      expect(() => new EvidenceGenerator("server-production")).toThrow(
        "COVENANT_EVIDENCE_SIGNING_KEY is required in production",
      );
    } finally {
      if (previousNodeEnv === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = previousNodeEnv;
      if (previousSigningKey === undefined) delete env.COVENANT_EVIDENCE_SIGNING_KEY;
      else env.COVENANT_EVIDENCE_SIGNING_KEY = previousSigningKey;
    }
  });

  it("detects tampering with every signed envelope section", async () => {
    const generator = new EvidenceGenerator("server-test");
    const evidence = await generator.generateEvidence(evidenceParams("agent-a"));
    const tamperCases: Array<(copy: ExecutionEvidence) => void> = [
      (copy) => { copy.request_commitment.canonicalized_request = "{}"; },
      (copy) => { copy.authorization.decision_reason = "tampered"; },
      (copy) => { copy.execution.duration_ms += 1; },
      (copy) => { copy.actor.agent_id = "agent-tampered"; },
      (copy) => { copy.chain.chain_depth += 1; },
      (copy) => { copy.compliance.immutable = false as true; },
    ];

    for (const tamper of tamperCases) {
      const copy = structuredClone(evidence);
      tamper(copy);
      expect(generator.verifyEvidence(copy).valid).toBe(false);
    }
  });

  it("maintains independent per-agent chain linkage", async () => {
    const generator = new EvidenceGenerator("server-test");
    const firstA = await generator.generateEvidence(evidenceParams("agent-a"));
    const firstB = await generator.generateEvidence(evidenceParams("agent-b"));
    const secondA = await generator.generateEvidence(evidenceParams("agent-a"));

    expect(firstA.chain.previous_evidence_hash).toBeUndefined();
    expect(firstB.chain.previous_evidence_hash).toBeUndefined();
    expect(secondA.chain.previous_evidence_hash).toBe(
      firstA.signatures.envelope_hash.value,
    );
    expect(secondA.chain.agent_chain_id).toBe(firstA.chain.agent_chain_id);
    expect(firstB.chain.agent_chain_id).not.toBe(firstA.chain.agent_chain_id);
    expect(generator.getEvidenceChain(secondA.evidence_id)).toEqual([firstA, secondA]);
  });

  it("queries only records belonging to the requested agent", async () => {
    const generator = new EvidenceGenerator("server-test");
    await generator.generateEvidence(evidenceParams("agent-a"));
    await generator.generateEvidence(evidenceParams("agent-b"));
    await generator.generateEvidence(evidenceParams("agent-a"));

    const records = generator.queryEvidenceByAgent("agent-a");
    expect(records).toHaveLength(2);
    expect(records.every((record) => record.actor.agent_id === "agent-a")).toBe(true);
  });
});
