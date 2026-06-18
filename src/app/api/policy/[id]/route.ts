import { NextRequest, NextResponse } from "next/server";
import { getEngine } from "@/lib/covenant/engine";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = (await req.json()) as { enabled: boolean };
  getEngine().runtime.setPolicyEnabled(params.id, body.enabled);
  return NextResponse.json({ policy_id: params.id, enabled: body.enabled });
}
