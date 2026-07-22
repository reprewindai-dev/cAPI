import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { McpServerDescriptor, McpServerInstance } from "../schema";

export class McpDriver {
  static async connect(descriptor: McpServerDescriptor): Promise<{ client: Client, tools: any[] }> {
    const client = new Client({
      name: "veklom-capi",
      version: "1.0.0",
    }, {
      capabilities: {}
    });

    let transport;

    if (descriptor.type === "local-process" && descriptor.command) {
      transport = new StdioClientTransport({
        command: descriptor.command,
        args: descriptor.args ?? [],
        env: {
          ...process.env,
          ...(descriptor.env ?? {})
        } as Record<string, string>,
      });
    } else if (descriptor.type === "remote-sse" && descriptor.serverUrl) {
      transport = new SSEClientTransport(new URL(descriptor.serverUrl));
    } else {
      throw new Error(`Unsupported or misconfigured MCP descriptor type: ${descriptor.type}`);
    }

    await client.connect(transport);
    
    // Fetch initial tools
    const toolsResult = await client.listTools();
    const tools = toolsResult.tools ?? [];

    return { client, tools };
  }
}
