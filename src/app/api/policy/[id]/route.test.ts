import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

describe("POST /api/policy/:id", () => {
  beforeEach(() => { process.env.COVENANT_ADMIN_TOKEN = "test-token"; });

  it("rejects a non-boolean enabled value", async () => {
    const response = await POST(new NextRequest("http://localhost/api/policy/policy-1", {
      method: "POST",
      body: JSON.stringify({ enabled: "true" }),
      headers: { "content-type": "application/json", "x-covenant-admin-token": "test-token" },
    }), { params: Promise.resolve({ id: "policy-1" }) });

    expect(response?.status).toBe(400);
  });
});
