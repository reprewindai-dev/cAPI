import { NextRequest, NextResponse } from "next/server";
import { getEngine } from "@/lib/covenant/engine";
import { requireInternalApiKey } from "@/lib/covenant/internal-auth";
import { checkRegistryAuth } from "@/lib/covenant/registry-auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ service_name: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const internalAuth = requireInternalApiKey(request);
  if (!internalAuth.ok) {
    return NextResponse.json({ error: internalAuth.error }, { status: internalAuth.status });
  }

  const auth = checkRegistryAuth(request);
  if (auth.configurationError) {
    return NextResponse.json(
      { error: "Registry authentication is not configured" },
      { status: 503 },
    );
  }
  if (!auth.ok) {
    return NextResponse.json(
      { error: "Invalid or missing registry token" },
      { status: 401 },
    );
  }
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
