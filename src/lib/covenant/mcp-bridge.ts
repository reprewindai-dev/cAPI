/**
 * Covenant MCP Bridge — Phase 6 Execution
 *
 * Replaces the deterministic stub in runtime.ts executeCapability() with a
 * live call to the Veklom BYOS MCP gateway. Every call is:
 *   - Authenticated with a signed execution token (EI)
 *   - Routed by capability.endpoint (mcp:// | http:// | local://)
 *   - Traced with timing and output hash for Phase 7 evidence sealing
 *
 * Drop-in replacement: swap executeCapability() in runtime.ts for
 * MCPBridge.execute() — signature is identical.
 */

import { createHash, randomUUID } from "crypto";
import type { CapabilityIdentity, CovenantRequest, CapabilityMethod } from "./types";
import {
  canonicalJson,
  signCappoExecutionRequest,
  signCanonicalCapiEnvelope,
} from "./http-message-signatures";

// ---------------------------------------------------------------------------
// Config — pulled from env so nothing is hardcoded
// ---------------------------------------------------------------------------

const EXECUTION_TIMEOUT = Number(process.env.COVENANT_EXEC_TIMEOUT_MS ?? 10_000);
const ALLOW_LOCAL_EXECUTION = process.env.COVENANT_ALLOW_LOCAL_EXECUTION === "true";


// ---------------------------------------------------------------------------
// Execution result — matches what generateEvidence() expects
// ---------------------------------------------------------------------------

export interface BridgeResult {
  output:       Record<string, unknown>;
  execution_ms: number;
  method:       CapabilityMethod;
  endpoint:     string;
  transport:    "mcp" | "http" | "local";
  retried:      number;
}

// ---------------------------------------------------------------------------
// The bridge
// ---------------------------------------------------------------------------

export class MCPBridge {
  /**
   * Execute a capability through the appropriate transport.
   *
   * Routing logic:
   *   mcp://      → CAPPO /v1/exec (CAPPO selects an authorized provider)
   *   http://     → CAPPO /v1/exec
   *   https://    → CAPPO /v1/exec
   *   local://    → In-process stub (development / test only)
   */
  static async execute(
    capability: CapabilityIdentity,
    request:    CovenantRequest,
  ): Promise<BridgeResult> {
    const t0      = performance.now();
    const method  = capability.endpoint.split("://")[0] as CapabilityMethod;

    try {
      let output: Record<string, unknown>;
      let retried = 0;

      if (method === "mcp" || method === "http" || method === "https") {
        ({ output, retried } = await MCPBridge.callHTTP(capability, request));
      } else if (ALLOW_LOCAL_EXECUTION) {
        throw new Error("local capability execution is not an evidence-backed integration");
      } else {
        output = {
          ok: false,
          error: "local execution disabled; configure a real mcp/http/https capability endpoint",
          capability: capability.capability_name,
        };
        retried = 0;
      }

      return {
        output: output,
        execution_ms: Number((performance.now() - t0).toFixed(2)),
        method,
        endpoint: capability.endpoint,
        transport: method === "mcp" ? "mcp" : method === "local" ? "local" : "http",
        retried,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Surface as structured error output so Phase 7 can still seal evidence
      return {
        output:       { ok: false, error: message, capability: capability.capability_name },
        execution_ms: Number((performance.now() - t0).toFixed(2)),
        method,
        endpoint:     capability.endpoint,
        transport:    "mcp",
        retried:      0,
      };
    }
  }

  // -------------------------------------------------------------------------
  // HTTP/HTTPS capability request through CAPPO (never direct provider execution)
  // -------------------------------------------------------------------------

  private static async callHTTP(
    capability: CapabilityIdentity,
    request:    CovenantRequest,
  ): Promise<{ output: Record<string, unknown>; retried: number }> {
    const cappoKey = process.env.CAPPO_INTERNAL_EXEC_KEY?.trim();
    const cappoEndpoint = process.env.CAPPO_EXECUTION_URL?.trim();
    const signingKey = process.env.COVENANT_HTTP_SIGNING_PRIVATE_KEY?.trim();
    const signingKeyId = process.env.COVENANT_HTTP_SIGNING_KEY_ID?.trim();
    if (!cappoKey || !cappoEndpoint || !signingKey || !signingKeyId) {
      throw new Error("CAPPO execution integration is not configured");
    }
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), EXECUTION_TIMEOUT);

    // cAPI provides identity and capability resolution only. CAPPO receives
    // the consequence request and remains the sole semantic authority. No
    // directive/grant is fabricated here; an incomplete authority request is
    // intentionally denied by CAPPO rather than sent to the provider.
    const payloadWithoutSecurity = {
      prompt: request.input?.prompt ?? "",
      agent_id: request.agent_id,
      pgl_id: request.agent_id,
      workspace_id: (request.context.user_context?.workspace_id as string | undefined) ?? "default",
      tenant_id: "default",
      delegation_depth: 0,
      budget_approved_cents: 0,
      action_cost_cents: 0,
      scope: { tools: [capability.capability_id] },
      genome_hash: null,
      constitution_hash: null,
      plan_hash: null,
      action: request.action,
      directive: null,
      risk_tier: null,
      execution_mode: "live",
    };
    const nonce = randomUUID();
    const securityPayload = {
      actor_id: request.agent_id,
      action: request.action || "execute",
      data_hash: createHashHex(canonicalJson(payloadWithoutSecurity)),
      nonce,
    };
    const cappoPayload = {
      ...payloadWithoutSecurity,
      security: { nonce, signature: signCanonicalCapiEnvelope(securityPayload, signingKey) },
    };
    const serialized = JSON.stringify(cappoPayload);

    const res = await fetch(cappoEndpoint, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "X-Covenant-Id": request.connection_id,
        "X-Agent-Id":    request.agent_id,
        "X-API-Key":     cappoKey,
        ...signCappoExecutionRequest(cappoEndpoint, serialized, signingKey, signingKeyId),
      },
      body:   serialized,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const body = await res.json() as Record<string, unknown>;
    return { output: { ok: res.ok, status: res.status, ...body }, retried: 0 };
  }

}

function createHashHex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
