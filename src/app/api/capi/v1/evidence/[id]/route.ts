import { NextResponse } from "next/server";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const base = process.env.PGL_LEDGER_URL?.trim();
  if (!base) return NextResponse.json({ error: "PGL evidence integration unavailable" }, { status: 503 });
  if (!params.id || params.id.length > 256) return NextResponse.json({ error: "Invalid evidence id" }, { status: 400 });

  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/ledger/events/${encodeURIComponent(params.id)}`, {
      headers: { accept: "application/json", "x-api-key": process.env.PGL_LEDGER_API_KEY ?? "" },
      cache: "no-store",
    });
    if (response.status === 404) return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
    if (!response.ok) return NextResponse.json({ error: "PGL evidence lookup failed" }, { status: 503 });
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ error: "PGL evidence lookup failed" }, { status: 503 });
  }
}
