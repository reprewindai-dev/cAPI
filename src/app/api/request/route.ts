import { NextRequest, NextResponse } from "next/server";
import { getEngine, type SignedCallInput } from "@/lib/covenant/engine";
import type { CovenantRequest } from "@/lib/covenant/types";
import { requestInputSchema, readJson } from "@/lib/covenant/validation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const parsed = await readJson(req, requestInputSchema);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const engine = getEngine();
  await engine.syncRegistry();
  if (engine.registryStatus().state !== "ready") {
    return NextResponse.json({ error: "Registry integration is unavailable; request denied" }, { status: 503 });
  }

  const body = parsed.data;
  if ("agent_signature" in body) {
    const response = await engine.runtime.process(body as CovenantRequest);
    return NextResponse.json(response);
  }
  if (!engine.hasSigningKey(body.agent_id)) {
    return NextResponse.json({ error: "server signing key not configured for agent" }, { status: 401 });
  }
  const response = await engine.signAndProcess(body as SignedCallInput);
  return NextResponse.json(response);
}
