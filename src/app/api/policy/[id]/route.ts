import { NextRequest, NextResponse } from "next/server";
import { requireAdminToken } from "@/lib/covenant/admin-auth";
import { getEngine } from "@/lib/covenant/engine";
import type { Policy } from "@/lib/covenant/types";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireAdminToken(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  await getEngine().syncRegistry();
  const body = (await req.json()) as { enabled: boolean };
  getEngine().runtime.setPolicyEnabled(params.id, body.enabled);
  return NextResponse.json({ policy_id: params.id, enabled: body.enabled });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireAdminToken(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await req.json()) as Partial<Policy>;
  if (!body.policy_name || !body.version || !body.tier || !Array.isArray(body.rules)) {
    return NextResponse.json(
      { error: "policy_name, version, tier and rules are required" },
      { status: 400 },
    );
  }
  const policy: Policy = {
    policy_id: params.id,
    policy_name: body.policy_name,
    version: body.version,
    tier: body.tier,
    created_by: body.created_by ?? "covenant-admin",
    created_at: body.created_at ?? new Date().toISOString(),
    rules: body.rules,
    metadata: {
      enforcement_mode: body.metadata?.enforcement_mode ?? "strict",
      escalation_threshold: body.metadata?.escalation_threshold ?? 100,
      audit_trail: body.metadata?.audit_trail ?? true,
    },
  };
  getEngine().runtime.registerPolicy(policy);
  return NextResponse.json({ ok: true, policy_id: params.id });
}
