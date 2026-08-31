import { afterEach, describe, expect, it, vi } from "vitest";
import { McpDriver } from "./McpDriver";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("McpDriver remote transport policy", () => {
  it.each(["production", "development"])(
    "fails closed for remote-sse in %s until every SDK network operation is address-pinned",
    async (nodeEnv) => {
      vi.stubEnv("NODE_ENV", nodeEnv);

      await expect(
        McpDriver.connect({
          id: `remote-sse-${nodeEnv}`,
          displayName: "Remote SSE policy probe",
          type: "remote-sse",
          serverUrl: "https://example.com/mcp",
        }),
      ).rejects.toThrow(
        "remote-sse MCP is disabled until every transport operation is bound to validated outbound addresses",
      );
    },
  );
});
