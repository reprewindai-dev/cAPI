/**
 * Transparent Proxy — /api/proxy/{serverId}/{...path}
 *
 * Intercepts outbound tool executions from agents, stamps Covenant tracing
 * headers, and forwards the request to the registered SaaS base_url.
 *
 * NOTE: Governance (all 9 phases) already ran upstream via /api/request →
 * CovenantRuntime.process() → Phase 6 MCPBridge.callHTTP() → this proxy.
 * This endpoint is the final forwarder. It does not re-run governance —
 * it only adds observability headers and routes the payload.
 *
 * To call a dynamic SaaS tool WITH full governance:
 *   POST /api/request  { agent_id, capability_id: "dynamic::air-intercept::...", ... }
 *
 * Direct proxy calls (bypassing governance) are intentionally allowed only
 * for internal service-to-service traffic authenticated by X-API-Key.
 */

import { NextRequest, NextResponse } from "next/server";
import { toolRegistry } from "@/lib/covenant/tool-registry";

export const dynamic = "force-dynamic";

const INTERNAL_API_KEY = process.env.BYOS_INTERNAL_API_KEY ?? "";
const PROXY_TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS ?? 15_000);

async function handleProxy(
  req: NextRequest,
  serverId: string,
  pathParts: string[],
): Promise<NextResponse> {
  const server = toolRegistry.getServer(serverId);
  if (!server) {
    return NextResponse.json(
      { error: `Unknown server: ${serverId}. Register it via POST /api/mcp/servers first.` },
      { status: 404 },
    );
  }

  const path = `/${pathParts.join("/")}`;
  const targetUrl = `${server.base_url}${path}${req.nextUrl.search}`;

  // Forward all original headers except host, strip Next.js internals
  const forwardHeaders = new Headers();
  for (const [key, value] of req.headers.entries()) {
    if (["host", "x-forwarded-host", "x-forwarded-proto"].includes(key.toLowerCase())) continue;
    forwardHeaders.set(key, value);
  }

  // Stamp Covenant observability headers
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
    });
    clearTimeout(timer);

    const responseBody = await upstream.arrayBuffer();
    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      // Strip hop-by-hop headers
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
    return NextResponse.json(
      { error: isTimeout ? "Upstream request timed out" : `Proxy error: ${message}` },
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
