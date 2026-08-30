import { NextRequest, NextResponse } from "next/server";

import { requireAdminToken } from "@/lib/covenant/admin-auth";
import { prepareCappoExecution } from "@/lib/covenant/cappo-preparer";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = requireAdminToken(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!input || typeof input !== "object") {
    return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
  }

  const record = input as Record<string, unknown>;
  if (!record.body || typeof record.body !== "object") {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }
  if (typeof record.executionId !== "string" || typeof record.workspaceId !== "string" || typeof record.actorId !== "string") {
    return NextResponse.json(
      { error: "executionId, workspaceId and actorId are required" },
      { status: 400 },
    );
  }

  try {
    const prepared = prepareCappoExecution({
      body: record.body as Record<string, unknown>,
      executionId: record.executionId,
      workspaceId: record.workspaceId,
      actorId: record.actorId,
    });
    return NextResponse.json(prepared, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CAPPO request preparation failed";
    const configurationFailure = /required|must use HTTPS|must terminate/.test(message);
    return NextResponse.json(
      { error: "CAPPO_REQUEST_PREPARATION_FAILED", detail: message },
      { status: configurationFailure ? 503 : 400 },
    );
  }
}
