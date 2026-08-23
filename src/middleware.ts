import { NextRequest, NextResponse } from "next/server";

type Lane = "admin" | "authenticated" | "internal";

const PUBLIC_GET_PATHS = new Set([
  "/api/well-known/ai-catalog.json",
  "/api/x402",
]);

const AUTHENTICATED_EXACT_PATHS = new Set([
  "/api/audit",
  "/api/compose",
  "/api/mount",
  "/api/mount/discover",
  "/api/state",
  "/api/capi/v1/capabilities",
  "/api/v1/registry/services",
]);

const ADMIN_EXACT_PATHS = new Set([
  "/api/budget",
  "/api/mcp/servers",
]);

const ADMIN_DYNAMIC_PATHS = [
  /^\/api\/agent\/[^/]+$/,
  /^\/api\/capability\/[^/]+$/,
  /^\/api\/policy\/[^/]+$/,
  /^\/api\/quarantine\/[^/]+$/,
  /^\/api\/mount\/register$/,
];

const INTERNAL_EXACT_PATHS = new Set([
  "/api/adapters/qwen",
  "/api/capi/v1/execute",
  "/api/mcp/sse",
  "/api/mount/authorize",
  "/api/mount/execute",
  "/api/ops/validate",
  "/api/llm/ollama",
  "/api/outly/intercept",
  "/api/outly/outcome",
  "/api/request",
  "/api/v1/registry/heartbeat",
  "/api/v1/registry/register",
]);

const INTERNAL_DYNAMIC_PATHS = [
  /^\/api\/capi\/v1\/evidence\/[^/]+$/,
  /^\/api\/discover\/[^/]+$/,
  /^\/api\/pgl\/[^/]+$/,
  /^\/api\/proxy\/[^/]+\/.+$/,
  /^\/api\/replay\/[^/]+$/,
];

function matchesPath(pathname: string, exact: Set<string>, patterns: RegExp[]): boolean {
  if (exact.has(pathname)) return true;
  return patterns.some((pattern) => pattern.test(pathname));
}

function laneFor(pathname: string, method: string): Lane | null {
  if (/^\/api\/v1\/registry\/services\/[^/]+\/heartbeat$/.test(pathname)) {
    return "internal";
  }

  if (
    matchesPath(pathname, ADMIN_EXACT_PATHS, ADMIN_DYNAMIC_PATHS)
  ) {
    return "admin";
  }

  if (/^\/api\/v1\/registry\/services\/[^/]+$/.test(pathname)) {
    return method === "DELETE" ? "admin" : "authenticated";
  }

  if (matchesPath(pathname, AUTHENTICATED_EXACT_PATHS, [])) {
    return "authenticated";
  }

  if (
    matchesPath(pathname, INTERNAL_EXACT_PATHS, INTERNAL_DYNAMIC_PATHS)
  ) {
    return "internal";
  }

  return null;
}

function bearerToken(request: NextRequest): string {
  const value = request.headers.get("authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

async function credentialMatches(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return constantTimeEqual(new Uint8Array(providedDigest), new Uint8Array(expectedDigest));
}

async function authorizeLane(request: NextRequest, lane: Lane): Promise<NextResponse | null> {
  if (lane === "authenticated") {
    const expectedAdmin = process.env.COVENANT_ADMIN_TOKEN || "";
    const expectedInternal = process.env.BYOS_INTERNAL_API_KEY || "";
    if (!expectedAdmin && !expectedInternal) {
      return NextResponse.json(
        { error: "COVENANT_ADMIN_TOKEN or BYOS_INTERNAL_API_KEY is not configured; authenticated route is locked" },
        { status: 503 },
      );
    }

    const adminProvided = bearerToken(request) || request.headers.get("x-covenant-admin-token") || "";
    const internalProvided = request.headers.get("x-api-key") || "";
    const [adminMatches, internalMatches] = await Promise.all([
      expectedAdmin ? credentialMatches(adminProvided.trim(), expectedAdmin) : Promise.resolve(false),
      expectedInternal ? credentialMatches(internalProvided.trim(), expectedInternal) : Promise.resolve(false),
    ]);
    if (adminMatches || internalMatches) return null;

    return NextResponse.json(
      { error: "Invalid or missing authenticated credential" },
      { status: 401 },
    );
  }

  const environmentVariable = lane === "admin"
    ? "COVENANT_ADMIN_TOKEN"
    : "BYOS_INTERNAL_API_KEY";
  const expected = lane === "admin"
    ? process.env.COVENANT_ADMIN_TOKEN || ""
    : process.env.BYOS_INTERNAL_API_KEY || "";
  if (!expected) {
    return NextResponse.json(
      { error: `${environmentVariable} is not configured; ${lane} route is locked` },
      { status: 503 },
    );
  }

  const provided = lane === "admin"
    ? bearerToken(request) || request.headers.get("x-covenant-admin-token") || ""
    : request.headers.get("x-api-key") || "";

  if (!(await credentialMatches(provided.trim(), expected))) {
    return NextResponse.json(
      { error: lane === "admin" ? "Invalid or missing Covenant admin token" : "Invalid or missing internal API key" },
      { status: 401 },
    );
  }

  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_GET_PATHS.has(pathname)) {
    if (request.method === "GET" || request.method === "HEAD") return NextResponse.next();
    return NextResponse.json(
      { error: "Method not allowed on public API lane" },
      { status: 405 },
    );
  }

  const lane = laneFor(pathname, request.method);
  if (!lane) {
    return NextResponse.json(
      { error: "Route not found in API admission table", path: pathname },
      { status: 404 },
    );
  }

  const authError = await authorizeLane(request, lane);
  if (authError) return authError;
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
