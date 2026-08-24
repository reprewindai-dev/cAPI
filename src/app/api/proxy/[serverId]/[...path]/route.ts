/**
 * Transparent Proxy — /api/proxy/{serverId}/{...path}
 *
 * Direct calls bypass the normal CAPPO-governed request path, so this route
 * is strictly internal service-to-service and fail-closed on X-API-Key.
 */

import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { toolRegistry } from "@/lib/covenant/tool-registry";
import { OutboundTargetError, validateOutboundTarget } from "@/lib/security/outbound-target";

export const dynamic = "force-dynamic";

const INTERNAL_API_KEY = process.env.BYOS_INTERNAL_API_KEY ?? "";
const PROXY_TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS ?? 15_000);

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function requireInternalApiKey(req: NextRequest): NextResponse | null {
  if (!INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "BYOS_INTERNAL_API_KEY is not configured; direct proxy is locked" },
      { status: 503 },
    );
  }

  const provided = req.headers.get("x-api-key")?.trim() ?? "";
  if (!safeEqual(provided, INTERNAL_API_KEY)) {
    return NextResponse.json(
      { error: "Invalid or missing internal API key" },
      { status: 401 },
    );
  }

  return null;
}

async function handleProxy(
  req: NextRequest,
  serverId: string,
  pathParts: string[],
): Promise<NextResponse> {
  const authError = requireInternalApiKey(req);
  if (authError) return authError;

  const server = toolRegistry.getServer(serverId);
  if (!server) {
    return NextResponse.json(
      { error: `Unknown server: ${serverId}. Register it through the authenticated MCP registry first.` },
      { status: 404 },
    );
  }

  const path = `/${pathParts.join("/")}`;
  let targetUrl: URL;
  try {
    const baseUrl = new URL(server.base_url);
    const basePath = baseUrl.pathname.replace(/\/+$/, "");
    const requestPath = path.replace(/^\/+/, "");
    baseUrl.pathname = `${basePath}/${requestPath}`.replace(/\/{2,}/g, "/");
    baseUrl.search = req.nextUrl.search;
    targetUrl = await validateOutboundTarget(baseUrl.toString());
  } catch (error) {
    if (error instanceof OutboundTargetError) {
      return NextResponse.json(
        { error: "Registered upstream target is not permitted", code: error.code },
        { status: 403 },
      );
    }
    console.error("Proxy target validation failed", error);
    return NextResponse.json({ error: "Registered upstream target is unavailable" }, { status: 502 });
  }

  // Forward only headers that are explicitly safe for registered upstreams.
  // Caller credentials, cookies, proxy credentials, internal keys, response-only
  // headers, and hop-by-hop headers must never leave cAPI through this route.
  const forwardHeaders = new Headers();
  const allowedRequestHeaders = new Set([
    "accept",
    "content-type",
    "if-match",
    "if-none-match",
    "range",
  ]);
  for (const [key, value] of req.headers.entries()) {
    if (!allowedRequestHeaders.has(key.toLowerCase())) continue;
    forwardHeaders.set(key, value);
  }

  forwardHeaders.set("X-Covenant-Proxy", "cAPI/1.0");
  forwardHeaders.set("X-Server-Id", serverId);
  forwardHeaders.set("X-Forwarded-Path", path);
  forwardHeaders.set("X-Request-Time", new Date().toISOString());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const body = req.method !== "GET" && req.method !== "HEAD"
      ? await req.arrayBuffer()
      : undefined;

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: body ?? null,
      signal: controller.signal,
      // A previously validated public target must not be allowed to redirect
      // the proxy to a private or metadata destination.
      redirect: "error",
    });
    clearTimeout(timer);

    const responseBody = await upstream.arrayBuffer();
    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (["transfer-encoding", "connection", "keep-alive"].includes(key.toLowerCase())) return;
      responseHeaders.set(key, value);
    });
    responseHeaders.set("X-Covenant-Proxy", "cAPI/1.0");
    responseHeaders.set("X-Upstream-Status", String(upstream.status));

    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes("abort") || message.includes("timeout");
    console.error("MCP proxy upstream request failed", err);
    return NextResponse.json(
      { error: isTimeout ? "Upstream request timed out" : "Upstream request failed" },
      { status: isTimeout ? 504 : 502 },
    );
  }
}

export async function GET(req: NextRequest, context: { params: Promise<{ serverId: string; path: string[] }> }) {
  const params = await context.params;
  return handleProxy(req, params.serverId, params.path);
}
export async function POST(req: NextRequest, context: { params: Promise<{ serverId: string; path: string[] }> }) {
  const params = await context.params;
  return handleProxy(req, params.serverId, params.path);
}
export async function PUT(req: NextRequest, context: { params: Promise<{ serverId: string; path: string[] }> }) {
  const params = await context.params;
  return handleProxy(req, params.serverId, params.path);
}
export async function DELETE(req: NextRequest, context: { params: Promise<{ serverId: string; path: string[] }> }) {
  const params = await context.params;
  return handleProxy(req, params.serverId, params.path);
}
export async function PATCH(req: NextRequest, context: { params: Promise<{ serverId: string; path: string[] }> }) {
  const params = await context.params;
  return handleProxy(req, params.serverId, params.path);
}
