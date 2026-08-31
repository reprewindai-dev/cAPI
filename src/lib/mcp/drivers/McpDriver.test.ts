import { afterEach, describe, expect, it } from "vitest";
import { McpDriver } from "./McpDriver";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

describe("McpDriver production transport policy", () => {
  it("fails closed for remote-sse until every SDK network operation is policy-bound", async () => {
    process.env.NODE_ENV = "production";

    await expect(
      McpDriver.connect({
        id: "remote-sse-production",
        displayName: "Remote SSE production probe",
        type: "remote-sse",
        serverUrl: "https://example.com/mcp",
      }),
    ).rejects.toThrow(
      "remote-sse MCP is disabled in production until outbound policy enforcement covers every transport operation",
    );
  });
});
