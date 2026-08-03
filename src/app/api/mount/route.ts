import { NextRequest, NextResponse } from "next/server";
import {
  getMountRegistry,
  type ExecutionLane,
} from "@/lib/covenant/capability-mount";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const laneParam = searchParams.get("lane");
  const lane = laneParam === null ? undefined : Number(laneParam);
  if (lane !== undefined && ![1, 2, 3].includes(lane)) {
    return NextResponse.json({ error: "lane must be one of 1, 2, or 3" }, { status: 400 });
  }

  const includeExpiredParam = searchParams.get("includeExpired");
  if (
    includeExpiredParam !== null &&
    includeExpiredParam !== "true" &&
    includeExpiredParam !== "false"
  ) {
    return NextResponse.json(
      { error: "includeExpired must be true or false" },
      { status: 400 },
    );
  }

  const registry = getMountRegistry();
  return NextResponse.json({
    mounts: registry.list({
      lane: lane as ExecutionLane | undefined,
      workspace_id: searchParams.get("workspace_id") ?? undefined,
      includeExpired: includeExpiredParam === "true",
    }),
    graph_version: registry.graphVersion,
  });
}
