import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// The request is accepted for the route-handler contract but deliberately never read.
export const POST: (request: Request) => Promise<NextResponse> = async () => {
  return NextResponse.json(
    {
      error: "LEGACY_EXECUTION_ENTRYPOINT_RETIRED",
      detail:
        "cAPI mount registry does not grant execution authority. Consequences execute only through CAPPO.",
      execution_entrypoint: "/v1/capability/mounts/{mount_id}/execute",
    },
    { status: 410 },
  );
};
