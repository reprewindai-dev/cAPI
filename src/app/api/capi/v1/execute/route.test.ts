import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/capi/v1/execute", () => {
  it("rejects oversized bounded input before any integration call", async () => {
    const response = await POST(new Request("http://localhost/api/capi/v1/execute", {
      method: "POST",
      body: JSON.stringify({
        connection_id: "connection-1",
        agent_id: "agent-1",
        agent_signature: "signature",
        capability_id: "capability-1",
        action: "a".repeat(257),
        input: {},
        timestamp: new Date().toISOString(),
      }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(400);
  });
});
