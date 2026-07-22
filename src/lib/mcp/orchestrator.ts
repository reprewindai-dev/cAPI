import { getEngine } from "../covenant/engine";
import type { CapabilityIdentity } from "../covenant/types";
import { McpDriver } from "./drivers/McpDriver";
import type { McpServerDescriptor, McpServerInstance } from "./schema";
import fs from "fs";
import path from "path";

class McpOrchestrator {
  private instances = new Map<string, McpServerInstance>();
  private initialized = false;

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const configPath = path.join(process.cwd(), "mcp-servers.json");
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        if (config.mcpServers) {
          for (const [id, serverConfig] of Object.entries<any>(config.mcpServers)) {
            if (!serverConfig.disabled) {
              const descriptor: McpServerDescriptor = {
                id,
                displayName: id,
                type: serverConfig.type || (serverConfig.command ? "local-process" : serverConfig.serverUrl ? "remote-sse" : "remote-http"),
                command: serverConfig.command,
                args: serverConfig.args,
                env: serverConfig.env,
                serverUrl: serverConfig.serverUrl,
              };
              // Start asynchronously in background
              this.startServer(descriptor).catch(err => console.error(`Failed to auto-start MCP ${id}:`, err));
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to load mcp-servers.json:", err);
    }
  }

  async startServer(descriptor: McpServerDescriptor): Promise<McpServerInstance> {
    if (this.instances.has(descriptor.id)) {
      return this.instances.get(descriptor.id)!;
    }

    const instance: McpServerInstance = {
      descriptor,
      status: "connecting",
      tools: []
    };
    this.instances.set(descriptor.id, instance);

    try {
      const { client, tools } = await McpDriver.connect(descriptor);
      instance.status = "connected";
      instance.tools = tools;
      instance.client = client;

      const engine = getEngine();

      for (const t of tools) {
        const capabilityId = `mcp::${descriptor.id}::${t.name}`;
        const cap: CapabilityIdentity = {
          capability_id: capabilityId,
          capability_name: t.name,
          description: t.description || `MCP tool ${t.name}`,
          provider_id: descriptor.id,
          endpoint: `mcp://${descriptor.id}/${t.name}`,
          input_schema: t.inputSchema as any,
          output_schema: { type: "object" },
          public_key: "",
          created_at: new Date().toISOString(),
          version: "1.0",
          identity_proof: `mcp-native:${descriptor.id}:${capabilityId}`,
          metadata: {
            category: "service",
            tags: ["mcp", descriptor.id],
            risk_level: "medium",
            requires_approval: false,
            audit_level: "standard",
            provider: descriptor.id,
            cost: "credits",
            rate_limit: 60,
          },
        };
        engine.runtime.registerCapability(cap);
      }
    } catch (err: any) {
      instance.status = "error";
      instance.error = err.message;
      console.error(`Failed to start MCP server ${descriptor.id}:`, err);
    }

    return instance;
  }

  async executeTool(capabilityId: string, args: Record<string, unknown>): Promise<any> {
    // capabilityId looks like: "mcp::server_id::tool_name"
    const parts = capabilityId.split("::");
    if (parts.length !== 3 || parts[0] !== "mcp") {
      throw new Error(`Invalid MCP capability ID: ${capabilityId}`);
    }
    const serverId = parts[1];
    const toolName = parts[2];

    const instance = this.instances.get(serverId);
    if (!instance || instance.status !== "connected" || !instance.client) {
      throw new Error(`MCP server ${serverId} is not connected`);
    }

    // Use the official SDK to execute the tool natively
    const result = await instance.client.callTool({
      name: toolName,
      arguments: args,
    });
    return result;
  }

  getInstances(): McpServerInstance[] {
    return Array.from(this.instances.values());
  }

  getInstance(id: string): McpServerInstance | undefined {
    return this.instances.get(id);
  }
}

// Global singleton for Next.js hot-reload persistence
const g = globalThis as unknown as { __mcpOrchestrator?: McpOrchestrator };
if (!g.__mcpOrchestrator) {
  g.__mcpOrchestrator = new McpOrchestrator();
}
export const mcpOrchestrator = g.__mcpOrchestrator;
