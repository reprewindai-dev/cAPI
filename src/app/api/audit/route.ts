import { NextRequest, NextResponse } from "next/server";
import { getEngine } from "@/lib/covenant/engine";
import { isLedgerConfigured } from "@/lib/covenant/pgl-ledger";
import type { AuditQuery, Decision, LedgerForwardStatus } from "@/lib/covenant/types";

export const dynamic = "force-dynamic";

const DECISIONS: Decision[] = ["authorized", "denied", "error", "quarantined"];
const FORWARD_STATES: LedgerForwardStatus[] = ["pending", "sealed", "failed", "disabled"];

/**
 * Handles GET requests to query and return the audit trail.
 *
 * Accepts optional query parameters to filter results: `agent_id`, `capability_id`, `status`,
 * `forwarded`, `since` (ISO-8601), and `limit`.
 *
 * @returns JSON response containing `pgl_ledger.configured`, the audit query, and results
 */
export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const statusParam = sp.get("status");
  if (statusParam && !DECISIONS.includes(statusParam as Decision)) {
    return NextResponse.json(
      { error: `status must be one of: ${DECISIONS.join(", ")}` },
      { status: 400 },
    );
  }

  const forwardedParam = sp.get("forwarded");
  if (forwardedParam && !FORWARD_STATES.includes(forwardedParam as LedgerForwardStatus)) {
    return NextResponse.json(
      { error: `forwarded must be one of: ${FORWARD_STATES.join(", ")}` },
      { status: 400 },
    );
  }

  const limitParam = sp.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;
  if (limitParam && (!Number.isFinite(limit) || (limit as number) < 1)) {
    return NextResponse.json({ error: "limit must be a positive integer" }, { status: 400 });
  }

  const query: AuditQuery = {
    agent_id: sp.get("agent_id") ?? undefined,
    capability_id: sp.get("capability_id") ?? undefined,
    status: (statusParam as Decision | null) ?? undefined,
    forwarded: (forwardedParam as LedgerForwardStatus | null) ?? undefined,
    since: sp.get("since") ?? undefined,
    limit,
  };

  const result = getEngine().runtime.queryAudit(query);
  return NextResponse.json({
    pgl_ledger: { configured: isLedgerConfigured() },
    query,
    ...result,
  });
}
