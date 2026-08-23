import { timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function requireInternalApiKey(
  req: Request,
): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.BYOS_INTERNAL_API_KEY || "";
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: "BYOS_INTERNAL_API_KEY is not configured; internal route is locked",
    };
  }

  const provided = req.headers.get("x-api-key")?.trim() || "";
  if (!safeEqual(provided, expected)) {
    return { ok: false, status: 401, error: "Invalid or missing internal API key" };
  }

  return { ok: true };
}
