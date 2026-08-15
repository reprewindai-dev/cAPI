import { describe, expect, it, vi } from "vitest";

import { generateKeyPair } from "./crypto";
import { MCPBridge } from "./mcp-bridge";
import type { CapabilityIdentity, CovenantRequest } from "./types";

const capability: CapabilityIdentity = {
  capability_id: "capability.repo.read",
  capability_name: "Repository read",
  provider_id: "provider-a",
  endpoint: "mcp://repository.file.read",
  input_schema: {},
  output_schema: {},
  public_key: "",
  created_at: "2026-08-14T00:00:00Z",
  version: "1",
  identity_proof: "",
  metadata: { category: "tool", requires_approval: true, cost: "free", rate_limit: 1 },
};

const request: CovenantRequest = {
  connection_id: "connection-1",
  agent_id: "agent-1",
  agent_signature: "",
  capability_id: capability.capability_id,
  action: "repository.file.read",
  input: { prompt: "read the governed file" },
  context: { trace_id: "trace-1" },
  timestamp: "2026-08-14T00:00:00Z",
};

describe("MCPBridge consequence boundary", () => {
  it("sends an MCP capability request to CAPPO rather than the BYOS gateway", async () => {
    const keys = generateKeyPair();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "denied" }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("CAPPO_INTERNAL_EXEC_KEY", "cappo-test-key");
    vi.stubEnv("CAPPO_EXECUTION_URL", "https://cappo.test/v1/exec");
    vi.stubEnv("COVENANT_HTTP_SIGNING_PRIVATE_KEY", keys.privateKeyB64);
    vi.stubEnv("COVENANT_HTTP_SIGNING_KEY_ID", "capi-test-key");
    vi.stubEnv("BYOS_MCP_GATEWAY_URL", "https://byos.test/mcp");
    vi.stubEnv("BYOS_INTERNAL_API_KEY", "byos-test-key");

    const result = await MCPBridge.execute(capability, request);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://cappo.test/v1/exec");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "X-API-Key": "cappo-test-key",
      "Content-Digest": expect.stringMatching(/^sha-256=:.+:$/),
      "Signature-Input": expect.stringContaining('"@target-uri"'),
    });
    expect(result.output).toMatchObject({ ok: false, status: 403, detail: "denied" });

    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});
