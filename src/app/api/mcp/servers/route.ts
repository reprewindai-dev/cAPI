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
import { OutboundTargetError, validateOutboundTarget } from "@/lib/security/outbound-target";

export const dynamic = "force-dynamic";

function requireRegistryAuth(req: NextRequest): NextResponse | null {
  const auth = requireAdminToken(req);
  if (auth.ok) return null;
  return NextResponse.json({ error: auth.error }, { status: auth.status });
}

function localProcessAllowed(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.CAPI_ALLOW_LOCAL_PROCESS_MCP === "true";
}

function safeRegistryError(error: unknown): NextResponse {
  if (error instanceof OutboundTargetError) {
    return NextResponse.json(
      { ok: false, error: "Remote MCP target is not permitted", code: error.code },
      { status: 403 },
    );
  }
  console.error("MCP registry operation failed", error);
  return NextResponse.json(
    { ok: false, error: "MCP registry operation failed" },
    { status: 502 },
  );
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

      // The current driver implements SSE, not Streamable HTTP. Do not accept
      // descriptors that are guaranteed to fail later in the execution path.
      if (descriptor.type === "remote-http") {
        return NextResponse.json(
          { error: "remote-http MCP is not implemented; use a supported governed transport" },
          { status: 400 },
        );
      }

      if (descriptor.type === "remote-sse") {
        if (!descriptor.serverUrl) {
          return NextResponse.json({ error: "serverUrl is required for remote-sse MCP" }, { status: 400 });
        }
        await validateOutboundTarget(descriptor.serverUrl);
      }

      const instance = await mcpOrchestrator.startServer(descriptor);

      return NextResponse.json({
        ok: instance.status !== "error",
        server_id: descriptor.id,
        status: instance.status,
        tools_registered: instance.tools.length,
        tool_names: instance.tools.map((t) => t.name),
        error: instance.status === "error" ? "MCP server failed to start" : undefined,
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

    await validateOutboundTarget(openapi_url);
    await validateOutboundTarget(base_url);
    const tools = await translateOpenApiToMcp(server_id, openapi_url, base_url);

    return NextResponse.json({
      ok: true,
      server_id,
      tools_registered: tools.length,
      tool_names: tools.map((t) => t.name),
    });
  } catch (err: unknown) {
    return safeRegistryError(err);
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
      error: inst.status === "error" ? "MCP server unavailable" : undefined,
    })),
    total_tools: toolRegistry.getAllTools().length + nativeInstances.reduce((sum, inst) => sum + inst.tools.length, 0),
  });
}
