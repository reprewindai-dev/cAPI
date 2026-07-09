import { NextRequest, NextResponse } from "next/server";
import { getEngine, type SignedCallInput } from "@/lib/covenant/engine";
import type { CovenantRequest } from "@/lib/covenant/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const engine = getEngine();
  await engine.syncRegistry();
  const body = (await req.json()) as Partial<SignedCallInput & CovenantRequest>;
  if (
    body.connection_id &&
    body.agent_id &&
    body.agent_signature &&
    body.capability_id &&
    body.action &&
    body.timestamp &&
    body.context
  ) {
    const response = await engine.runtime.process(body as CovenantRequest, {
      approvals: body.approvals,
      bypass: body.bypass,
    });
    return NextResponse.json(response);
  }
  if (!body.agent_id || !body.capability_id || !body.action) {
    return NextResponse.json(
      { error: "agent_id, capability_id and action are required" },
      { status: 400 },
    );
  }
  if (!engine.hasSigningKey(body.agent_id)) {
    return NextResponse.json(
      {
        error: "server signing key not configured for agent",
        proof: engine.registryStatus(),
        remediation: "Send a fully signed CovenantRequest or register a real server-managed agent key.",
      },
      { status: 401 },
    );
  }
  const response = await engine.signAndProcess({
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
