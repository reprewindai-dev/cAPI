/**
 * PGL Ledger client — forwards sealed evidence to gnomledger.
 *
 * cAPI seals a SHA-256 hash-chained evidence record in-process (Phase 7). That
 * proves integrity *within* this runtime, but the canonical, tamper-evident
 * proof lives in the Project Genome Ledger (gnomledger) — an append-only,
 * per-agent hash chain persisted out-of-process. This client mirrors every
 * sealed evidence record into gnomledger's `POST /api/v1/ledger/events`, so the
 * audit trail survives process restarts and is independently verifiable via
 * `GET /api/v1/ledger/agents/{agent_id}/verify`.
 *
 * Config is env-driven (same convention as `mcp-bridge.ts`); when the ledger
 * URL is not configured the client is a no-op that reports `disabled` — it never
 * throws and never blocks the pipeline. The local seal always stands.
 */

import type { Evidence, LedgerForward } from "./types";

const LEDGER_URL = process.env.PGL_LEDGER_URL ?? "";
const LEDGER_API_KEY = process.env.PGL_LEDGER_API_KEY ?? "";
const LEDGER_TIMEOUT = Number(process.env.PGL_LEDGER_TIMEOUT_MS ?? 8_000);

/** Shape returned by gnomledger `POST /api/v1/ledger/events`. */
interface LedgerEventResponse {
  event_id: string;
  event_hash: string;
  prev_event_hash: string | null;
}

export function isLedgerConfigured(): boolean {
  return LEDGER_URL.length > 0;
}

function summarize(evidence: Evidence): string {
  const summary = `covenant ${evidence.result.status}: ${evidence.what.capability_name} · ${evidence.what.action}`;
  return summary.slice(0, 255);
}

/**
 * Mirror one sealed evidence record into gnomledger. Idempotent on the cAPI
 * `pgl_hash`, so retries (or duplicate forwards) collapse to a single chained
 * event. Resolves with a `LedgerForward` describing the outcome — never rejects.
 */
export async function forwardEvidence(evidence: Evidence): Promise<LedgerForward> {
  if (!isLedgerConfigured()) {
    return { status: "disabled" };
  }

  const body = {
    agent_id: evidence.who.agent_id,
    event_type: "custom" as const,
    actor: evidence.who.owner_id || evidence.who.agent_id,
    summary: summarize(evidence),
    details: {
      source: "capi",
      evidence_id: evidence.evidence_id,
      connection_id: evidence.connection_id,
      capi_pgl_hash: evidence.pgl_hash,
      capi_previous_hash: evidence.previous_hash ?? null,
      decision: evidence.result.status,
      what: evidence.what,
      when: evidence.when,
      why: evidence.why,
      how: evidence.how,
      result: evidence.result,
      compliance: evidence.compliance,
    },
    idempotency_key: evidence.pgl_hash,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LEDGER_TIMEOUT);
  try {
    const res = await fetch(`${LEDGER_URL.replace(/\/$/, "")}/api/v1/ledger/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": LEDGER_API_KEY,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        status: "failed",
        forwarded_at: new Date().toISOString(),
        error: `gnomledger ${res.status}: ${detail.slice(0, 200) || res.statusText}`,
      };
    }
    const json = (await res.json()) as LedgerEventResponse;
    return {
      status: "sealed",
      event_id: json.event_id,
      event_hash: json.event_hash,
      prev_event_hash: json.prev_event_hash ?? undefined,
      forwarded_at: new Date().toISOString(),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "failed",
      forwarded_at: new Date().toISOString(),
      error: message,
    };
  } finally {
    clearTimeout(timer);
  }
}
