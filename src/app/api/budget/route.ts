import { NextRequest, NextResponse } from "next/server";
import { requireAdminToken } from "@/lib/covenant/admin-auth";
import { getEngine } from "@/lib/covenant/engine";
import { budgetSchema, readJson } from "@/lib/covenant/validation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = requireAdminToken(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = await readJson(req, budgetSchema);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const engine = getEngine();
  await engine.syncRegistry();
  if (engine.registryStatus().state !== "ready") {
    return NextResponse.json({ error: "Registry integration is unavailable; budget mutation denied" }, { status: 503 });
  }
  engine.runtime.intelligence.allocateBudget(parsed.data.agent_id, parsed.data.capability_id, parsed.data.budget);
  return NextResponse.json({ ok: true });
}
