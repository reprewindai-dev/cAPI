import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export type McpServerType = "local-process" | "remote-http" | "remote-sse";

export interface McpServerDescriptor {
  id: string;
  displayName: string;
  type: McpServerType;
  
  // For local-process
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  
  // For remote HTTP/SSE
  serverUrl?: string;

  // Metadata
  registry?: string;
  disabled?: boolean;
}

export type McpServerStatus = "disconnected" | "connecting" | "connected" | "error";

export interface McpServerInstance {
  descriptor: McpServerDescriptor;
  status: McpServerStatus;
  tools: Tool[];
  client?: Client; // The connected MCP SDK Client instance
  error?: string;
}
