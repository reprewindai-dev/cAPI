import { NextRequest, NextResponse } from "next/server";
import { getEngine, type SignedCallInput } from "@/lib/covenant/engine";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<SignedCallInput>;
  if (!body.agent_id || !body.capability_id || !body.action) {
    return NextResponse.json(
      { error: "agent_id, capability_id and action are required" },
      { status: 400 },
    );
  }
  const response = await getEngine().signAndProcess({
    agent_id: body.agent_id,
    capability_id: body.capability_id,
    action: body.action,
    input: body.input ?? {},
    approvals: body.approvals,
    bypass: body.bypass,
    tamper: body.tamper,
  });
  return NextResponse.json(response);
}
