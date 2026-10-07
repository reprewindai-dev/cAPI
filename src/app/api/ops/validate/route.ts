import { NextResponse } from "next/server";

/**
 * Retired operator probe — POST /api/ops/validate
 *
 * It claimed to "commit a cryptographic signature to PGL" but posted to a PGL
 * route that does not exist (/api/tools/mint_settlement_evidence_tool), so it
 * could only fail. Evidence is written to PGL's real /api/v1/ledger/events by
 * the services that own each event; cAPI does not mint evidence on demand.
 */
export const dynamic = "force-dynamic";

export function POST(): NextResponse {
  return NextResponse.json(
    {
      error: "OPS_VALIDATE_RETIRED",
      detail: "This probe targeted a PGL route that does not exist. Use /health/dependencies for liveness.",
    },
    { status: 410 },
  );
}
