import { NextRequest, NextResponse } from "next/server";
import { getMountRegistry } from "@/lib/covenant/capability-mount";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const agent_id = req.nextUrl.searchParams.get("agent_id");
  if (!agent_id) {
    return NextResponse.json({ error: "agent_id is required" }, { status: 400 });
  }
  return NextResponse.json({
    agent_id,
    discovered: getMountRegistry().discover(agent_id),
  });
}
