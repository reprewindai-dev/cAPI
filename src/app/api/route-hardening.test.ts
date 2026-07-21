import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as execute } from "@/app/api/capi/v1/execute/route";
import { POST as intercept } from "@/app/api/outly/intercept/route";
import { POST as outcome } from "@/app/api/outly/outcome/route";
import { POST as budget } from "@/app/api/budget/route";
import { POST as policy } from "@/app/api/policy/[id]/route";
import { POST as request } from "@/app/api/request/route";

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const proposedAction = {
  workspace_id: "ws-1",
  tenant_id: "tenant-1",
  connection_id: "conn-1",
  connection_version: "1.0.0",
  action_id: "action-1",
  execution_id: "exec-1",
  actor_identity: { actor_id: "agent-1", actor_type: "agent" },
  capability_id: "cap-1",
  capability_version: "1.0.0",
  policy_version: "1.0.0",
  policy_version: "1.0.0",
  nonce: "nonce-1",
  idempotency_key: "idem-1",
  timestamp: new Date().toISOString(),
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  requested_side_effect: {
    action: "read",
    description: "Read a bounded resource",
    lane: 1,
    parameters: {},
  },
};

const outcomePayload = {
  workspace_id: "ws-1",
  tenant_id: "tenant-1",
  connection_id: "conn-1",
  connection_version: "1.0.0",
  action_id: "action-1",
  execution_id: "exec-1",
  capability_id: "cap-1",
  capability_version: "1.0.0",
  policy_version: "1.0.0",
  decision: "ALLOW",
  outcome_status: "SUCCEEDED",
  idempotency_key: "idem-1",
  nonce: "nonce-1",
  evidence_reference: { evidence_id: "ev-1", entry_hash: "sha256:abc", ledger: "pgl" },
  timestamp: new Date().toISOString(),
};

beforeEach(() => {
  process.env.COVENANT_ADMIN_TOKEN = "test-admin-token";
  delete process.env.PGL_LEDGER_URL;
  delete process.env.CAPPO_DECISION_URL;
  delete process.env.CAPPO_EXECUTE_URL;
});

describe("cAPI and CAPPO-facing route validation", () => {
  it("rejects oversized and unknown cAPI execute input", async () => {
    const response = await execute(jsonRequest("http://localhost/api/capi/v1/execute", {
      connection_id: "c",
      agent_id: "a",
      capability_id: "cap",
      action: "x".repeat(513),
      unexpected: true,
    }));

    expect(response.status).toBe(400);
  });

  it("rejects malformed Outly proposed actions and outcomes", async () => {
    const interceptResponse = await intercept(jsonRequest("http://localhost/api/outly/intercept", {
      ...proposedAction,
      requested_side_effect: { ...proposedAction.requested_side_effect, lane: 4 },
    }));
    const outcomeResponse = await outcome(jsonRequest("http://localhost/api/outly/outcome", {
      ...outcomePayload,
      outcome_status: "success",
    }));

    expect(interceptResponse.status).toBe(400);
    expect(outcomeResponse.status).toBe(400);
  });

  it("rejects malformed admin budget and policy mutations", async () => {
    const headers = { "x-covenant-admin-token": "test-admin-token" };
    const budgetResponse = await budget(jsonRequest("http://localhost/api/budget", {
      agent_id: "agent-1", capability_id: "cap-1", budget: -1,
    }, headers));
    const policyResponse = await policy(jsonRequest("http://localhost/api/policy/p-1", {
      policy_name: "p", version: "1", tier: "invalid", rules: [],
    }, headers), { params: { id: "p-1" } });

    expect(budgetResponse.status).toBe(400);
    expect(policyResponse.status).toBe(400);
  });

  it("rejects request payloads with bypass controls", async () => {
    const response = await request(jsonRequest("http://localhost/api/request", {
      agent_id: "agent-1", capability_id: "cap-1", action: "read", input: {}, bypass: { policy: true },
    }));

    expect(response.status).toBe(400);
  });
});

describe("fail-closed integration boundaries", () => {
  it("does not issue a fabricated execute success when CAPPO is unavailable", async () => {
    const response = await execute(jsonRequest("http://localhost/api/capi/v1/execute", {
      connection_id: "conn-1", agent_id: "agent-1", capability_id: "cap-1", action: "read", input: {},
      snapshot_hash: "hash", snapshot_signature: "signature",
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("evidence_hash");
  });

  it("does not issue fabricated Outly evidence when PGL is unavailable", async () => {
    const interceptResponse = await intercept(jsonRequest("http://localhost/api/outly/intercept", proposedAction));
    const outcomeResponse = await outcome(jsonRequest("http://localhost/api/outly/outcome", outcomePayload));

    expect(interceptResponse.status).toBe(503);
    expect(outcomeResponse.status).toBe(503);
  });
});
