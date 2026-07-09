import { NextResponse } from "next/server";
import { buildSnapshot } from "@/lib/covenant/api";
import { getEngine } from "@/lib/covenant/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  await getEngine().syncRegistry();
  return NextResponse.json(buildSnapshot());
}
