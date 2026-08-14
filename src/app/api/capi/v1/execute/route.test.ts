import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mcp/snapshot", () => ({ verifySnapshot: vi.fn(() => true) }));

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

  it("retires the legacy route before parsing or making any integration call", async () => {
    const response = await POST(new Request("http://localhost/api/capi/v1/execute", {
      method: "POST",
      body: JSON.stringify({ ...validProxyBody, action: "a".repeat(257) }),
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(410);
  });

  it("rejects the legacy public execution proxy without contacting CAPPO", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const response = await POST(new Request("http://localhost/api/capi/v1/execute", {
      method: "POST",
      body: JSON.stringify(validProxyBody),
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(410);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not make a second public execution entrypoint for MCP capabilities", async () => {
    process.env.CAPPO_API_KEY = "test-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(new Request("http://localhost/api/capi/v1/execute", {
      method: "POST",
      body: JSON.stringify({ ...validProxyBody, capability_id: "mcp::tool-1" }),
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(410);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
