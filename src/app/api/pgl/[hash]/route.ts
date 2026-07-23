import { NextRequest, NextResponse } from "next/server";
import { getEngine } from "@/lib/covenant/engine";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ hash: string }> },
) {
  const params = await context.params;
  const engine = getEngine();
  await engine.syncRegistry();
  const evidence = engine.runtime.getEvidence(params.hash);
  if (!evidence) {
    return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
  }
  return NextResponse.json(evidence);
}
