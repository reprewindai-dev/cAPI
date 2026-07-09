import { NextRequest, NextResponse } from "next/server";
import { getEngine } from "@/lib/covenant/engine";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { hash: string } },
) {
  const engine = getEngine();
  await engine.syncRegistry();
  const evidence = engine.runtime.getEvidence(params.hash);
  if (!evidence) {
    return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
  }
  return NextResponse.json(evidence);
}
