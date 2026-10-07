import { describe, expect, it } from "vitest";
import { mcpOrchestrator } from "./orchestrator";

// Connected MCP servers are for discovery only. A method that calls their tools
// directly would be a consequence path around CAPPO; it must not come back.
describe("MCP orchestrator", () => {
  it("exposes no direct tool execution", () => {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(mcpOrchestrator));
    expect(methods).not.toContain("executeTool");
    expect(methods.filter((m) => /call|exec|invoke/i.test(m))).toEqual([]);
  });
});
