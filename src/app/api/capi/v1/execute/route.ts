import { NextResponse } from "next/server";
import { postIntegration, IntegrationUnavailable, requireIntegration, AuthorityDenied } from "@/lib/covenant/integrations";
import { executeInputSchema, readJson } from "@/lib/covenant/validation";
import { verifySnapshot } from "@/lib/mcp/snapshot";

export async function POST(request: Request) {
  const parsed = await readJson(request, executeInputSchema);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const rawCappoUrl = process.env.CAPPO_EXECUTE_URL || (process.env.CAPPO_BACKEND_URL ? process.env.CAPPO_BACKEND_URL + "/v1/exec" : undefined);
    const cappoUrl = requireIntegration("CAPPO execution", rawCappoUrl);
    const cappoBaseUrl = requireIntegration("CAPPO backend", process.env.CAPPO_BACKEND_URL);
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
      // Gate native MCP tool execution behind CAPPO authority
      const authResult = await postIntegration(`${cappoBaseUrl}/api/v1/execution/authorize`, {
        agent_id: body.agent_id,
        capability_id: body.capability_id,
        request: body.input || {}
      }, {
        "x-api-key": process.env.CAPPO_API_KEY || "",
      });
      
      if (authResult.decision !== "APPROVED") {
        throw new AuthorityDenied(`MCP execution denied by CAPPO authority: ${authResult.reason || "Unauthorized"}`);
      }

      const { mcpOrchestrator } = await import("@/lib/mcp/orchestrator");
      const result = await mcpOrchestrator.executeTool(body.capability_id, body.input);
      return NextResponse.json({
        connection_id: body.connection_id,
        status: "success",
        data: result,
      });
    } else {
      // Internal CAPPO authentication is deployment configuration. Missing credentials fail closed.
      const cappoApiKey = requireIntegration("CAPPO API key", process.env.CAPPO_API_KEY);
      const result = await postIntegration(cappoUrl, body, {
        "x-capability-hash": snapshotHash,
        "x-capability-signature": snapshotSignature,
        "x-api-key": cappoApiKey,
      });
      return NextResponse.json(result);
    }
  } catch (error) {
    if (error instanceof AuthorityDenied) {
      return NextResponse.json({
        status: "denied",
        error: { code: "AUTHORITY_DENIED", message: error.message }
      }, { status: 403 });
    }
    const status = error instanceof IntegrationUnavailable ? 503 : 502;
    if (status === 503) {
      return NextResponse.json({
        status: "degraded",
        mode: "read_only",
        error: error instanceof Error ? error.message : "CAPPO execution failed"
      }, { status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "CAPPO execution failed" }, { status });
  }
}
