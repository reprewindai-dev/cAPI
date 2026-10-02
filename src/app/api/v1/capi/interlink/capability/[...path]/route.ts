import { NextResponse } from "next/server";
import {
  IntegrationUnavailable,
  requireIntegration,
} from "@/lib/covenant/integrations";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function errorResponse(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

function upstreamPath(path: string[], isHolder: boolean): string | null {
  if (path.length === 1 && path[0] === "packages") {
    return "/v1/capability/packages";
  }
  if (path.length === 1 && path[0] === "mounts") {
    return "/v1/capability/mounts";
  }
  if (path.length === 2 && path[0] === "mounts" && path[1]) {
    return `/v1/capability/mounts/${encodeURIComponent(path[1])}`;
  }
  if (
    path.length === 3 &&
    path[0] === "mounts" &&
    path[1] &&
    path[2] === "actions"
  ) {
    return `/v1/capability/mounts/${encodeURIComponent(path[1])}/actions`;
  }
  if (
    isHolder &&
    path.length === 3 &&
    path[0] === "mounts" &&
    path[1] &&
    (path[2] === "execute" || path[2] === "terminate")
  ) {
    return `/v1/capability/mounts/${encodeURIComponent(path[1])}/${path[2]}`;
  }
  if (
    isHolder &&
    path.length === 3 &&
    path[0] === "targets" &&
    path[1] &&
    path[2] === "state"
  ) {
    return `/v1/capability/targets/${encodeURIComponent(path[1])}/state`;
  }
  return null;
}

async function forward(
  request: Request,
  context: RouteContext,
  method: "GET" | "POST",
): Promise<Response> {
  const path = (await context.params).path;
  const isHolder = /^Bearer\s+vlm_/i.test(request.headers.get("authorization") ?? "");
  const targetPath = upstreamPath(path, isHolder);
  if (
    targetPath === null ||
    (method === "GET" &&
      !(path.length === 1 && path[0] === "packages") &&
      !(path.length === 2 && path[0] === "mounts" && path[1]) &&
      !(isHolder &&
        path.length === 3 &&
        path[0] === "targets" &&
        path[1] &&
        path[2] === "state")) ||
    (method === "POST" &&
      !(
        (path.length === 1 && path[0] === "mounts") ||
        (path.length === 3 && path[0] === "mounts" && path[1] && path[2] === "actions") ||
        (isHolder &&
          path.length === 3 &&
          path[0] === "mounts" &&
          path[1] &&
          (path[2] === "execute" || path[2] === "terminate"))
      ))
  ) {
    return errorResponse("INTERLINK_PATH_NOT_BRIDGED", 404);
  }

  let base: string;
  try {
    base = requireIntegration("CAPPO", process.env.CAPPO_BACKEND_URL);
  } catch (error) {
    if (error instanceof IntegrationUnavailable) {
      return errorResponse("CAPPO_UNAVAILABLE", 503);
    }
    throw error;
  }

  const headers = new Headers();
  const authorization = request.headers.get("authorization");
  const contentType = request.headers.get("content-type");
  if (authorization !== null) headers.set("authorization", authorization);
  if (contentType !== null) headers.set("content-type", contentType);

  const controller = new AbortController();
  // Mount creation, execute and terminate each anchor synchronously to PGL
  // (CAPPO waits up to PGL_LEDGER_TIMEOUT_MS, 8 s by default). A shorter bridge
  // timeout returned 504 while CAPPO had already created the mount, leaving an
  // orphan with a live token. Reads keep the short timeout.
  const anchorsSynchronously =
    path[0] === "mounts" &&
    request.method === "POST" &&
    (path.length === 1 ||
      (path.length === 3 && (path[2] === "execute" || path[2] === "terminate")));
  const timeoutMs = anchorsSynchronously ? 10000 : 3000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const upstream = await fetch(
      `${base}${targetPath}${method === "GET" ? new URL(request.url).search : ""}`,
      {
        method,
        headers,
        body: method === "POST" ? await request.arrayBuffer() : undefined,
        signal: controller.signal,
      },
    );
    const responseHeaders = new Headers({
      "x-veklom-interlink": "capi",
      "cache-control": "no-store",
    });
    if (isHolder) {
      responseHeaders.set("x-veklom-interlink-principal", "mount-holder");
    }
    const upstreamContentType = upstream.headers.get("content-type");
    if (upstreamContentType !== null) {
      responseHeaders.set("content-type", upstreamContentType);
    }
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return errorResponse("CAPPO_UNREACHABLE", 504);
    }
    return errorResponse("CAPPO_UNAVAILABLE", 503);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return forward(request, context, "GET");
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return forward(request, context, "POST");
}
