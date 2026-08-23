import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { McpServerDescriptor } from "../schema";

const LOCAL_PROCESS_ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SYSTEMROOT",
] as const;

function localProcessAllowed(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.CAPI_ALLOW_LOCAL_PROCESS_MCP === "true";
}

function buildLocalProcessEnv(descriptor: McpServerDescriptor): Record<string, string> {
  const env: Record<string, string> = {};

  for (const key of LOCAL_PROCESS_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value) env[key] = value;
  }

  // Only explicitly supplied descriptor variables are added. Never spread
  // process.env into a spawned MCP child: cAPI service secrets must not cross
  // the execution boundary.
  for (const [key, value] of Object.entries(descriptor.env ?? {})) {
    env[key] = value;
  }

  return env;
}

export class McpDriver {
  static async connect(descriptor: McpServerDescriptor): Promise<{ client: Client, tools: any[] }> {
    const client = new Client({
      name: "veklom-capi",
      version: "1.0.0",
    }, {
      capabilities: {},
    });

    let transport;

    if (descriptor.type === "local-process" && descriptor.command) {
      if (!localProcessAllowed()) {
        throw new Error("local-process MCP is disabled; use a remote MCP transport");
      }

      transport = new StdioClientTransport({
        command: descriptor.command,
        args: descriptor.args ?? [],
        env: buildLocalProcessEnv(descriptor),
      });
    } else if (descriptor.type === "remote-sse" && descriptor.serverUrl) {
      transport = new SSEClientTransport(new URL(descriptor.serverUrl));
    } else {
      throw new Error(`Unsupported or misconfigured MCP descriptor type: ${descriptor.type}`);
    }

    await client.connect(transport);

    const toolsResult = await client.listTools();
    const tools = toolsResult.tools ?? [];

    return { client, tools };
  }
}
