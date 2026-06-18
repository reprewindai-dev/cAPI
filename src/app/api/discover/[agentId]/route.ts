import { NextRequest, NextResponse } from "next/server";
import { discover } from "@/lib/covenant/api";

export const dynamic = "force-dynamic";

export function GET(
  _req: NextRequest,
  { params }: { params: { agentId: string } },
) {
  return NextResponse.json({ capabilities: discover(params.agentId) });
}
