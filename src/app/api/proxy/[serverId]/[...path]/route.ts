import { NextResponse } from "next/server";

/**
 * Retired transparent proxy — /api/proxy/{serverId}/{...path}
 *
 * It forwarded any method straight to a registered MCP server, gated only by
 * the decommissioned BYOS internal key: a second consequence path that never
 * crossed CAPPO. cAPI connects and discovers; CAPPO is the sole consequence
 * authority (Capability OS wiring W-05/W-07). Every method answers 410 so the
 * path cannot be re-enabled by setting an environment variable.
 */
export const dynamic = "force-dynamic";

function retired(): NextResponse {
  return NextResponse.json(
    {
      error: "LEGACY_EXECUTION_ENTRYPOINT_RETIRED",
      detail: "cAPI does not forward consequential calls to targets. Consequences execute only through CAPPO.",
      execution_entrypoint: "/v1/capability/mounts/{mount_id}/execute",
    },
    { status: 410 },
  );
}

export const GET = retired;
export const POST = retired;
export const PUT = retired;
export const PATCH = retired;
export const DELETE = retired;
