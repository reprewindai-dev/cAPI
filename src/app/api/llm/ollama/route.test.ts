import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

function post(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/llm/ollama", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ prompt: "hello" }),
  });
}

const ORIGINAL_TOKEN = process.env.COVENANT_ADMIN_TOKEN;

beforeEach(() => {
  process.env.COVENANT_ADMIN_TOKEN = "ollama-admin-token";
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_TOKEN === undefined) delete process.env.COVENANT_ADMIN_TOKEN;
  else process.env.COVENANT_ADMIN_TOKEN = ORIGINAL_TOKEN;
});

describe("POST /api/llm/ollama", () => {
  it("refuses to proxy without the admin token and never contacts Ollama", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const missing = await POST(post());
    const wrong = await POST(post({ "x-covenant-admin-token": "wrong" }));

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("locks the proxy when no admin token is configured", async () => {
    delete process.env.COVENANT_ADMIN_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(post({ "x-covenant-admin-token": "anything" }));

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards to Ollama only once the admin token is presented", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ model: "m", response: "ok", eval_count: 1, eval_duration: 1 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(post({ authorization: "Bearer ollama-admin-token" }));

    expect(response.status).toBe(200);
    expect((await response.json()).response).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
