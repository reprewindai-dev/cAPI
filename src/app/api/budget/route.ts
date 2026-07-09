import { NextRequest, NextResponse } from "next/server";
import { requireAdminToken } from "@/lib/covenant/admin-auth";
import { getEngine } from "@/lib/covenant/engine";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = requireAdminToken(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  await getEngine().syncRegistry();
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
