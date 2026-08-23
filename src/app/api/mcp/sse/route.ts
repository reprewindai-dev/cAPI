import { NextRequest, NextResponse } from "next/server";
import { requireInternalApiKey } from "@/lib/covenant/internal-auth";

// Keep this alive for SSE
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireInternalApiKey(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // Basic SSE setup
  req.signal.addEventListener("abort", () => {
    writer.close().catch(() => {});
  });

  const sendEvent = async (event: string, data: any) => {
    try {
      await writer.write(
        new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      );
    } catch (err) {
      console.error("Failed to write SSE", err);
    }
  };

  // Setup connection event
  await sendEvent("endpoint", "/api/mcp/message");

  return new NextResponse(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
