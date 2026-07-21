import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/outly/outcome", () => {
  it("fails closed when PGL is unavailable", async () => {
    delete process.env.PGL_LEDGER_URL;
    const response = await POST(new Request("http://localhost/api/outly/outcome", {
      method: "POST",
      body: JSON.stringify({
        workspace_id: "workspace-1",
        tenant_id: "tenant-1",
        connection_id: "connection-1",
        connection_version: "1.0.0",
        action_id: "action-1",
        execution_id: "execution-1",
        capability_id: "capability-1",
        capability_version: "1.0.0",
        policy_version: "1.0.0",
        decision: "ALLOW",
        outcome_status: "SUCCEEDED",
        idempotency_key: "idem-1",
        nonce: "nonce-1",
        evidence_reference: { evidence_id: "evidence-1", entry_hash: "hash", ledger: "pgl" },
        timestamp: new Date().toISOString(),
      }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(503);
  });
});
