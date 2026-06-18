import { NextRequest, NextResponse } from "next/server";
import { getEngine } from "@/lib/covenant/engine";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    agent_id: string;
    capability_id: string;
    budget: number;
  };
  if (!body.agent_id || !body.capability_id || typeof body.budget !== "number") {
    return NextResponse.json({ error: "agent_id, capability_id, budget required" }, { status: 400 });
  }
  getEngine().runtime.intelligence.allocateBudget(
    body.agent_id,
    body.capability_id,
    body.budget,
  );
  return NextResponse.json({ ok: true });
}
