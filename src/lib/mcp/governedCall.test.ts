import { afterEach, describe, expect, it, vi } from "vitest";
import { runGovernedCall, type GovernedCallSpec } from "./governedCall";

const HASH = "c".repeat(64);
const COUNTER = { id: "veklom.governed-counter@v1", reads: ["counter.read"], writes: ["counter.increment"], blocked: ["counter.reset"], target_ref: "activation.governed-counter" };

function spec(overrides: Partial<GovernedCallSpec> = {}): GovernedCallSpec {
  return { pkg: COUNTER, action: "counter.increment", resource: "counter", targetRef: "activation.governed-counter", args: {}, workspace: "ws_1", project: "p", ...overrides };
}

type Handler = (args: Record<string, unknown>, auth: string | undefined) => unknown;

function stubMcp(handlers: Record<string, Handler>) {
  const calls: Array<{ name: string; args: Record<string, unknown>; auth?: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { id: number; params: { name: string; arguments: Record<string, unknown> } };
    const auth = (init.headers as Record<string, string>).authorization;
    calls.push({ name: body.params.name, args: body.params.arguments, auth });
    const payload = handlers[body.params.name]?.(body.params.arguments, auth) ?? { error: "unhandled" };
    const isError = typeof payload === "object" && payload !== null && ("error" in payload || (payload as { http_status?: number }).http_status === 403);
    return Response.json({ jsonrpc: "2.0", id: body.id, result: { structuredContent: payload, isError } });
  }));
  return calls;
}

const happy: Record<string, Handler> = {
  veklom_discover_capabilities: () => ({ http_status: 200, response: [COUNTER] }),
  veklom_mount_capability: () => ({
    http_status: 200,
    response: { decision: "allow", reason: "ok", mount: { id: "mnt_1" }, token: { token_id: "tok_1", nonce: "n1" }, holder_credential: "vlm_holder.x", anchoring: {} },
  }),
  veklom_execute_action: (args) =>
    args.action === "counter.reset"
      ? { http_status: 403, response: { decision: "deny", reason: "counter.reset is blocked" } }
      : { http_status: 200, response: { decision: "allow", reason: "allowed", anchoring: { pgl_event_hash: HASH }, consequence: { counter: 1 } } },
  veklom_read_target_state: () => ({ http_status: 200, response: { state: { value: 1 } } }),
  veklom_verify_evidence: (args) => ({ event_hash: args.event_hash, found_in_ledger: true }),
  veklom_terminate_mount: () => ({ http_status: 200, response: { decision: "allow" } }),
};

describe("runGovernedCall", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("runs every stage for an allowed action and verifies its receipt", async () => {
    const calls = stubMcp(happy);
    const result = await runGovernedCall(spec(), "user-token-123");
    expect(result.verdict).toBe("allow");
    expect(result.receipt).toBe(HASH);
    expect(result.stages.map((s) => s.status)).toEqual(["pass", "pass", "pass", "pass", "pass", "pass", "pass"]);
    // The person's token only mounts; everything after uses the mount-scoped holder credential.
    expect(calls.find((c) => c.name === "veklom_mount_capability")?.auth).toBe("Bearer user-token-123");
    expect(calls.find((c) => c.name === "veklom_execute_action")?.auth).toBe("Bearer vlm_holder.x");
    expect(calls.find((c) => c.name === "veklom_terminate_mount")?.auth).toBe("Bearer vlm_holder.x");
  });

  it("reports CAPPO's refusal of a blocked action and still ends the mount", async () => {
    stubMcp(happy);
    const result = await runGovernedCall(spec({ action: "counter.reset" }), "user-token-123");
    expect(result.verdict).toBe("deny");
    expect(result.reason).toBe("counter.reset is blocked");
    const byKey = Object.fromEntries(result.stages.map((s) => [s.key, s.status]));
    expect(byKey).toMatchObject({ action: "fail", evidence: "skipped", verify: "skipped", terminate: "pass" });
  });

  it("labels a mount receipt as such when the refused action has none", async () => {
    stubMcp({
      ...happy,
      veklom_mount_capability: () => ({
        http_status: 200,
        response: { decision: "allow", mount: { id: "mnt_1" }, token: { token_id: "tok_1", nonce: "n1" }, holder_credential: "vlm_holder.x", anchoring: { pgl_event_hash: HASH } },
      }),
    });
    const result = await runGovernedCall(spec({ action: "counter.reset" }), "user-token-123");
    expect(result.verdict).toBe("deny");
    expect(result.stages.find((s) => s.key === "evidence")?.detail).toMatch(/^Mount receipt/);
  });

  it("reads state instead of executing for read actions", async () => {
    const calls = stubMcp(happy);
    const result = await runGovernedCall(spec({ action: "counter.read" }), "user-token-123");
    expect(result.verdict).toBe("allow");
    expect(calls.some((c) => c.name === "veklom_execute_action")).toBe(false);
    expect(calls.some((c) => c.name === "veklom_read_target_state")).toBe(true);
    expect(result.reason).toBe('Target state: {"value":1}');
  });

  it("requests only the scope it is given", async () => {
    const calls = stubMcp(happy);
    await runGovernedCall(spec({ mountScope: { reads: ["counter.read"], writes: [] } }), "user-token-123");
    const mount = calls.find((c) => c.name === "veklom_mount_capability");
    expect(mount?.args.writes).toEqual([]);
    expect(mount?.args.reads).toEqual(["counter.read"]);
  });

  it("stops before calling CAPPO without a credential", async () => {
    const calls = stubMcp(happy);
    const result = await runGovernedCall(spec(), "");
    expect(result.verdict).toBe("error");
    expect(calls).toHaveLength(0);
    expect(result.stages[0].status).toBe("fail");
  });

  it("stops at the mount when CAPPO denies it", async () => {
    const calls = stubMcp({ ...happy, veklom_mount_capability: () => ({ http_status: 403, response: { decision: "deny", reason: "workspace mismatch", mount: null, token: null } }) });
    const result = await runGovernedCall(spec(), "user-token-123");
    expect(result.verdict).toBe("deny");
    expect(result.reason).toBe("workspace mismatch");
    expect(calls.some((c) => c.name === "veklom_execute_action")).toBe(false);
  });

  it("refuses packages that are not in the live catalog", async () => {
    const calls = stubMcp({ ...happy, veklom_discover_capabilities: () => ({ http_status: 200, response: [] }) });
    const result = await runGovernedCall(spec(), "user-token-123");
    expect(result.verdict).toBe("error");
    expect(calls.some((c) => c.name === "veklom_mount_capability")).toBe(false);
  });
});
