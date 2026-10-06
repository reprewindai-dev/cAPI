import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/mcp/sse", () => {
  it("is retired and points clients at the Streamable HTTP endpoint", async () => {
    const response = await GET(new Request("http://localhost/api/mcp/sse"));
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(response.headers.get("content-type")).not.toMatch(/text\/event-stream/);
    expect(body.mcp_endpoint).toBe("/mcp");
    expect(JSON.stringify(body)).not.toContain("/api/mcp/message");
  });
});
