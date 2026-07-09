import { NextRequest, NextResponse } from "next/server";
import { composeFor } from "@/lib/covenant/api";
import { getEngine } from "@/lib/covenant/engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await getEngine().syncRegistry();
  const agent = req.nextUrl.searchParams.get("agent_id");
  const cap = req.nextUrl.searchParams.get("capability_id");
  if (!agent || !cap) {
    return NextResponse.json({ error: "agent_id and capability_id required" }, { status: 400 });
  }
  return NextResponse.json(composeFor(agent, cap));
}
