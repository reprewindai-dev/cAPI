/**
 * /api/mcp/servers
 *
 * Administrative MCP server registry. Registration and inventory are not
 * public discovery surfaces: both require the Covenant admin token.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminToken } from "@/lib/covenant/admin-auth";
import { translateOpenApiToMcp } from "@/lib/covenant/dynamic-mcp";
import { toolRegistry } from "@/lib/covenant/tool-registry";
import { mcpOrchestrator } from "@/lib/mcp/orchestrator";
import type { McpServerDescriptor } from "@/lib/mcp/schema";

export const dynamic = "force-dynamic";

function requireRegistryAuth(req: NextRequest): NextResponse | null {
  const auth = requireAdminToken(req);
  if (auth.ok) return null;
  return NextResponse.json({ error: auth.error }, { status: auth.status });
}

function localProcessAllowed(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.CAPI_ALLOW_LOCAL_PROCESS_MCP === "true";
}

export async function POST(req: NextRequest) {
  const authError = requireRegistryAuth(req);
  if (authError) return authError;

  await mcpOrchestrator.init();
  try {
    const body = await req.json();

    // Native MCP descriptor registration.
    if (body.type === "local-process" || body.type === "remote-http" || body.type === "remote-sse") {
      const descriptor = body as McpServerDescriptor;

      if (!descriptor.id) {
        return NextResponse.json({ error: "id is required for native MCP servers" }, { status: 400 });
      }

      // Hosted cAPI must never execute caller-selected local processes. Local
      // stdio MCP is available only for explicit non-production development.
      if (descriptor.type === "local-process" && !localProcessAllowed()) {
        return NextResponse.json(
          { error: "local-process MCP is disabled; use a remote MCP transport" },
          { status: 403 },
        );
      }

      const instance = await mcpOrchestrator.startServer(descriptor);

      return NextResponse.json({
        ok: instance.status !== "error",
        server_id: descriptor.id,
        status: instance.status,
        tools_registered: instance.tools.length,
        tool_names: instance.tools.map((t) => t.name),
        error: instance.error,
      });
    }

    // Legacy OpenAPI proxy registration remains administrative only.
    const { server_id, openapi_url, base_url } = body as any;
    if (!server_id || !openapi_url || !base_url) {
      return NextResponse.json(
        { error: "server_id, openapi_url, and base_url are required for OpenAPI proxy, or provide a valid native MCP descriptor" },
        { status: 400 },
      );
    }

    const tools = await translateOpenApiToMcp(server_id, openapi_url, base_url);

    return NextResponse.json({
      ok: true,
      server_id,
      tools_registered: tools.length,
      tool_names: tools.map((t) => t.name),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const authError = requireRegistryAuth(req);
  if (authError) return authError;

  await mcpOrchestrator.init();
  const nativeInstances = mcpOrchestrator.getInstances();
  const openapiServers = toolRegistry.listServers();

  return NextResponse.json({
    openapi_servers: openapiServers,
    native_mcp_servers: nativeInstances.map((inst) => ({
      id: inst.descriptor.id,
      type: inst.descriptor.type,
      status: inst.status,
      tool_count: inst.tools.length,
      error: inst.error,
    })),
    total_tools: toolRegistry.getAllTools().length + nativeInstances.reduce((sum, inst) => sum + inst.tools.length, 0),
  });
}
