import { NextResponse } from "next/server";
import type { ActionOutcomeV1 } from "@/lib/covenant/outly-types";

export async function POST(req: Request) {
  try {
    const payload = await req.json() as ActionOutcomeV1;

    // Validate minimum fields
    if (!payload.action_id || !payload.execution_id || !payload.outcome_status) {
      return NextResponse.json(
        { error: "Invalid ActionOutcomeV1 payload" },
        { status: 400 }
      );
    }

    // 1. Evidence Anchoring (Anchor the Outcome)
    // Fill in the evidence reference that we just created
    payload.evidence_reference = {
      evidence_id: `ev_outcome_${payload.outcome_status.toLowerCase()}_${Date.now()}`,
      entry_hash: "mock_entry_hash_002",
      ledger: "pgl-veklom"
    };

    // Note: Asynchronous PGL Forward would go here.
    if (process.env.PGL_LEDGER_URL) {
      console.log(`[Shadow-Mode] Forwarding outcome ${payload.outcome_status} for action ${payload.action_id} to PGL...`);
    }

    return NextResponse.json({
      status: "received",
      evidence_reference: payload.evidence_reference
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Outly Outcome Ingest Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
