import { NextRequest, NextResponse } from "next/server";
import { requireAdminToken } from "@/lib/covenant/admin-auth";
import { getEngine } from "@/lib/covenant/engine";
import type { AgentIdentity } from "@/lib/covenant/types";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireAdminToken(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const engine = getEngine();
  await engine.syncRegistry();
  const suspended = engine.runtime.toggleAgentSuspension(params.id);
  return NextResponse.json({ agent_id: params.id, suspended });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireAdminToken(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await req.json()) as Partial<AgentIdentity> & { private_key_b64?: string };
  if (!body.public_key || !body.agent_name || !body.owner_id) {
    return NextResponse.json(
      { error: "agent_name, owner_id and public_key are required" },
      { status: 400 },
    );
  }
  const agent: AgentIdentity = {
    agent_id: params.id,
    agent_name: body.agent_name,
    owner_id: body.owner_id,
    public_key: body.public_key,
    capabilities_manifest: body.capabilities_manifest ?? `covenant://agents/${params.id}/capabilities`,
    created_at: body.created_at ?? new Date().toISOString(),
    identity_proof: body.identity_proof ?? `registered:${params.id}`,
    metadata: {
      version: body.metadata?.version ?? "1.0.0",
      framework: body.metadata?.framework ?? "Veklom",
      inference_provider: body.metadata?.inference_provider ?? "other",
      tier: body.metadata?.tier ?? "service",
    },
  };
  const engine = getEngine();
  engine.runtime.registerAgent(agent);
  if (body.private_key_b64) engine.registerKey(params.id, body.private_key_b64);
  return NextResponse.json({
    ok: true,
    agent_id: params.id,
    server_signing_enabled: Boolean(body.private_key_b64),
  });
}
