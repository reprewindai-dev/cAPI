import { NextResponse } from "next/server";
import { requireIntegration } from "@/lib/covenant/integrations";

export async function GET(request: Request) {
  const agentId = new URL(request.url).searchParams.get("agent_id")?.trim();
  if (!agentId || agentId.length > 128) return NextResponse.json({ error: "agent_id is required and must be bounded" }, { status: 400 });
  try {
    const base = requireIntegration("capability registry", process.env.COVENANT_CAPABILITIES_URL);
    const response = await fetch(`${base}?agent_id=${encodeURIComponent(agentId)}`, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: "Capability registry unavailable" }, { status: 503 });
    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Capability registry unavailable" }, { status: 503 });
  }
}
