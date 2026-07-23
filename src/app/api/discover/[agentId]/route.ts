import { NextRequest, NextResponse } from "next/server";
import { discover } from "@/lib/covenant/api";
import { getEngine } from "@/lib/covenant/engine";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ agentId: string }> },
) {
  const params = await context.params;
  await getEngine().syncRegistry();
  return NextResponse.json({ capabilities: discover(params.agentId) });
}
