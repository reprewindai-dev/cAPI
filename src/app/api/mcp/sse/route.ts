import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Retired legacy SSE transport stub.
 *
 * This handler announced a `/api/mcp/message` endpoint that was never
 * implemented, so every client that followed it hung. The Veklom MCP server
 * speaks Streamable HTTP at `/mcp`; point clients there.
 */
export async function GET(_request: Request) {
  return NextResponse.json(
    {
      error: "MCP_SSE_TRANSPORT_RETIRED",
      detail: "The SSE transport stub is retired. Connect with Streamable HTTP at /mcp.",
      mcp_endpoint: "/mcp",
    },
    { status: 410 },
  );
}
