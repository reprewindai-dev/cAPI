import { NextRequest, NextResponse } from "next/server";
import { composeFor } from "@/lib/covenant/api";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const agent = req.nextUrl.searchParams.get("agent_id");
  const cap = req.nextUrl.searchParams.get("capability_id");
  if (!agent || !cap) {
    return NextResponse.json({ error: "agent_id and capability_id required" }, { status: 400 });
  }
  return NextResponse.json(composeFor(agent, cap));
}
