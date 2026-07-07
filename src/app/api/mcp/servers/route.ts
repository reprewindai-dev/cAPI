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

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      server_id?: string;
      openapi_url?: string;
      base_url?: string;
    };

    const { server_id, openapi_url, base_url } = body;
    if (!server_id || !openapi_url || !base_url) {
      return NextResponse.json(
        { error: "server_id, openapi_url, and base_url are required" },
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
  return NextResponse.json({
    servers: toolRegistry.listServers(),
    total_tools: toolRegistry.getAllTools().length,
  });
}
