/**
 * /api/mcp/servers
 *
 * POST  — Register a new SaaS connection by providing its OpenAPI spec URL.
 *         Translates all endpoints into MCP tools + CovenantRuntime capabilities.
 * GET   — List all registered servers and their tool counts.
 */

import { NextRequest, NextResponse } from "next/server";
import { translateOpenApiToMcp } from "@/lib/covenant/dynamic-mcp";
import { toolRegistry } from "@/lib/covenant/tool-registry";
import { mcpOrchestrator } from "@/lib/mcp/orchestrator";
import type { McpServerDescriptor } from "@/lib/mcp/schema";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await mcpOrchestrator.init();
  try {
    const body = await req.json();

    // Check if it's a native MCP descriptor registration
    if (body.type === "local-process" || body.type === "remote-http" || body.type === "remote-sse") {
      const descriptor = body as McpServerDescriptor;
      
      if (!descriptor.id) {
        return NextResponse.json({ error: "id is required for native MCP servers" }, { status: 400 });
      }

      const instance = await mcpOrchestrator.startServer(descriptor);
      
      return NextResponse.json({
        ok: instance.status !== "error",
        server_id: descriptor.id,
        status: instance.status,
        tools_registered: instance.tools.length,
        tool_names: instance.tools.map((t) => t.name),
        error: instance.error
      });
    }

    // Fallback to legacy OpenAPI proxy registration
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

export async function GET() {
  await mcpOrchestrator.init();
  const nativeInstances = mcpOrchestrator.getInstances();
  const openapiServers = toolRegistry.listServers();
  
  return NextResponse.json({
    openapi_servers: openapiServers,
    native_mcp_servers: nativeInstances.map(inst => ({
      id: inst.descriptor.id,
      type: inst.descriptor.type,
      status: inst.status,
      tool_count: inst.tools.length,
      error: inst.error
    })),
    total_tools: toolRegistry.getAllTools().length + nativeInstances.reduce((sum, inst) => sum + inst.tools.length, 0),
  });
}
