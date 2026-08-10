import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as register } from "./route";
import { GET as services } from "../services/route";
import { POST as heartbeat } from "../heartbeat/route";
import { GET as state } from "@/app/api/state/route";

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const REGISTER_URL = "http://localhost/api/v1/registry/register";
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  delete process.env.CAPI_REGISTRY_TOKEN;
  if (ORIGINAL_NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  }
});

describe("POST /api/v1/registry/register", () => {
  it("registers a service, mirrors executable capabilities, and records declared-only names", async () => {
    const res = await register(
      post(REGISTER_URL, {
        service_name: "lockerphycer-test-a",
        base_url: "https://locker.internal",
        telemetry_supported: true,
        capabilities: [
          "identity",
          "sso",
          { name: "verify_token", endpoint: "https://locker.internal/mcp/verify", category: "service" },
        ],
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.authenticated).toBe(false); // no CAPI_REGISTRY_TOKEN configured outside production
    expect(body.capabilities_registered).toBe(1);
    expect(body.declared_capabilities).toEqual(["identity", "sso"]);
    expect(body.executable_capability_ids).toContain("svc::lockerphycer-test-a::verify_token");

    const snapshot = await (await state()).json();
    expect(snapshot.services.some((s: { service_name: string }) => s.service_name === "lockerphycer-test-a")).toBe(true);
    expect(
      snapshot.capabilities.some(
        (c: { capability_id: string }) => c.capability_id === "svc::lockerphycer-test-a::verify_token",
      ),
    ).toBe(true);
    expect(snapshot.proof.source).toBe("self-registration");

    const svc = await (await services()).json();
    expect(svc.services.some((s: { service_name: string; stale: boolean }) => s.service_name === "lockerphycer-test-a")).toBe(true);
  });

  it("rejects an invalid body", async () => {
    const res = await register(post(REGISTER_URL, { capabilities: ["x"] }));
    expect(res.status).toBe(400);
  });

  it("fails closed in production when registry authentication is not configured", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.CAPI_REGISTRY_TOKEN;
    const serviceName = "svc-production-missing-token";

    const denied = await register(post(REGISTER_URL, { service_name: serviceName }));
    expect(denied.status).toBe(503);
    expect(await denied.json()).toEqual({ error: "Registry authentication is not configured" });

    const svc = await (await services()).json();
    expect(svc.services.some((s: { service_name: string }) => s.service_name === serviceName)).toBe(false);
  });

  it("enforces the registry token when configured", async () => {
    process.env.CAPI_REGISTRY_TOKEN = "s3cret-token";

    const denied = await register(
      post(REGISTER_URL, { service_name: "svc-denied" }, { authorization: "Bearer wrong" }),
    );
    expect(denied.status).toBe(401);

    const allowed = await register(
      post(REGISTER_URL, { service_name: "svc-allowed" }, { authorization: "Bearer s3cret-token" }),
    );
    expect(allowed.status).toBe(201);
    expect((await allowed.json()).authenticated).toBe(true);
  });

  it("heartbeat refreshes a known service and 404s an unknown one", async () => {
    await register(post(REGISTER_URL, { service_name: "svc-hb" }));

    const ok = await heartbeat(post("http://localhost/api/v1/registry/heartbeat", { service_name: "svc-hb" }));
    expect(ok.status).toBe(200);

    const missing = await heartbeat(
      post("http://localhost/api/v1/registry/heartbeat", { service_name: "svc-nope" }),
    );
    expect(missing.status).toBe(404);
  });
});