/**
 * POST /api/v1/registry/register
 *
 * Self-registration primitive. Downstream Veklom services (lockerphycer, BYOS,
 * CAPPO, gnomledger, …) announce themselves and the capabilities they expose.
 * This is the discovery half of "one call that discovers, authorizes, executes,
 * proves, and learns".
 *
 * Auth: when CAPI_REGISTRY_TOKEN is set, a matching `Authorization: Bearer …`
 * is required; the registration is flagged `authenticated`. When the token is
 * unset, unauthenticated registration is permitted only in explicitly local,
 * development, or test environments. Unset/unknown/staging/production values
 * fail closed when registry authentication is not configured.
 */

import { NextResponse } from "next/server";
import { getEngine } from "@/lib/covenant/engine";
import { readJson, serviceRegistrationSchema } from "@/lib/covenant/validation";
import type { RegisteredCapability } from "@/lib/covenant/service-registry";

export const dynamic = "force-dynamic";

type CapabilityEntry =
  | string
  | {
      name: string;
      description?: string;
      endpoint?: string;
      input_schema?: Record<string, unknown>;
      category?: RegisteredCapability["category"];
      risk_level?: RegisteredCapability["risk_level"];
      requires_approval?: boolean;
    };

type AuthCheck = {
  ok: boolean;
  authenticated: boolean;
  configurationError: boolean;
};

const UNAUTHENTICATED_REGISTRY_ENVIRONMENTS = new Set(["local", "development", "test"]);

function normalizeCapabilities(entries: CapabilityEntry[] | undefined): RegisteredCapability[] {
  if (!entries) return [];
  return entries.map((entry) =>
    typeof entry === "string" ? { name: entry } : { ...entry },
  );
}

function checkAuth(request: Request): AuthCheck {
  const expected = process.env.CAPI_REGISTRY_TOKEN?.trim();
  const header = request.headers.get("authorization")?.trim() ?? "";
  const presented = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";

  if (!expected) {
    const environment = process.env.NODE_ENV?.trim().toLowerCase() ?? "";
    if (!UNAUTHENTICATED_REGISTRY_ENVIRONMENTS.has(environment)) {
      return { ok: false, authenticated: false, configurationError: true };
    }
    // Explicit local/dev/test posture: accept but mark unauthenticated.
    return { ok: true, authenticated: false, configurationError: false };
  }

  if (presented && presented === expected) {
    return { ok: true, authenticated: true, configurationError: false };
  }

  return { ok: false, authenticated: false, configurationError: false };
}

export async function POST(request: Request) {
  const auth = checkAuth(request);
  if (auth.configurationError) {
    return NextResponse.json(
      { error: "Registry authentication is not configured" },
      { status: 503 },
    );
  }
  if (!auth.ok) {
    return NextResponse.json(
      { error: "Invalid or missing registry token" },
      { status: 401 },
    );
  }

  const parsed = await readJson(request, serviceRegistrationSchema);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const body = parsed.data;
  const result = await getEngine().registerService(
    {
      service_name: body.service_name,
      base_url: body.base_url,
      public_key: body.public_key,
      telemetry_supported: body.telemetry_supported,
      capabilities: normalizeCapabilities(body.capabilities as CapabilityEntry[] | undefined),
      metadata: body.metadata,
    },
    auth.authenticated,
  );

  return NextResponse.json(
    {
      ok: true,
      service_name: result.registration.service_name,
      authenticated: result.registration.authenticated,
      capabilities_registered: result.executableCapabilities.length,
      declared_capabilities: result.declaredOnly,
      executable_capability_ids: result.executableCapabilities.map((c) => c.capability_id),
      registered_at: result.registration.registered_at,
      expires_at: result.registration.expires_at,
    },
    { status: 201 },
  );
}