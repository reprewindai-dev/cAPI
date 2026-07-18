import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    service: "cAPI",
    role: "connection-layer",
    version: "2026.07",
    base_url: "https://interlink.veklom.com",
    repo: "reprewindai-dev/interlink-cAPI",
    auth_mode: "mixed",
    status: "ok",
    health: "/health",
    dependencies: "/health/dependencies",
    capabilities: ["interlink-routing", "governance-enforcement"],
    links: {
      cappo: "https://capi.veklom.com/protocol.json",
      ledger: "https://ledger.veklom.com/protocol.json",
      interlink: "https://interlink.veklom.com/protocol.json",
      core: "https://api.veklom.com/protocol.json"
    }
  });
}
