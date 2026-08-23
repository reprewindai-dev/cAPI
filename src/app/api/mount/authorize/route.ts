import { NextRequest, NextResponse } from "next/server";
import { requireInternalApiKey } from "@/lib/covenant/internal-auth";
import { getMountRegistry } from "@/lib/covenant/capability-mount";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = requireInternalApiKey(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = (await req.json()) as { agent_id?: string; mount_id?: string };
    if (!body.agent_id || !body.mount_id) {
      return NextResponse.json(
        { error: "agent_id and mount_id are required" },
        { status: 400 },
      );
    }
    return NextResponse.json(getMountRegistry().authorize(body.agent_id, body.mount_id));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.startsWith("Mount not found") ? 404 : 422;
    return NextResponse.json({ error: message }, { status });
  }
}
