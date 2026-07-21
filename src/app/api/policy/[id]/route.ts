import { NextRequest, NextResponse } from "next/server";
import { requireAdminToken } from "@/lib/covenant/admin-auth";
import { getEngine } from "@/lib/covenant/engine";
import type { Policy } from "@/lib/covenant/types";
import { policyToggleSchema, policyUpdateSchema, readJson } from "@/lib/covenant/validation";

export const dynamic = "force-dynamic";

async function requireReady(req: NextRequest) {
  const auth = requireAdminToken(req);
  if (!auth.ok) return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  const engine = getEngine();
  await engine.syncRegistry();
  if (engine.registryStatus().state !== "ready") {
    return { response: NextResponse.json({ error: "Registry integration is unavailable; policy mutation denied" }, { status: 503 }) };
  }
  return { engine };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await readJson(req, policyToggleSchema);
  if ("error" in body) return NextResponse.json({ error: body.error }, { status: 400 });
  const ready = await requireReady(req);
  if ("response" in ready) return ready.response;
  ready.engine.runtime.setPolicyEnabled(params.id, body.data.enabled);
  return NextResponse.json({ policy_id: params.id, enabled: body.data.enabled });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await readJson(req, policyUpdateSchema);
  if ("error" in body) return NextResponse.json({ error: body.error }, { status: 400 });
  const ready = await requireReady(req);
  if ("response" in ready) return ready.response;
  const value = body.data;
  const policy: Policy = {
    policy_id: params.id,
    policy_name: value.policy_name,
    version: value.version,
    tier: value.tier,
    created_by: value.created_by ?? "covenant-admin",
    created_at: value.created_at ?? new Date().toISOString(),
    rules: value.rules,
    metadata: {
      enforcement_mode: value.metadata?.enforcement_mode ?? "strict",
      escalation_threshold: value.metadata?.escalation_threshold ?? 100,
      audit_trail: value.metadata?.audit_trail ?? true,
    },
  };
  ready.engine.runtime.registerPolicy(policy);
  return NextResponse.json({ ok: true, policy_id: params.id });
}
