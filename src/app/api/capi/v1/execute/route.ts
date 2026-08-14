import { NextResponse } from "next/server";

/**
 * Legacy cAPI execution proxy.
 *
 * cAPI is the MCP/discovery boundary. It must not expose a second public
 * consequence-bearing path; callers execute only through CAPPO's /v1/exec
 * authority boundary. This is deliberately a clear migration response rather
 * than an HTTP redirect because the two contracts have different security
 * semantics.
 */
export async function POST(_request: Request) {
  return NextResponse.json(
    {
      error: "LEGACY_EXECUTION_ENTRYPOINT_RETIRED",
      detail: "cAPI discovery does not grant execution authority. Use the governed /v1/exec boundary.",
      execution_entrypoint: "/v1/exec",
    },
    { status: 410 },
  );
}
