/**
 * POST /api/v1/registry/heartbeat
 *
 * Liveness refresh for an already-registered service. Extends its TTL so it is
 * not shown as stale. Returns 404 if the service was never registered (or its
 * registration has been evicted), so callers re-register rather than assume.
 */

import { NextResponse } from "next/server";
import { getEngine } from "@/lib/covenant/engine";
import { heartbeatSchema, readJson } from "@/lib/covenant/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = await readJson(request, heartbeatSchema);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const updated = await getEngine().heartbeatService(parsed.data.service_name);
  if (!updated) {
    return NextResponse.json(
      { error: "Service not registered; POST /api/v1/registry/register first" },
      { status: 404 },
    );
  }
  return NextResponse.json({
    ok: true,
    service_name: updated.service_name,
    last_seen: updated.last_seen,
    expires_at: updated.expires_at,
  });
}
