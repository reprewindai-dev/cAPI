import { NextRequest, NextResponse } from "next/server";
import { getEngine } from "@/lib/covenant/engine";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const suspended = getEngine().runtime.toggleAgentSuspension(params.id);
  return NextResponse.json({ agent_id: params.id, suspended });
}
