import { handleHttp } from "@/lib/mcp/veklom-mcp";

// Alias of /mcp for clients that expect the MCP endpoint under /api.
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
