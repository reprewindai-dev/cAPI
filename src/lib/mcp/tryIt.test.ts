import { afterEach, describe, expect, it, vi } from "vitest";
import { decisionOf, findEventHash, mcpCall, readMount, workspaceFromToken } from "./tryIt";

const HASH = "a".repeat(64);

function jwt(claims: Record<string, unknown>): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "none" })}.${enc(claims)}.sig`;
}

describe("Connect page helpers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads mount, token and holder credential from CAPPO's MountResponse", () => {
    const payload = {
      http_status: 200,
      response: {
        decision: "allow",
        reason: "within scope",
        mount: { id: "mnt_1", package_ref: "veklom.governed-counter@v1" },
        token: { token_id: "tok_1", mount_id: "mnt_1", nonce: "n_1", expires_at: "2026-01-01T00:00:00Z" },
        holder_credential: "vlm_holder.secret",
        anchoring: { pgl_event_hash: HASH },
      },
    };
    expect(readMount(payload)).toEqual({
      decision: "allow",
      reason: "within scope",
      mount_id: "mnt_1",
      token_id: "tok_1",
      nonce: "n_1",
      holder_credential: "vlm_holder.secret",
      expires_at: "2026-01-01T00:00:00Z",
    });
    expect(decisionOf(payload)).toBe("allow");
    expect(findEventHash(payload)).toBe(HASH);
  });

  it("returns undefined fields for a denied mount instead of inventing ids", () => {
    const handle = readMount({ http_status: 403, response: { decision: "deny", reason: "workspace mismatch", mount: null, token: null } });
    expect(handle.decision).toBe("deny");
    expect(handle.mount_id).toBeUndefined();
    expect(handle.token_id).toBeUndefined();
  });

  it("only accepts 64-char lowercase hex as an event hash", () => {
    expect(findEventHash({ anchoring: { event_hash: "nothex" } })).toBeUndefined();
    expect(findEventHash({ a: [{ b: { pgl_event_hash: HASH } }] })).toBe(HASH);
  });

  it("pre-fills workspace from common JWT claims and ignores opaque tokens", () => {
    expect(workspaceFromToken(jwt({ workspace_id: "ws_123" }))).toBe("ws_123");
    expect(workspaceFromToken(`Bearer ${jwt({ tenant_id: "t-9" })}`)).toBe("t-9");
    expect(workspaceFromToken("vlm_opaque_token")).toBeUndefined();
    expect(workspaceFromToken(jwt({ workspace_id: "../bad id" }))).toBeUndefined();
  });

  it("sends the credential as a bearer header and unwraps structuredContent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { structuredContent: { ok: true }, isError: false } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const exchange = await mcpCall("tools/call", { name: "veklom_pricing", arguments: {} }, "abc.def.ghi");
    expect(exchange.payload).toEqual({ ok: true });
    expect(exchange.isError).toBe(false);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer abc.def.ghi");
  });

  it("omits the authorization header when no credential is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await mcpCall("tools/list", undefined);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it("flags tool errors and network failures as errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { structuredContent: { error: "CREDENTIAL_REQUIRED" }, isError: true } }), { status: 200 }),
    ));
    expect((await mcpCall("tools/call", { name: "veklom_mount_capability" })).isError).toBe(true);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const offline = await mcpCall("tools/list", undefined);
    expect(offline.isError).toBe(true);
    expect(offline.payload).toEqual({ error: "NETWORK_ERROR" });
  });
});
