/**
 * Veklom MCP server (Streamable HTTP, JSON-RPC 2.0 over POST).
 *
 * cAPI is the connection and discovery layer; CAPPO is the sole consequence
 * authority. This server therefore never decides anything:
 *  - discovery tools are public and read-only;
 *  - action tools (mount, execute, read state, terminate) forward the caller's
 *    own Authorization header to CAPPO and return CAPPO's answer unchanged.
 *    Without a credential they fail before any upstream call.
 * The workspace always comes from the caller's credential (CAPPO refuses a
 * header that contradicts it); this server never invents one.
 */

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const SERVER_INFO = { name: "veklom-capi", title: "Veklom (cAPI)", version: "1.0.0" };
const ID_PATTERN = /^[A-Za-z0-9_.:@\-]{1,200}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const MAX_BODY_BYTES = 64 * 1024;

type JsonRpcId = string | number | null;
type JsonObject = Record<string, unknown>;

type ToolDef = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonObject;
  requiresCredential: boolean;
};

const CREDENTIAL_HELP =
  "This tool needs a Veklom credential in the HTTP Authorization header (Bearer <token>). " +
  "A person signs up at https://veklom.com, then uses their session token or mints a machine token for an agent. " +
  "Call veklom_connection_options for details.";

export const TOOLS: ToolDef[] = [
  {
    name: "veklom_connection_options",
    title: "How to connect to Veklom",
    description: "Lists the ways a person or machine can reach Veklom and how to obtain a credential. Public.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    requiresCredential: false,
  },
  {
    name: "veklom_discover_capabilities",
    title: "Discover capability packages",
    description: "Lists the capability packages CAPPO can mount, with the actions each allows and blocks. Public.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    requiresCredential: false,
  },
  {
    name: "veklom_pricing",
    title: "Pricing and payment discovery",
    description: "Returns where Veklom's machine-readable pricing and x402 payment requirements are published. Public.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    requiresCredential: false,
  },
  {
    name: "veklom_verify_evidence",
    title: "Verify a ledger receipt",
    description: "Looks up a PGL (GnomLedger) event hash returned by an anchored action and reports whether the ledger holds it. Public.",
    inputSchema: {
      type: "object",
      properties: { event_hash: { type: "string", description: "64-character lowercase hex pgl_event_hash" } },
      required: ["event_hash"],
      additionalProperties: false,
    },
    requiresCredential: false,
  },
  {
    name: "veklom_mount_capability",
    title: "Mount a capability",
    description:
      "Asks CAPPO for a bounded, expiring mount of a capability package. Requires a credential. Returns CAPPO's decision, the mount, a single-use token and, when allowed, the ledger anchor.",
    inputSchema: {
      type: "object",
      properties: {
        package_ref: { type: "string", description: "e.g. veklom.governed-counter@v1" },
        workspace: { type: "string", description: "Your workspace ID; must match your credential" },
        project: { type: "string" },
        reads: { type: "array", items: { type: "string" } },
        writes: { type: "array", items: { type: "string" } },
        blocked: { type: "array", items: { type: "string" } },
        ttl_seconds: { type: "integer", minimum: 30, maximum: 3600 },
      },
      required: ["package_ref", "workspace", "project"],
      additionalProperties: false,
    },
    requiresCredential: true,
  },
  {
    name: "veklom_execute_action",
    title: "Execute a governed action",
    description:
      "Requests one consequential action under an active mount. CAPPO decides; the effect happens only if allowed, at most once per operation_id. Requires a credential.",
    inputSchema: {
      type: "object",
      properties: {
        mount_id: { type: "string" },
        token_id: { type: "string" },
        nonce: { type: "string" },
        action: { type: "string" },
        target_ref: { type: "string" },
        resource: { type: "string" },
        operation_id: { type: "string", description: "Your idempotency key; a retry with the same value never causes a second effect" },
        arguments: { type: "object" },
        workspace: { type: "string" },
      },
      required: ["mount_id", "token_id", "nonce", "action", "target_ref", "resource", "operation_id"],
      additionalProperties: false,
    },
    requiresCredential: true,
  },
  {
    name: "veklom_read_target_state",
    title: "Read target state",
    description: "Reads the target's own state for a resource, so you can confirm what actually happened. Requires a credential.",
    inputSchema: {
      type: "object",
      properties: {
        target_ref: { type: "string" },
        resource: { type: "string" },
        mount_id: { type: "string" },
        workspace: { type: "string" },
      },
      required: ["target_ref", "resource", "mount_id"],
      additionalProperties: false,
    },
    requiresCredential: true,
  },
  {
    name: "veklom_terminate_mount",
    title: "Terminate a mount",
    description: "Ends a mount so no further action can run under it. Requires a credential.",
    inputSchema: {
      type: "object",
      properties: {
        mount_id: { type: "string" },
        reason: { type: "string" },
        workspace: { type: "string" },
      },
      required: ["mount_id"],
      additionalProperties: false,
    },
    requiresCredential: true,
  },
];

class ToolInputError extends Error {}

function rpcResult(id: JsonRpcId, result: unknown): JsonObject {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonObject {
  return { jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } };
}

function textResult(payload: unknown, isError = false): JsonObject {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError,
  };
}

function str(args: JsonObject, key: string, required: boolean, pattern: RegExp = ID_PATTERN): string | undefined {
  const value = args[key];
  if (value === undefined || value === null || value === "") {
    if (required) throw new ToolInputError(`${key} is required`);
    return undefined;
  }
  if (typeof value !== "string" || !pattern.test(value)) throw new ToolInputError(`${key} is malformed`);
  return value;
}

function strList(args: JsonObject, key: string): string[] {
  const value = args[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50 || !value.every((v) => typeof v === "string" && ID_PATTERN.test(v))) {
    throw new ToolInputError(`${key} must be a list of action names`);
  }
  return value as string[];
}

function cappoBase(): string {
  const base = process.env.CAPPO_BACKEND_URL?.trim();
  if (!base) throw new Error("CAPPO_UNAVAILABLE");
  return base.replace(/\/$/, "");
}

async function callUpstream(
  url: string,
  init: { method: "GET" | "POST"; authorization?: string; workspace?: string; body?: unknown; timeoutMs: number; extraHeaders?: Record<string, string> },
): Promise<{ status: number; body: unknown }> {
  const headers = new Headers({ accept: "application/json" });
  if (init.authorization) headers.set("authorization", init.authorization);
  if (init.workspace) headers.set("x-workspace-id", init.workspace);
  for (const [k, v] of Object.entries(init.extraHeaders ?? {})) headers.set(k, v);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs);
  try {
    const response = await fetch(url, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    const raw = await response.text();
    let body: unknown = raw;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = { raw: raw.slice(0, 500) };
    }
    return { status: response.status, body };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return { status: 504, body: { error: "UPSTREAM_TIMEOUT" } };
    return { status: 503, body: { error: "UPSTREAM_UNAVAILABLE" } };
  } finally {
    clearTimeout(timer);
  }
}

function upstreamResult(status: number, body: unknown): JsonObject {
  const ok = status >= 200 && status < 300;
  const payload = { http_status: status, response: body };
  return textResult(payload, !ok);
}

async function callTool(name: string, args: JsonObject, authorization: string | undefined): Promise<JsonObject> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new ToolInputError(`Unknown tool: ${name}`);
  if (tool.requiresCredential && !authorization) {
    return textResult({ error: "CREDENTIAL_REQUIRED", detail: CREDENTIAL_HELP }, true);
  }

  switch (name) {
    case "veklom_connection_options":
      return textResult({
        mcp_endpoint: "https://capi.veklom.com/mcp",
        human_ui: "https://veklom.com",
        sign_up: "https://veklom.com/signup",
        capability_catalog: "https://capi.veklom.com/api/v1/capi/interlink/capability/packages",
        credentials: {
          person: "Sign up and sign in at veklom.com; send the session token as Authorization: Bearer <token>.",
          machine: "A signed-in person mints a machine token for the agent; the agent sends it as Authorization: Bearer <token>.",
          mount_holder: "A successful mount returns a holder credential (vlm_...) limited to that mount.",
        },
        authority: "CAPPO decides every consequential action. cAPI only connects; it never authorizes.",
        evidence: "Anchored actions return a pgl_event_hash; check it with veklom_verify_evidence.",
      });

    case "veklom_discover_capabilities": {
      const { status, body } = await callUpstream(`${cappoBase()}/v1/capability/packages`, {
        method: "GET",
        authorization,
        timeoutMs: 5000,
      });
      return upstreamResult(status, body);
    }

    case "veklom_pricing":
      return textResult({
        x402_discovery: "https://veklom.com/.well-known/x402.json",
        human_pricing: "https://veklom.com",
        note: "Prices and payment requirements are published at the x402 discovery document. Payment never grants authority; CAPPO still decides every action.",
      });

    case "veklom_verify_evidence": {
      const hash = str(args, "event_hash", true, HASH_PATTERN) as string;
      const ledger = process.env.PGL_LEDGER_URL?.trim();
      if (!ledger) return textResult({ error: "LEDGER_UNAVAILABLE" }, true);
      const extraHeaders: Record<string, string> = {};
      if (process.env.PGL_LEDGER_API_KEY) extraHeaders["x-api-key"] = process.env.PGL_LEDGER_API_KEY;
      const { status, body } = await callUpstream(`${ledger.replace(/\/$/, "")}/api/v1/ledger/proof/${hash}`, {
        method: "GET",
        timeoutMs: 5000,
        extraHeaders,
      });
      const found = status === 200 && typeof body === "object" && body !== null && (body as JsonObject).event_hash === hash;
      return textResult({
        event_hash: hash,
        found_in_ledger: found,
        ledger_status: typeof body === "object" && body !== null ? (body as JsonObject).status ?? null : null,
        created_at: typeof body === "object" && body !== null ? (body as JsonObject).created_at ?? null : null,
        http_status: status,
      }, !found);
    }

    case "veklom_mount_capability": {
      const workspace = str(args, "workspace", true) as string;
      const ttl = args.ttl_seconds;
      if (ttl !== undefined && (typeof ttl !== "number" || !Number.isInteger(ttl) || ttl < 30 || ttl > 3600)) {
        throw new ToolInputError("ttl_seconds must be an integer between 30 and 3600");
      }
      const body = {
        package_ref: str(args, "package_ref", true),
        execution_scope: { workspace, project: str(args, "project", true) },
        requested_action_scope: { reads: strList(args, "reads"), writes: strList(args, "writes"), blocked: strList(args, "blocked") },
        ...(ttl === undefined ? {} : { ttl_seconds: ttl }),
      };
      const { status, body: out } = await callUpstream(`${cappoBase()}/v1/capability/mounts`, {
        method: "POST",
        authorization,
        workspace,
        body,
        timeoutMs: 10000,
      });
      return upstreamResult(status, out);
    }

    case "veklom_execute_action": {
      const mountId = str(args, "mount_id", true) as string;
      const extra = args.arguments;
      if (extra !== undefined && (typeof extra !== "object" || extra === null || Array.isArray(extra))) {
        throw new ToolInputError("arguments must be an object");
      }
      const body = {
        token_id: str(args, "token_id", true),
        nonce: str(args, "nonce", true),
        action: str(args, "action", true),
        target_ref: str(args, "target_ref", true),
        resource: str(args, "resource", true),
        operation_id: str(args, "operation_id", true),
        arguments: extra ?? {},
      };
      const { status, body: out } = await callUpstream(
        `${cappoBase()}/v1/capability/mounts/${encodeURIComponent(mountId)}/execute`,
        { method: "POST", authorization, workspace: str(args, "workspace", false), body, timeoutMs: 10000 },
      );
      return upstreamResult(status, out);
    }

    case "veklom_read_target_state": {
      const target = str(args, "target_ref", true) as string;
      const query = new URLSearchParams({
        resource: str(args, "resource", true) as string,
        mount_id: str(args, "mount_id", true) as string,
      });
      const { status, body } = await callUpstream(
        `${cappoBase()}/v1/capability/targets/${encodeURIComponent(target)}/state?${query.toString()}`,
        { method: "GET", authorization, workspace: str(args, "workspace", false), timeoutMs: 5000 },
      );
      return upstreamResult(status, body);
    }

    case "veklom_terminate_mount": {
      const mountId = str(args, "mount_id", true) as string;
      const reason = args.reason;
      if (reason !== undefined && (typeof reason !== "string" || reason.length > 200)) {
        throw new ToolInputError("reason must be a short string");
      }
      const { status, body } = await callUpstream(
        `${cappoBase()}/v1/capability/mounts/${encodeURIComponent(mountId)}/terminate`,
        { method: "POST", authorization, workspace: str(args, "workspace", false), body: { reason: reason ?? "client_terminate" }, timeoutMs: 10000 },
      );
      return upstreamResult(status, body);
    }
  }
  throw new ToolInputError(`Unknown tool: ${name}`);
}

/** Handles one JSON-RPC message. Returns null for notifications (no response body). */
export async function handleMessage(message: unknown, authorization: string | undefined): Promise<JsonObject | null> {
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    return rpcError(null, -32600, "Invalid Request");
  }
  const msg = message as JsonObject;
  const id = (msg.id ?? null) as JsonRpcId;
  const isNotification = !("id" in msg);
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return isNotification ? null : rpcError(id, -32600, "Invalid Request");
  }
  const params = (typeof msg.params === "object" && msg.params !== null ? msg.params : {}) as JsonObject;

  switch (msg.method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0];
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Veklom separates an agent's ability to run from its authority to make an action real. Discovery tools are public; action tools need your own credential and CAPPO decides every action. Start with veklom_connection_options.",
      });
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return isNotification ? null : rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, {
        tools: TOOLS.map(({ name, title, description, inputSchema, requiresCredential }) => ({
          name,
          title,
          description,
          inputSchema,
          annotations: { readOnlyHint: !requiresCredential || name === "veklom_read_target_state", openWorldHint: true },
        })),
      });
    case "tools/call": {
      const name = params.name;
      const args = (typeof params.arguments === "object" && params.arguments !== null && !Array.isArray(params.arguments)
        ? params.arguments
        : {}) as JsonObject;
      if (typeof name !== "string") return rpcError(id, -32602, "Invalid params: name is required");
      if (!TOOLS.some((t) => t.name === name)) return rpcError(id, -32602, `Unknown tool: ${name}`);
      try {
        return rpcResult(id, await callTool(name, args, authorization));
      } catch (error) {
        if (error instanceof ToolInputError) return rpcResult(id, textResult({ error: "INVALID_ARGUMENTS", detail: error.message }, true));
        if (error instanceof Error && error.message === "CAPPO_UNAVAILABLE") return rpcResult(id, textResult({ error: "CAPPO_UNAVAILABLE" }, true));
        return rpcError(id, -32603, "Internal error");
      }
    }
    default:
      return isNotification ? null : rpcError(id, -32601, `Method not found: ${msg.method}`);
  }
}

function bearer(request: Request): string | undefined {
  const value = request.headers.get("authorization")?.trim();
  if (!value) return undefined;
  return /^Bearer\s+\S{8,4096}$/i.test(value) ? value : undefined;
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id, accept",
  "access-control-expose-headers": "mcp-session-id",
};

export async function handleHttp(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method === "GET") {
    return Response.json(
      { server: SERVER_INFO, transport: "streamable-http", usage: "POST JSON-RPC 2.0 messages to this URL", tools: TOOLS.map((t) => t.name) },
      { status: 405, headers: { ...CORS_HEADERS, allow: "POST, OPTIONS" } },
    );
  }
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { ...CORS_HEADERS, allow: "POST, GET, OPTIONS" } });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json(rpcError(null, -32600, "Request too large"), { status: 413, headers: CORS_HEADERS });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return Response.json(rpcError(null, -32700, "Parse error"), { status: 400, headers: CORS_HEADERS });
  }
  const authorization = bearer(request);
  const headers = { ...CORS_HEADERS, "cache-control": "no-store", "x-veklom-interlink": "capi-mcp" };

  if (Array.isArray(parsed)) {
    if (parsed.length === 0 || parsed.length > 20) return Response.json(rpcError(null, -32600, "Invalid Request"), { status: 400, headers });
    const replies = (await Promise.all(parsed.map((m) => handleMessage(m, authorization)))).filter((r): r is JsonObject => r !== null);
    return replies.length ? Response.json(replies, { status: 200, headers }) : new Response(null, { status: 202, headers });
  }
  const reply = await handleMessage(parsed, authorization);
  return reply ? Response.json(reply, { status: 200, headers }) : new Response(null, { status: 202, headers });
}
