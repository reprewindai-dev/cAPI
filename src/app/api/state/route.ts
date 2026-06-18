import { NextResponse } from "next/server";
import { buildSnapshot } from "@/lib/covenant/api";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(buildSnapshot());
}
