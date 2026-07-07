/**
 * ToolRegistry — in-memory registry of dynamically registered MCP tool schemas.
 *
 * Populated by dynamic-mcp.ts when a SaaS OpenAPI spec is translated.
 * Read by /api/mcp/servers (list) and /api/proxy (routing).
 * Zero I/O on reads — all access is O(n) dict lookup.
 */

export interface DynamicTool {
  /** Stable unique name: "{serverId}__{operationId}" */
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
    required: string[];
  };
  /** Routing metadata — not exposed to agents */
  _meta: {
    server_id: string;
    base_url: string;
    path: string;
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    /** capability_id registered into CovenantRuntime */
    capability_id: string;
  };
}

export interface RegisteredServer {
  server_id: string;
  base_url: string;
  openapi_url: string;
  registered_at: string;
  tool_count: number;
}

class ToolRegistry {
  private tools = new Map<string, DynamicTool[]>();
  private servers = new Map<string, RegisteredServer>();

  set(server_id: string, tools: DynamicTool[], meta: Omit<RegisteredServer, "tool_count">): void {
    this.tools.set(server_id, tools);
    this.servers.set(server_id, { ...meta, tool_count: tools.length });
  }

  getTools(server_id: string): DynamicTool[] {
    return this.tools.get(server_id) ?? [];
  }

  getAllTools(): DynamicTool[] {
    return [...this.tools.values()].flat();
  }

  getServer(server_id: string): RegisteredServer | undefined {
    return this.servers.get(server_id);
  }

  listServers(): RegisteredServer[] {
    return [...this.servers.values()];
  }

  /** Resolve a DynamicTool by its capability_id (used by proxy router). */
  findByCap(capability_id: string): DynamicTool | undefined {
    for (const tools of this.tools.values()) {
      const t = tools.find((x) => x._meta.capability_id === capability_id);
      if (t) return t;
    }
    return undefined;
  }

  /** Resolve a DynamicTool by server_id + URL path (used by transparent proxy). */
  findByPath(server_id: string, path: string): DynamicTool | undefined {
    return this.tools.get(server_id)?.find((t) => t._meta.path === `/${path}` || t._meta.path === path);
  }
}

// Process-wide singleton — survives Next.js hot reloads via globalThis pinning.
const g = globalThis as unknown as { __toolRegistry?: ToolRegistry };
if (!g.__toolRegistry) g.__toolRegistry = new ToolRegistry();

export const toolRegistry = g.__toolRegistry;
