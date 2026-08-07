import { NextRequest, NextResponse } from "next/server";
import { getEngine } from "@/lib/covenant/engine";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ service_name: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  const { service_name } = await context.params;
  const updated = await getEngine().heartbeatService(service_name);
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
