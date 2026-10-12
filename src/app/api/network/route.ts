import { NextResponse } from "next/server";
import { getNetworkSnapshot } from "@/lib/network/snapshot";

// Live, read-only view of the Veklom network for every console tab.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getNetworkSnapshot(), { headers: { "cache-control": "no-store" } });
}
