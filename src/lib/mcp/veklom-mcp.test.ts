import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleHttp, TOOLS } from "./veklom-mcp";

function rpc(body: unknown, authorization?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (authorization) headers.authorization = authorization;
  return new Request("http://localhost/mcp", { method: "POST", headers, body: JSON.stringify(body) });
}

async function call(name: string, args: Record<string, unknown>, authorization?: string) {
  const response = await handleHttp(rpc({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name, arguments: args } }, authorization));
  return { status: response.status, json: (await response.json()) as any };
}

describe("Veklom MCP server (cAPI)", () => {
  const saved = { cappo: process.env.CAPPO_BACKEND_URL, pgl: process.env.PGL_LEDGER_URL, key: process.env.PGL_LEDGER_API_KEY };

  beforeEach(() => {
    process.env.CAPPO_BACKEND_URL = "https://cappo.test";
    process.env.PGL_LEDGER_URL = "https://pgl.test";
    process.env.PGL_LEDGER_API_KEY = "ledger-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const [k, v] of [["CAPPO_BACKEND_URL", saved.cappo], ["PGL_LEDGER_URL", saved.pgl], ["PGL_LEDGER_API_KEY", saved.key]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("initializes with a supported protocol version and the tools capability", async () => {
    const response = await handleHttp(rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }));
    const json = (await response.json()) as any;
    expect(response.status).toBe(200);
    expect(json.result.protocolVersion).toBe("2025-06-18");
    expect(json.result.capabilities.tools).toBeDefined();
    expect(json.result.serverInfo.name).toBe("veklom-capi");
  });

  it("answers an unsupported protocol version with its own latest version", async () => {
    const json = (await (await handleHttp(rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } }))).json()) as any;
    expect(json.result.protocolVersion).toBe("2025-11-25");
  });

  it("lists every tool publicly, without calling any upstream", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const json = (await (await handleHttp(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }))).json()) as any;
    expect(json.result.tools.map((t: any) => t.name)).toEqual(TOOLS.map((t) => t.name));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts the initialized notification with 202 and no body", async () => {
    const response = await handleHttp(rpc({ jsonrpc: "2.0", method: "notifications/initialized" }));
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("refuses every action tool without a credential and never reaches CAPPO", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const name of ["veklom_mount_capability", "veklom_execute_action", "veklom_read_target_state", "veklom_terminate_mount"]) {
      const { json } = await call(name, { mount_id: "mnt_1", package_ref: "p", workspace: "w", project: "x" });
      expect(json.result.isError).toBe(true);
      expect(json.result.structuredContent.error).toBe("CREDENTIAL_REQUIRED");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores a malformed Authorization header", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { json } = await call("veklom_mount_capability", { package_ref: "p", workspace: "w", project: "x" }, "Basic abc");
    expect(json.result.structuredContent.error).toBe("CREDENTIAL_REQUIRED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards a mount with the caller's own credential and workspace, and nothing else", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"decision":"allow"}', { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const { json } = await call(
      "veklom_mount_capability",
      { package_ref: "veklom.governed-counter@v1", workspace: "ws_123", project: "demo", writes: ["counter.increment"], ttl_seconds: 300 },
      "Bearer caller-jwt-token",
    );
    expect(json.result.isError).toBe(false);
    expect(json.result.structuredContent).toEqual({ http_status: 201, response: { decision: "allow" } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://cappo.test/v1/capability/mounts");
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer caller-jwt-token");
    expect(headers.get("x-workspace-id")).toBe("ws_123");
    expect(headers.get("x-api-key")).toBeNull();
    expect(headers.get("cookie")).toBeNull();
    expect(JSON.parse(init.body as string)).toEqual({
      package_ref: "veklom.governed-counter@v1",
      execution_scope: { workspace: "ws_123", project: "demo" },
      requested_action_scope: { reads: [], writes: ["counter.increment"], blocked: [] },
      ttl_seconds: 300,
    });
  });

  it("returns CAPPO's denial unchanged and marks it as an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":"WORKSPACE_SCOPE_MISMATCH"}', { status: 403 })));
    const { json } = await call("veklom_mount_capability", { package_ref: "p", workspace: "other", project: "x" }, "Bearer caller-jwt-token");
    expect(json.result.isError).toBe(true);
    expect(json.result.structuredContent).toEqual({ http_status: 403, response: { error: "WORKSPACE_SCOPE_MISMATCH" } });
  });

  it("forwards execute with the operation_id and escapes the mount id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"decision":"allow"}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await call(
      "veklom_execute_action",
      { mount_id: "mnt_abc", token_id: "tok_1", nonce: "n1", action: "counter.increment", target_ref: "activation.governed-counter", resource: "r1", operation_id: "op-1", arguments: { by: 1 } },
      "Bearer vlm_holder.secret-value",
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://cappo.test/v1/capability/mounts/mnt_abc/execute");
    expect(JSON.parse(init.body as string).operation_id).toBe("op-1");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer vlm_holder.secret-value");
  });

  it("rejects path-injection in identifiers before any upstream call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { json } = await call("veklom_terminate_mount", { mount_id: "../admin" }, "Bearer caller-jwt-token");
    expect(json.result.structuredContent.error).toBe("INVALID_ARGUMENTS");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("discovers capabilities without a credential", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { json } = await call("veklom_discover_capabilities", {});
    expect(json.result.isError).toBe(false);
    expect(fetchMock.mock.calls[0][0]).toBe("https://cappo.test/v1/capability/packages");
    expect(((fetchMock.mock.calls[0][1] as RequestInit).headers as Headers).get("authorization")).toBeNull();
  });

  it("verifies evidence only for a well-formed hash and reports what the ledger says", async () => {
    const hash = "a".repeat(64);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ event_hash: hash, status: "RECORDED_HASH_MATCH", created_at: "t" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const ok = await call("veklom_verify_evidence", { event_hash: hash });
    expect(ok.json.result.structuredContent.found_in_ledger).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(`https://pgl.test/api/v1/ledger/proof/${hash}`);
    const bad = await call("veklom_verify_evidence", { event_hash: "not-a-hash" });
    expect(bad.json.result.structuredContent.error).toBe("INVALID_ARGUMENTS");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns protocol errors for unknown methods, unknown tools and bad JSON", async () => {
    expect(((await (await handleHttp(rpc({ jsonrpc: "2.0", id: 3, method: "resources/list" }))).json()) as any).error.code).toBe(-32601);
    expect(((await (await handleHttp(rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope" } }))).json()) as any).error.code).toBe(-32602);
    const bad = await handleHttp(new Request("http://localhost/mcp", { method: "POST", body: "{not json" }));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as any).error.code).toBe(-32700);
  });

  it("refuses oversized bodies", async () => {
    const response = await handleHttp(new Request("http://localhost/mcp", { method: "POST", body: "x".repeat(70 * 1024) }));
    expect(response.status).toBe(413);
  });
});
