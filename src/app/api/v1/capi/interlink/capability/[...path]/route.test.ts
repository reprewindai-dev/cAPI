import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as legacyExecute } from "@/app/api/mount/execute/route";
import { GET, POST } from "./route";

type RouteContext = { params: Promise<{ path: string[] }> };

function context(...path: string[]): RouteContext {
  return { params: Promise.resolve({ path }) };
}

describe("cAPI Interlink capability bridge", () => {
  const originalBackendUrl = process.env.CAPPO_BACKEND_URL;

  beforeEach(() => {
    process.env.CAPPO_BACKEND_URL = "https://cappo.test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalBackendUrl === undefined) delete process.env.CAPPO_BACKEND_URL;
    else process.env.CAPPO_BACKEND_URL = originalBackendUrl;
  });

  it("forwards package discovery with the caller authorization", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ packages: [] }), {
        status: 206,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("http://localhost/api/v1/capi/interlink/capability/packages?cursor=next", {
        headers: { authorization: "Bearer caller-token" },
      }),
      context("packages"),
    );

    expect(response.status).toBe(206);
    expect(await response.text()).toBe(JSON.stringify({ packages: [] }));
    expect(response.headers.get("x-veklom-interlink")).toBe("capi");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cappo.test/v1/capability/packages?cursor=next",
      expect.objectContaining({
        method: "GET",
        headers: expect.any(Headers),
      }),
    );
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((options.headers as Headers).get("authorization")).toBe("Bearer caller-token");
    expect((options.headers as Headers).get("x-api-key")).toBeNull();
    expect((options.headers as Headers).get("cookie")).toBeNull();
  });

  it("forwards mount creation with the request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"decision":"allow"}', {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const body = '{"package_ref":"counter@v1"}';

    const response = await POST(
      new Request("http://localhost/api/v1/capi/interlink/capability/mounts", {
        method: "POST",
        body,
        headers: {
          authorization: "Bearer caller-token",
          "content-type": "application/json",
        },
      }),
      context("mounts"),
    );

    expect(response.status).toBe(201);
    expect(await response.text()).toBe('{"decision":"allow"}');
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://cappo.test/v1/capability/mounts");
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(ArrayBuffer);
    expect(new TextDecoder().decode(options.body as ArrayBuffer)).toBe(body);
  });

  it.each(["execute", "terminate"])(
    "does not bridge mounts/x/%s",
    async (action) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const response = await POST(
        new Request(`http://localhost/api/v1/capi/interlink/capability/mounts/x/${action}`, {
          method: "POST",
        }),
        context("mounts", "x", action),
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "INTERLINK_PATH_NOT_BRIDGED" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("does not bridge target-state readback for non-holders", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request(
        "http://localhost/api/v1/capi/interlink/capability/targets/activation.governed-counter/state?resource=counter&mount_id=mount-1",
      ),
      context("targets", "activation.governed-counter", "state"),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "INTERLINK_PATH_NOT_BRIDGED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards holder execute with the extended timeout", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"decision":"allow"}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const authorization = "Bearer vlm_mount-1.secret";

    const response = await POST(
      new Request("http://localhost/api/v1/capi/interlink/capability/mounts/mount-1/execute", {
        method: "POST",
        headers: { authorization },
      }),
      context("mounts", "mount-1", "execute"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-veklom-interlink-principal")).toBe("mount-holder");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cappo.test/v1/capability/mounts/mount-1/execute",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    );
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((options.headers as Headers).get("authorization")).toBe(authorization);
    expect((options.headers as Headers).get("x-api-key")).toBeNull();
  });

  it("forwards holder terminate with the extended timeout", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"decision":"allow"}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const authorization = "Bearer vlm_mount-1.secret";

    const response = await POST(
      new Request("http://localhost/api/v1/capi/interlink/capability/mounts/mount-1/terminate", {
        method: "POST",
        headers: { authorization },
      }),
      context("mounts", "mount-1", "terminate"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-veklom-interlink-principal")).toBe("mount-holder");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cappo.test/v1/capability/mounts/mount-1/terminate",
      expect.objectContaining({ method: "POST" }),
    );
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((options.headers as Headers).get("authorization")).toBe(authorization);
  });

  it("forwards holder target-state readback with its query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"state":{"value":1}}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const authorization = "Bearer vlm_mount-1.secret";

    const response = await GET(
      new Request(
        "http://localhost/api/v1/capi/interlink/capability/targets/activation.governed-counter/state?resource=counter&mount_id=mount-1",
        { headers: { authorization } },
      ),
      context("targets", "activation.governed-counter", "state"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-veklom-interlink-principal")).toBe("mount-holder");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cappo.test/v1/capability/targets/activation.governed-counter/state?resource=counter&mount_id=mount-1",
      expect.objectContaining({ method: "GET" }),
    );
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((options.headers as Headers).get("authorization")).toBe(authorization);
  });

  it("continues forwarding holder package discovery", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const authorization = "Bearer vlm_mount-1.secret";

    const response = await GET(
      new Request("http://localhost/api/v1/capi/interlink/capability/packages", {
        headers: { authorization },
      }),
      context("packages"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-veklom-interlink-principal")).toBe("mount-holder");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cappo.test/v1/capability/packages",
      expect.objectContaining({ method: "GET" }),
    );
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((options.headers as Headers).get("authorization")).toBe(authorization);
  });

  it("fails closed when CAPPO is not configured", async () => {
    delete process.env.CAPPO_BACKEND_URL;

    const response = await GET(
      new Request("http://localhost/api/v1/capi/interlink/capability/packages"),
      context("packages"),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "CAPPO_UNAVAILABLE" });
  });

  it("returns a timeout response when CAPPO aborts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted", "AbortError")),
    );

    const response = await GET(
      new Request("http://localhost/api/v1/capi/interlink/capability/packages"),
      context("packages"),
    );

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: "CAPPO_UNREACHABLE" });
  });

  it("retires the local mount execution route", async () => {
    const response = await legacyExecute(
      new Request("http://localhost/api/mount/execute", { method: "POST" }),
    );

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      error: "LEGACY_EXECUTION_ENTRYPOINT_RETIRED",
      detail:
        "cAPI mount registry does not grant execution authority. Consequences execute only through CAPPO.",
      execution_entrypoint: "/v1/capability/mounts/{mount_id}/execute",
    });
  });
});
