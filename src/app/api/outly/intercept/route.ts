import { NextResponse } from "next/server";
import { evaluateProposedAction } from "@/lib/covenant/outly-gate";
import { IntegrationUnavailable, postIntegration, requireIntegration } from "@/lib/covenant/integrations";
import { proposedActionSchema, readJson } from "@/lib/covenant/validation";
import { LockerphycerClient } from "@/lib/covenant/locker-client";

export async function POST(req: Request) {
  const parsed = await readJson(req, proposedActionSchema);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const decision = await evaluateProposedAction(parsed.data);
    
    // 1. Send to PGL (Immutable Genome / Lineage Ledger)
    const pglUrl = requireIntegration("PGL", process.env.PGL_LEDGER_URL);
    const pglAnchored = await postIntegration(`${pglUrl}/api/v1/ledger/events`, {
      agent_id: parsed.data.actor_identity.actor_id,
      event_type: "custom",
      actor: parsed.data.actor_identity.actor_id,
      summary: `outly decision ${decision.decision}: ${parsed.data.action_id}`.slice(0, 255),
      details: { source: "capi-outly", kind: "decision", action: parsed.data, decision },
      idempotency_key: parsed.data.idempotency_key,
    }, process.env.PGL_LEDGER_API_KEY ? { "x-api-key": process.env.PGL_LEDGER_API_KEY } : undefined);
    
    if (typeof pglAnchored.event_id !== "string" || typeof pglAnchored.event_hash !== "string") {
      throw new IntegrationUnavailable("PGL returned no verifiable evidence reference");
    }

    // 2. Send to Lockerphycer (Sovereign Security / Telemetry Layer)
    const lockerphycerAnchored = await LockerphycerClient.registerAuditRecord({
      evidence_id: parsed.data.action_id,
      connection_id: parsed.data.connection_id,
      pgl_hash: pglAnchored.event_hash, // Bind the PGL hash to Lockerphycer's security audit!
      seal_nonce: parsed.data.nonce,
      timestamp: new Date().toISOString(),
      who: {
        agent_id: parsed.data.actor_identity.actor_id,
        agent_public_key: parsed.data.actor_identity.public_key ?? "unverified",
        owner_id: parsed.data.tenant_id,
      },
      what: {
        capability_id: parsed.data.capability_id,
        capability_name: "outly_schedule",
        action: parsed.data.requested_side_effect.action,
      },
      when: {
        requested_at: parsed.data.timestamp,
        executed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      },
      why: {
        policy_applied: parsed.data.policy_version,
        policy_version: parsed.data.policy_version,
        authorization_proof: "outly-gate",
        request_context: "outly-intercept",
      },
      how: {
        method: "http",
        endpoint: "/api/outly/intercept",
        retry_count: 0,
      },
      result: {
        status: decision.decision === "ALLOW" ? "passed" : "denied",
        output_hash: "",
        output_size: 0,
        execution_time_ms: 10,
      },
      compliance: {
        audit_logged: true,
        regulatory_category: "schedule",
        data_classification: "internal",
        retention_policy: "7y",
      }
    });

    return NextResponse.json({
      ...decision,
      evidence_reference: { 
        evidence_id: parsed.data.action_id, 
        entry_hash: pglAnchored.event_hash, 
        ledger: "dual-pgl-lockerphycer" 
      },
    });
  } catch (error) {
    const status = error instanceof IntegrationUnavailable ? 503 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Outly decision failed" }, { status });
  }
}
