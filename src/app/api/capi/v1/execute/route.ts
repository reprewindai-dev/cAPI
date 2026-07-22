import { NextResponse } from "next/server";
import { postIntegration, IntegrationUnavailable, requireIntegration } from "@/lib/covenant/integrations";
import { executeInputSchema, readJson } from "@/lib/covenant/validation";
import { verifySnapshot } from "@/lib/mcp/snapshot";

export async function POST(request: Request) {
  const parsed = await readJson(request, executeInputSchema);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const cappoUrl = requireIntegration("CAPPO execution", process.env.CAPPO_EXECUTE_URL);
    const body = parsed.data;
    if (body.reauthorize_required === true || body.capability_version_mismatch === true) {
      return NextResponse.json({
        connection_id: body.connection_id,
        status: "quarantined",
        error: { code: "CONSEQUENTIAL_REAUTHORIZATION_REQUIRED", message: "Route back to CAPPO for reauthorization" },
      }, { status: 409 });
    }

    const snapshotHash = request.headers.get("X-Capability-Hash") || body.snapshot_hash;
    const snapshotSignature = request.headers.get("X-Capability-Signature") || body.snapshot_signature;
    if (!snapshotHash || !snapshotSignature || !verifySnapshot(snapshotHash, snapshotSignature)) {
      return NextResponse.json({ error: "Missing or invalid capability snapshot signature" }, { status: 403 });
    }

    // Determine if this is a native MCP execution or a proxy integration
    if (body.capability_id && body.capability_id.startsWith("mcp::")) {
      const { mcpOrchestrator } = await import("@/lib/mcp/orchestrator");
      const result = await mcpOrchestrator.executeTool(body.capability_id, body.input);
      return NextResponse.json({
        connection_id: body.connection_id,
        status: "success",
        data: result,
      });
    } else {
      const result = await postIntegration(cappoUrl, body, {
        "x-capability-hash": snapshotHash,
        "x-capability-signature": snapshotSignature,
      });
      return NextResponse.json(result);
    }
  } catch (error) {
    const status = error instanceof IntegrationUnavailable ? 503 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "CAPPO execution failed" }, { status });
  }
}
