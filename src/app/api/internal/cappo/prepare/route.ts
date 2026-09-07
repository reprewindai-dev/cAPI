import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { prepareCappoExecution } from "@/lib/covenant/cappo-preparer";

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function internalKey(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return request.headers.get("x-cappo-internal-key")?.trim() ?? "";
}

export async function POST(request: NextRequest) {
  const expected = process.env.CAPPO_INTERNAL_EXEC_KEY?.trim() ?? "";
  if (!expected) {
    return NextResponse.json(
      { error: "CAPPO_PREPARER_LOCKED", detail: "Internal preparation key is not configured." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  const provided = internalKey(request);
  if (!provided || !safeEqual(provided, expected)) {
    return NextResponse.json(
      { error: "CAPPO_PREPARER_UNAUTHORIZED" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("Preparation request must be a JSON object");
    }
    const record = input as Record<string, unknown>;
    const body = record.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("body must be an object");
    }
    const prepared = prepareCappoExecution({
      body: body as Record<string, unknown>,
      executionId: typeof record.executionId === "string" ? record.executionId : "",
      workspaceId: typeof record.workspaceId === "string" ? record.workspaceId : "",
      actorId: typeof record.actorId === "string" ? record.actorId : "",
    });
    return NextResponse.json(prepared, {
      status: 200,
      headers: { "cache-control": "no-store, private" },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid preparation request";
    return NextResponse.json(
      { error: "CAPPO_PREPARATION_REJECTED", detail },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
}
