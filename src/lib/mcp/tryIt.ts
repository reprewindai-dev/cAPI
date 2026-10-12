/**
 * Browser-side helpers for the public "Connect" page. Everything here talks to
 * the same /mcp endpoint an external MCP client uses, so the page exercises the
 * real product path (cAPI -> CAPPO -> PGL) instead of the local engine.
 */

export const GOVERNED_COUNTER = {
  package_ref: "veklom.governed-counter@v1",
  target_ref: "activation.governed-counter",
  resource: "counter",
  read: "counter.read",
  increment: "counter.increment",
  blocked: "counter.reset",
} as const;

export interface RpcExchange {
  request: Record<string, unknown>;
  httpStatus: number;
  response: unknown;
  /** Tool payload (structuredContent) when the call was a tools/call. */
  payload: unknown;
  isError: boolean;
}

let rpcCounter = 0;

export async function mcpCall(
  method: string,
  params: Record<string, unknown> | undefined,
  credential?: string,
  endpoint = "/mcp",
): Promise<RpcExchange> {
  rpcCounter += 1;
  const request: Record<string, unknown> = { jsonrpc: "2.0", id: rpcCounter, method };
  if (params) request.params = params;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  const token = credential?.trim();
  if (token) headers.authorization = token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`;

  let httpStatus = 0;
  let response: unknown = null;
  try {
    const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(request), cache: "no-store" });
    httpStatus = res.status;
    const text = await res.text();
    try {
      response = text ? JSON.parse(text) : null;
    } catch {
      response = { raw: text.slice(0, 500) };
    }
  } catch {
    response = { error: "NETWORK_ERROR" };
  }

  const result = asObject(asObject(response)?.result);
  const payload = result && "structuredContent" in result ? result.structuredContent : result ?? asObject(asObject(response)?.error) ?? response;
  const isError = httpStatus < 200 || httpStatus >= 300 || Boolean(asObject(response)?.error) || result?.isError === true;
  return { request, httpStatus, response, payload, isError };
}

export function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/** CAPPO answers arrive wrapped as { http_status, response } by the MCP server. */
export function upstreamBody(payload: unknown): Record<string, unknown> | undefined {
  const outer = asObject(payload);
  if (!outer) return undefined;
  return asObject(outer.response) ?? outer;
}

export interface MountHandle {
  decision: string | undefined;
  reason: string | undefined;
  mount_id: string | undefined;
  token_id: string | undefined;
  nonce: string | undefined;
  holder_credential: string | undefined;
  expires_at: string | undefined;
}

export function readMount(payload: unknown): MountHandle {
  const body = upstreamBody(payload);
  const mount = asObject(body?.mount);
  const token = asObject(body?.token) ?? asObject(mount?.token);
  return {
    decision: str(body?.decision),
    reason: str(body?.reason),
    mount_id: str(mount?.id) ?? str(token?.mount_id),
    token_id: str(token?.token_id),
    nonce: str(token?.nonce),
    holder_credential: str(body?.holder_credential),
    expires_at: str(body?.expires_at) ?? str(token?.expires_at),
  };
}

export function decisionOf(payload: unknown): string | undefined {
  return str(upstreamBody(payload)?.decision);
}

/** Finds the first PGL event hash anywhere in a CAPPO answer (anchoring shapes vary by package). */
export function findEventHash(value: unknown, depth = 0): string | undefined {
  if (depth > 6) return undefined;
  const obj = asObject(value);
  if (obj) {
    for (const key of ["pgl_event_hash", "event_hash"]) {
      const candidate = obj[key];
      if (typeof candidate === "string" && /^[a-f0-9]{64}$/.test(candidate)) return candidate;
    }
    for (const nested of Object.values(obj)) {
      const found = findEventHash(nested, depth + 1);
      if (found) return found;
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      const found = findEventHash(item, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Best-effort workspace hint from a JWT credential, used only to pre-fill the
 * form. CAPPO remains the judge: a wrong value is simply refused.
 */
export function workspaceFromToken(credential: string): string | undefined {
  const token = credential.trim().replace(/^bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  try {
    const json = decodeBase64Url(parts[1]);
    const claims = asObject(JSON.parse(json));
    if (!claims) return undefined;
    for (const key of ["workspace_id", "workspace", "ws", "tenant_id", "org_id"]) {
      const value = claims[key];
      if (typeof value === "string" && /^[A-Za-z0-9_.:@\-]{1,200}$/.test(value)) return value;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function decodeBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(segment.length / 4) * 4, "=");
  if (typeof atob === "function") {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(base64, "base64").toString("utf8");
}

export function newOperationId(): string {
  return `tryit-${crypto.randomUUID()}`;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
