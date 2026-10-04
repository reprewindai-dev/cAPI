import { handleHttp } from "@/lib/mcp/veklom-mcp";

// Veklom MCP endpoint: https://capi.veklom.com/mcp (Streamable HTTP, JSON-RPC over POST).
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleHttp(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleHttp(request);
}

export async function OPTIONS(request: Request): Promise<Response> {
  return handleHttp(request);
}
