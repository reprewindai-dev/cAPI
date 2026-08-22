import { describe, expect, it } from "vitest";
import { mcpOrchestrator } from "./orchestrator";

describe("native MCP consequence boundary", () => {
  it("refuses direct tool execution outside CAPPO", async () => {
    await expect(mcpOrchestrator.executeTool("mcp::server-1::write" , {}))
      .rejects.toThrow("CAPPO");
  });
});
