import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mcp/snapshot", () => ({
  verifySnapshot: vi.fn(() => true),
}));

import { POST } from "./route";

const validProxyBody = {
  connection_id: "connection-1",
  agent_id: "agent-1",
  capability_id: "capability-1",
  action: "execute",
  input: {},
  snapshot_hash: "snapshot-hash",
  snapshot_signature: "snapshot-signature",
};

describe("POST /api/capi/v1/execute", () => {
  const originalExecuteUrl = process.env.CAPPO_EXECUTE_URL;
  const originalBackendUrl = process.env.CAPPO_BACKEND_URL;
  const originalApiKey = process.env.CAPPO_API_KEY;

  beforeEach(() => {
    process.env.CAPPO_EXECUTE_URL = "http://cappo.test/v1/exec";
    delete process.env.CAPPO_BACKEND_URL;
    delete process.env.CAPPO_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalExecuteUrl === undefined) delete process.env.CAPPO_EXECUTE_URL;
    else process.env.CAPPO_EXECUTE_URL = originalExecuteUrl;
    if (originalBackendUrl === undefined) delete process.env.CAPPO_BACKEND_URL;
    else process.env.CAPPO_BACKEND_URL = originalBackendUrl;
    if (originalApiKey === undefined) delete process.env.CAPPO_API_KEY;
    else process.env.CAPPO_API_KEY = originalApiKey;
  });

  it("rejects oversized bounded input before any integration call", async () => {
    const response = await POST(new Request("http://localhost/api/capi/v1/execute", {
      method: "POST",
      body: JSON.stringify({
        connection_id: "connection-1",
        agent_id: "agent-1",
        agent_signature: "signature",
        capability_id: "capability-1",
        action: "a".repeat(257),
        input: {},
        timestamp: new Date().toISOString(),
      }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(400);
  });

  it("fails closed before any CAPPO request when CAPPO_API_KEY is missing", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await POST(new Request("http://localhost/api/capi/v1/execute", {
      method: "POST",
      body: JSON.stringify(validProxyBody),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "CAPPO API key integration unavailable" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
