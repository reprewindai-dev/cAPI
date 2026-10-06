import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as intercept } from "./intercept/route";
import { POST as outcome } from "./outcome/route";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_REGISTRY_TOKEN = process.env.CAPI_REGISTRY_TOKEN;
const mutableEnv = process.env as Record<string, string | undefined>;

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
  nonce: "nonce-1",
  idempotency_key: "idem-1",
  timestamp: new Date().toISOString(),
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  requested_side_effect: { action: "read", description: "Read a bounded resource", lane: 1 },
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

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mutableEnv.NODE_ENV = "production";
  process.env.CAPI_REGISTRY_TOKEN = "outly-registry-token";
  process.env.PGL_LEDGER_URL = "http://pgl.test";
  process.env.PGL_LEDGER_API_KEY = "capi-pgl-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PGL_LEDGER_URL;
  delete process.env.PGL_LEDGER_API_KEY;
  if (ORIGINAL_REGISTRY_TOKEN === undefined) delete process.env.CAPI_REGISTRY_TOKEN;
  else process.env.CAPI_REGISTRY_TOKEN = ORIGINAL_REGISTRY_TOKEN;
  if (ORIGINAL_NODE_ENV === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe("Outly routes require the registry bearer before touching PGL", () => {
  it("rejects anonymous and wrong-token callers without contacting PGL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const anonymousIntercept = await intercept(post("http://localhost/api/outly/intercept", proposedAction));
    const wrongIntercept = await intercept(
      post("http://localhost/api/outly/intercept", proposedAction, { authorization: "Bearer wrong" }),
    );
    const anonymousOutcome = await outcome(post("http://localhost/api/outly/outcome", outcomePayload));
    const wrongOutcome = await outcome(
      post("http://localhost/api/outly/outcome", outcomePayload, { authorization: "Bearer wrong" }),
    );

    expect(anonymousIntercept.status).toBe(401);
    expect(wrongIntercept.status).toBe(401);
    expect(anonymousOutcome.status).toBe(401);
    expect(wrongOutcome.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when registry authentication is not configured outside local environments", async () => {
    delete process.env.CAPI_REGISTRY_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const interceptResponse = await intercept(post("http://localhost/api/outly/intercept", proposedAction));
    const outcomeResponse = await outcome(post("http://localhost/api/outly/outcome", outcomePayload));

    expect(interceptResponse.status).toBe(503);
    expect(outcomeResponse.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("anchors in PGL once the registry bearer is presented", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ event_id: "evt-1", event_hash: "sha256:evt" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const headers = { authorization: "Bearer outly-registry-token" };

    const outcomeResponse = await outcome(post("http://localhost/api/outly/outcome", outcomePayload, headers));

    expect(outcomeResponse.status).toBe(200);
    expect((await outcomeResponse.json()).evidence_reference.evidence_id).toBe("evt-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
