import { NextRequest, NextResponse } from "next/server";
import { getEngine } from "@/lib/covenant/engine";

export const dynamic = "force-dynamic";

export function GET(
  _req: NextRequest,
  { params }: { params: { hash: string } },
) {
  const result = getEngine().runtime.replay(params.hash);
  if (!result.evidence) {
    return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}
