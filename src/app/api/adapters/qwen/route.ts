import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Retired Qwen CLI home-directory adapter.
 *
 * This route used to write `~/.qwen/**` on the cAPI host from an
 * unauthenticated request body. cAPI has no legitimate production reason to
 * write files into its own home directory on behalf of a caller: the Qwen
 * install template is applied by the ECC installer on the operator's machine,
 * not by the discovery service. It is retired rather than gated so the
 * capability does not exist to be misconfigured.
 */
export async function POST(_request: Request) {
  return NextResponse.json(
    {
      error: "QWEN_ADAPTER_RETIRED",
      detail:
        "cAPI no longer writes Qwen CLI configuration to the server's home directory. " +
        "Apply the Qwen template locally with the ECC installer (./install.sh --target qwen).",
    },
    { status: 410 },
  );
}
