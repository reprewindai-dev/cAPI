import { afterEach, describe, expect, it, vi } from "vitest";
import type { CovenantRequest, Decision, Evidence } from "./types";

type Seal = (
  request: CovenantRequest,
  agent: undefined,
  capability: undefined,
  status: Decision,
  policy_id: string,
  output: Record<string, unknown>,
  executionMs: number,
) => Promise<Evidence>;

const request: CovenantRequest = {
  connection_id: "conn-1",
  agent_id: "agent-1",
  agent_signature: "sig".repeat(16),
  capability_id: "cap-1",
  action: "run",
  input: {},
  context: {},
  timestamp: new Date(0).toISOString(),
};

// pgl-ledger reads its env at module load, so each test loads a fresh copy.
async function load(ledgerUrl: string) {
  vi.resetModules();
  vi.stubEnv("PGL_LEDGER_URL", ledgerUrl);
  vi.stubEnv("PGL_LEDGER_API_KEY", "ledger-key");
  const ledger = await import("./pgl-ledger");
  const { CovenantRuntime } = await import("./runtime");
  const runtime = new CovenantRuntime();
  const seal = () =>
    (runtime as unknown as { generateEvidence: Seal }).generateEvidence.call(
      runtime, request, undefined, undefined, "authorized", "policy-1", { ok: true }, 1,
    );
  return { ledger, runtime, seal };
}

function sentBodies(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

describe("PGL forwarding of sealed evidence", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("seals a deterministic pgl_hash and sends it as the idempotency key", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ event_id: "evt-1", event_hash: "e".repeat(64), prev_event_hash: null }, { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { ledger, seal } = await load("https://pgl.test");

    const evidence = await seal();
    expect(evidence.pgl_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(evidence.pgl_hash).toBe(evidence.envelope_hash);
    expect(evidence.seal_nonce).toBe(evidence.evidence_id);
    expect(evidence.pgl_status).toBe("submitted");

    await vi.waitFor(() => expect(evidence.pgl_status).toBe("committed"));
    expect(evidence.external_ledger?.status).toBe("sealed");
    expect(evidence.pgl_event_hash).toBe("e".repeat(64));

    // A retried forward of the same record carries the same idempotency key.
    await ledger.forwardEvidence(evidence);
    const [first, retry] = sentBodies(fetchMock);
    expect(first.idempotency_key).toBe(evidence.pgl_hash);
    expect(first.details.capi_pgl_hash).toBe(evidence.pgl_hash);
    expect(first.details.capi_seal_nonce).toBe(evidence.evidence_id);
    expect(retry.idempotency_key).toBe(first.idempotency_key);
  });

  it("marks pgl_status failed when the forward fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const { runtime, seal } = await load("https://pgl.test");

    const evidence = await seal();
    await vi.waitFor(() => expect(evidence.pgl_status).toBe("failed"));
    expect(evidence.external_ledger?.status).toBe("failed");
    expect(runtime.queryAudit({ forwarded: "failed" }).records).toContain(evidence);
  });

  it("keeps a pgl_hash but reports not_submitted when forwarding is disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { runtime, seal } = await load("");

    const evidence = await seal();
    expect(evidence.pgl_hash).toBe(evidence.envelope_hash);
    expect(evidence.external_ledger?.status).toBe("disabled");
    expect(evidence.pgl_status).toBe("not_submitted");
    expect(runtime.getEvidence(evidence.pgl_hash as string)).toBe(evidence);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
