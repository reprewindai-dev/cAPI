import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: "degraded",
    reason: "dependency health endpoint not fully wired yet"
  });
}
