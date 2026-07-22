/**
 * GET /api/v1/registry/services
 *
 * Live catalog of self-registered services, each annotated with a `stale` flag
 * derived from its registration TTL so the connection state is always honest.
 */

import { NextResponse } from "next/server";
import { getEngine } from "@/lib/covenant/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const engine = getEngine();
  const services = await engine.services.list();
  const now = new Date();
  return NextResponse.json({
    count: services.length,
    services: services.map((service) => ({
      ...service,
      stale: engine.services.isStale(service, now),
    })),
  });
}
