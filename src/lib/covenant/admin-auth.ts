import type { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function requireAdminToken(req: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.COVENANT_ADMIN_TOKEN || "";
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: "COVENANT_ADMIN_TOKEN is not configured; mutation route is locked",
    };
  }
  const provided = req.headers.get("x-covenant-admin-token") || req.headers.get("x-api-key") || "";
  if (!safeEqual(provided, expected)) {
    return { ok: false, status: 401, error: "Invalid or missing Covenant admin token" };
  }
  return { ok: true };
}
