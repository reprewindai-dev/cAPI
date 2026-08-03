import { NextRequest, NextResponse } from "next/server";
import { requireAdminToken } from "@/lib/covenant/admin-auth";
import {
  getMountRegistry,
  type RegisterMountInput,
} from "@/lib/covenant/capability-mount";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = requireAdminToken(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = (await req.json()) as RegisterMountInput;
    const mount = getMountRegistry().register(body);
    return NextResponse.json({ ok: true, mount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
