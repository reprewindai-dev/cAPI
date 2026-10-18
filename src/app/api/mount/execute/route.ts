import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(_request: Request) {
  return NextResponse.json(
    {
      error: "LEGACY_EXECUTION_ENTRYPOINT_RETIRED",
      detail:
        "cAPI mount registry does not grant execution authority. Consequences execute only through CAPPO.",
      execution_entrypoint: "/v1/capability/mounts/{mount_id}/execute",
    },
    { status: 410 },
  );
}
