import { NextRequest, NextResponse } from "next/server";
import { requireAdminToken } from "@/lib/covenant/admin-auth";
import { getEngine } from "@/lib/covenant/engine";
import type { CapabilityIdentity } from "@/lib/covenant/types";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  const auth = requireAdminToken(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await req.json()) as Partial<CapabilityIdentity>;
  if (!body.capability_name || !body.provider_id || !body.endpoint || !body.metadata) {
    return NextResponse.json(
      { error: "capability_name, provider_id, endpoint and metadata are required" },
      { status: 400 },
    );
  }
  const capability: CapabilityIdentity = {
    capability_id: params.id,
    capability_name: body.capability_name,
    provider_id: body.provider_id,
    endpoint: body.endpoint,
    input_schema: body.input_schema ?? { type: "object" },
    output_schema: body.output_schema ?? { type: "object" },
    public_key: body.public_key ?? "",
    created_at: body.created_at ?? new Date().toISOString(),
    version: body.version ?? "1.0.0",
    identity_proof: body.identity_proof ?? `registered:${params.id}`,
    metadata: body.metadata,
  };
  getEngine().runtime.registerCapability(capability);
  return NextResponse.json({ ok: true, capability_id: params.id });
}

