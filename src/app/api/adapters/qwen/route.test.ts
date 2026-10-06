import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "fs";
import { POST } from "./route";

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, writeFileSync: vi.fn(), mkdirSync: vi.fn() };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/adapters/qwen", () => {
  it("is retired and never writes to the server filesystem", async () => {
    const response = await POST(new Request("http://localhost/api/adapters/qwen", {
      method: "POST",
      body: JSON.stringify({ workspace: { id: "attacker-controlled" } }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(410);
    expect((await response.json()).error).toBe("QWEN_ADAPTER_RETIRED");
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
    expect(vi.mocked(mkdirSync)).not.toHaveBeenCalled();
  });
});
