import { NextRequest, NextResponse } from "next/server";
import { getMountRegistry } from "@/lib/covenant/capability-mount";
import type { CovenantRequest } from "@/lib/covenant/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CovenantRequest & { approvals?: string[] };
    const request: CovenantRequest = {
      connection_id: body.connection_id,
      agent_id: body.agent_id,
      agent_signature: body.agent_signature,
      capability_id: body.capability_id,
      action: body.action,
      input: body.input,
      context: body.context,
      timestamp: body.timestamp,
    };
    if (
      !request.connection_id ||
      !request.agent_id ||
      !request.agent_signature ||
      !request.capability_id ||
      !request.action ||
      !request.timestamp ||
      !request.context
    ) {
      return NextResponse.json(
        { error: "a fully signed CovenantRequest is required" },
        { status: 400 },
      );
    }
    const response = await getMountRegistry().execute(request, { approvals: body.approvals });
    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.startsWith("Mount not found") ? 404 : 422;
    return NextResponse.json({ error: message }, { status });
  }
}
