import { NextRequest, NextResponse } from "next/server";
import { requireAdminToken } from "@/lib/covenant/admin-auth";
import { getEngine } from "@/lib/covenant/engine";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireAdminToken(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  await getEngine().syncRegistry();
  const body = (await req.json()) as { action: "approve" | "deny"; approver?: string };
  const safety = getEngine().runtime.safety;
  const record =
    body.action === "approve"
      ? safety.approve(params.id, body.approver ?? `approver-${Date.now()}`)
      : safety.deny(params.id);
  if (!record) {
    return NextResponse.json({ error: "Quarantine record not found" }, { status: 404 });
  }
  return NextResponse.json(record);
}
