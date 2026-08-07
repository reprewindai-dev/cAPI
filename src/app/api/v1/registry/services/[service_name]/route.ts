import { NextRequest, NextResponse } from "next/server";
import { getEngine } from "@/lib/covenant/engine";
import { requireAdminToken } from "@/lib/covenant/admin-auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ service_name: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { service_name } = await context.params;
  const engine = getEngine();
  const service = await engine.services.get(service_name);
  if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });
  return NextResponse.json({
    ...service,
    stale: engine.services.isStale(service),
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { service_name } = await context.params;
  const auth = requireAdminToken(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const engine = getEngine();
  const service = await engine.services.get(service_name);
  if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });
  await engine.deleteService(service_name);
  return NextResponse.json({ ok: true, service_name });
}
