import { describe, expect, it } from "vitest";
import { generateKeyPair } from "./crypto";
import { ManagedIntermediary, type IntermediaryReceipt } from "./accountable-intermediary";

function intermediary() {
  const keys = generateKeyPair();
  return new ManagedIntermediary("gateway-test", keys.privateKeyB64, keys.publicKeyB64);
}

const request = {
  method: "call_tool",
  resource: "approve_invoice",
  params: { invoice_id: "inv-1", amount: 5000 },
};

describe("accountable intermediary", () => {
  it("creates a verifiable forwarded receipt", async () => {
    const gateway = intermediary();
    gateway.connectDownstream("server-test", "https://server.example/api");
    const result = await gateway.processRequest({ request_id: "req-1", request });
    expect(result.receipt.decision.type).toBe("forwarded");
    expect(gateway.verifyReceipt(result.receipt)).toEqual({ valid: true });
  });

  it("creates verifiable rate-limit and policy denial receipts", async () => {
    const gateway = intermediary();
    const rateLimited = await gateway.processRequest({
      request_id: "req-rate",
      request,
      rate_limit_check: () => ({ allowed: false, reason: "rate limit exceeded" }),
    });
    const policyDenied = await gateway.processRequest({
      request_id: "req-policy",
      request,
      policy_check: () => ({ allowed: false, reason: "policy denied" }),
    });
    expect(rateLimited.receipt.action.denial_code).toBe(429);
    expect(policyDenied.receipt.action.denial_code).toBe(403);
    expect(gateway.verifyReceipt(rateLimited.receipt).valid).toBe(true);
    expect(gateway.verifyReceipt(policyDenied.receipt).valid).toBe(true);
  });

  it("commits cached responses and detects any receipt tampering", async () => {
    const gateway = intermediary();
    const result = await gateway.processRequest({
      request_id: "req-cache",
      request,
      cache_check: () => ({ cached: true, response: { approved: true } }),
    });
    expect(result.receipt.decision.type).toBe("cached");
    expect(result.receipt.downstream?.response_hash?.value).toBeTruthy();
    expect(gateway.verifyReceipt(result.receipt).valid).toBe(true);

    const tamperCases: Array<(copy: IntermediaryReceipt) => void> = [
      (copy) => { copy.received_request.request_id = "tampered"; },
      (copy) => { copy.decision.reason = "tampered"; },
      (copy) => { copy.action.processing_duration_ms += 1; },
      (copy) => { copy.receipt_hash.value = "tampered"; },
      (copy) => { copy.signature.value = "tampered"; },
    ];
    for (const tamper of tamperCases) {
      const copy = structuredClone(result.receipt);
      tamper(copy);
      expect(gateway.verifyReceipt(copy).valid).toBe(false);
    }
    expect(gateway.getReceipts()).toHaveLength(1);
  });
});
