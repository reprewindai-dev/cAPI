import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/request", () => {
  it("rejects oversized actions at the route boundary", async () => {
    const response = await POST(new Request("http://localhost/api/request", {
      method: "POST",
      body: JSON.stringify({ agent_id: "agent-1", capability_id: "cap-1", action: "a".repeat(257) }),
      headers: { "content-type": "application/json" },
    }) as any);

    expect(response.status).toBe(400);
  });

  it.each([
    ["approvals", { approvals: ["human:cfo"] }],
    ["tamper", { tamper: true }],
  ])("rejects caller-supplied %s on the server-signed path", async (_field, extra) => {
    const serverCall = { agent_id: "agent-1", capability_id: "cap-1", action: "read", input: {} };
    const post = (body: unknown) => POST(new Request("http://localhost/api/request", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }) as any);

    const control = await post(serverCall);
    const rejected = await post({ ...serverCall, ...extra });

    // The same body without the runtime-internal field clears validation
    // (it fails later, on registry/signing-key checks), so the 400 is the field.
    expect(control.status).not.toBe(400);
    expect(rejected.status).toBe(400);
  });
});
