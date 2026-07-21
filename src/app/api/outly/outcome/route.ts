import { NextResponse } from "next/server";
import { IntegrationUnavailable, postIntegration, requireIntegration } from "@/lib/covenant/integrations";
import { outcomeSchema, readJson } from "@/lib/covenant/validation";

export async function POST(req: Request) {
  const parsed = await readJson(req, outcomeSchema);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const pglUrl = requireIntegration("PGL", process.env.PGL_LEDGER_URL);
    const payload = parsed.data;
    const anchored = await postIntegration(`${pglUrl}/api/v1/ledger/events`, {
      agent_id: payload.tenant_id,
      event_type: "custom",
      actor: payload.tenant_id,
      summary: `outly outcome ${payload.outcome_status}: ${payload.action_id}`.slice(0, 255),
      details: { source: "capi-outly", kind: "outcome", outcome: payload },
      idempotency_key: payload.idempotency_key,
    }, process.env.PGL_LEDGER_API_KEY ? { "x-api-key": process.env.PGL_LEDGER_API_KEY } : undefined);
    if (typeof anchored.event_id !== "string" || typeof anchored.event_hash !== "string") {
      throw new IntegrationUnavailable("PGL returned no verifiable evidence reference");
    }
    return NextResponse.json({
      status: "anchored",
      evidence_reference: { evidence_id: anchored.event_id, entry_hash: anchored.event_hash, ledger: "pgl" },
    });
  } catch (error) {
    const status = error instanceof IntegrationUnavailable ? 503 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Outly outcome failed" }, { status });
  }
}
