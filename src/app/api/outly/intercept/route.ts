import { NextResponse } from "next/server";
import { evaluateProposedAction } from "@/lib/covenant/outly-gate";
import type { ProposedActionV1 } from "@/lib/covenant/outly-types";

export async function POST(req: Request) {
  try {
    const payload = await req.json() as ProposedActionV1;

    // Validate minimum fields
    if (!payload.action_id || !payload.execution_id || !payload.requested_side_effect) {
      return NextResponse.json(
        { error: "Invalid ProposedActionV1 payload" },
        { status: 400 }
      );
    }

    // 1. Deterministic Gate Evaluation
    const decision = await evaluateProposedAction(payload);

    // 2. Evidence Anchoring (Anchor the Decision)
    // Simulate anchoring evidence
    decision.evidence_reference = {
      evidence_id: `ev_${decision.decision.toLowerCase()}_${Date.now()}`,
      entry_hash: "mock_entry_hash_001",
      ledger: "pgl-veklom"
    };

    // Note: Asynchronous PGL Forward would go here.
    if (process.env.PGL_LEDGER_URL) {
      console.log(`[Shadow-Mode] Forwarding decision for action ${decision.action_id} to PGL...`);
    }

    return NextResponse.json(decision);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Outly Intercept Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
