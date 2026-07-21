import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const payload = {
  workspace_id: "workspace-1",
  tenant_id: "tenant-1",
  connection_id: "connection-1",
  connection_version: "1.0.0",
  action_id: "action-1",
  execution_id: "execution-1",
  actor_identity: { actor_id: "actor-1", actor_type: "service" },
  capability_id: "capability-1",
  capability_version: "1.0.0",
  policy_version: "1.0.0",
  nonce: "nonce-1",
  idempotency_key: "idem-1",
  timestamp: new Date().toISOString(),
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  requested_side_effect: { action: "read", description: "read", lane: 1 },
};

describe("POST /api/outly/intercept", () => {
  beforeEach(() => {
    delete process.env.PGL_LEDGER_URL;
    delete process.env.CAPPO_BACKEND_URL;
  });

  it("fails closed when evidence anchoring is unavailable", async () => {
    const response = await POST(new Request("http://localhost/api/outly/intercept", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(503);
  });
});
