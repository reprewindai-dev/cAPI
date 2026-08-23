import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/request", () => {
  it("rejects oversized actions at the route boundary", async () => {
    process.env.BYOS_INTERNAL_API_KEY = "test-internal-key";
    const response = await POST(new Request("http://localhost/api/request", {
      method: "POST",
      body: JSON.stringify({ agent_id: "agent-1", capability_id: "cap-1", action: "a".repeat(257) }),
      headers: { "content-type": "application/json", "x-api-key": "test-internal-key" },
    }) as any);

    expect(response.status).toBe(400);
  });
});
