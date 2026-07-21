import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/budget", () => {
  beforeEach(() => { process.env.COVENANT_ADMIN_TOKEN = "test-token"; });

  it("rejects negative and unbounded budgets", async () => {
    const response = await POST(new Request("http://localhost/api/budget", {
      method: "POST",
      body: JSON.stringify({ agent_id: "agent-1", capability_id: "cap-1", budget: -1 }),
      headers: { "content-type": "application/json", "x-covenant-admin-token": "test-token" },
    }) as any);

    expect(response.status).toBe(400);
  });
});
