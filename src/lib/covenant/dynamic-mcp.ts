/**
 * Dynamic MCP Translator — OpenAPI → CapabilityIdentity + DynamicTool
 *
 * Fetches an OpenAPI 3.x or Swagger 2.x spec from a URL, translates every
 * HTTP operation into:
 *   1. A DynamicTool schema (exposed to agents via /api/mcp/servers)
 *   2. A CapabilityIdentity registered into the CovenantRuntime (so Phase 6
 *      can route the call through MCPBridge.callHTTP)
 *
 * The proxy endpoint (/api/proxy/{serverId}/{...path}) is the actual forwarder.
 * Governance — all 9 phases — still runs for every proxied call because the
 * capability is registered in the runtime just like any native capability.
 */

import { randomUUID } from "crypto";
import { getEngine } from "./engine";
import { toolRegistry, type DynamicTool } from "./tool-registry";
import type { CapabilityIdentity } from "./types";

// ---------------------------------------------------------------------------
// Minimal OpenAPI types we care about
// ---------------------------------------------------------------------------

interface OAPIParameter {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: { type?: string };
}

interface OAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OAPIParameter[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: { properties?: Record<string, { type?: string; description?: string }> } }>;
  };
  tags?: string[];
}

interface OAPISpec {
  openapi?: string;
  swagger?: string;
  info?: { title?: string; version?: string };
  paths?: Record<string, Record<string, OAPIOperation>>;
}

const SUPPORTED_METHODS = ["get", "post", "put", "delete", "patch"] as const;
type SupportedMethod = (typeof SUPPORTED_METHODS)[number];

// ---------------------------------------------------------------------------
// Schema builder
// ---------------------------------------------------------------------------

function buildInputSchema(op: OAPIOperation): DynamicTool["inputSchema"] {
  const properties: Record<string, { type: string; description?: string }> = {};
  const required: string[] = [];

  // Parameters (path, query, header)
  for (const p of op.parameters ?? []) {
    properties[p.name] = {
      type: p.schema?.type ?? "string",
      description: p.description,
    };
    if (p.required) required.push(p.name);
  }

  // Request body — flatten first application/json schema properties
  const bodyContent = op.requestBody?.content;
  if (bodyContent) {
    const jsonSchema = (bodyContent["application/json"] ?? Object.values(bodyContent)[0])?.schema;
    for (const [key, val] of Object.entries(jsonSchema?.properties ?? {})) {
      properties[key] = { type: val.type ?? "string", description: val.description };
    }
    if (op.requestBody?.required && Object.keys(jsonSchema?.properties ?? {}).length > 0) {
      required.push(...Object.keys(jsonSchema?.properties ?? {}));
    }
  }

  return { type: "object", properties, required: [...new Set(required)] };
}

function sanitizeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, "_").replace(/__+/g, "_");
}

// ---------------------------------------------------------------------------
// Core translator
// ---------------------------------------------------------------------------

export async function translateOpenApiToMcp(
  serverId: string,
  openapiUrl: string,
  baseUrl: string,
): Promise<DynamicTool[]> {
  // Fetch the spec
  const res = await fetch(openapiUrl, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Failed to fetch OpenAPI spec: ${res.status} ${openapiUrl}`);
  const spec = (await res.json()) as OAPISpec;

  if (!spec.paths) throw new Error(`OpenAPI spec at ${openapiUrl} has no paths`);

  const engine = getEngine();
  const tools: DynamicTool[] = [];

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const rawMethod of SUPPORTED_METHODS) {
      const op = methods[rawMethod] as OAPIOperation | undefined;
      if (!op) continue;

      const operationId = op.operationId
        ? sanitizeId(op.operationId)
        : sanitizeId(`${rawMethod}_${path}`);

      const toolName = `${sanitizeId(serverId)}__${operationId}`;
      const capabilityId = `dynamic::${sanitizeId(serverId)}::${operationId}`;
      // Endpoint uses the proxy so all calls flow through Covenant governance
      const proxyEndpoint = `https://${process.env.NEXT_PUBLIC_APP_URL ?? "localhost:3002"}/api/proxy/${serverId}${path}`;

      const tool: DynamicTool = {
        name: toolName,
        description: op.summary ?? op.description ?? `${rawMethod.toUpperCase()} ${path}`,
        inputSchema: buildInputSchema(op),
        _meta: {
          server_id: serverId,
          base_url: baseUrl,
          path,
          method: rawMethod.toUpperCase() as DynamicTool["_meta"]["method"],
          capability_id: capabilityId,
        },
      };

      tools.push(tool);

      // Register as a CapabilityIdentity in the CovenantRuntime so Phase 2
      // policy checks and Phase 6 MCPBridge routing work out of the box.
      const cap: CapabilityIdentity = {
        capability_id: capabilityId,
        capability_name: toolName,
        description: tool.description,
        provider_id: serverId,
        endpoint: proxyEndpoint,          // https:// → MCPBridge.callHTTP
        input_schema: tool.inputSchema,
        output_schema: { type: "object" },
        public_key: "",
        created_at: new Date().toISOString(),
        version: spec.info?.version ?? "1.0",
        identity_proof: `openapi:${serverId}:${capabilityId}`,
        metadata: {
          category: "service",
          tags: [...(op.tags ?? []), "dynamic", serverId],
          risk_level: "medium",
          requires_approval: false,
          audit_level: "standard",
          provider: serverId,
          cost: "credits",
          rate_limit: 60,
        },
      };
      engine.runtime.registerCapability(cap);
    }
  }

  // Store in registry
  toolRegistry.set(serverId, tools, {
    server_id: serverId,
    base_url: baseUrl,
    openapi_url: openapiUrl,
    registered_at: new Date().toISOString(),
  });

  return tools;
}
