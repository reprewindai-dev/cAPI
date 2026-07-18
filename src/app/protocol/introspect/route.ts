import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ status: "ok", introspect: true, capabilities: ["interlink-routing", "governance-enforcement"] });
}
