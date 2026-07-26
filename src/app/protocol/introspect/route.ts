import { NextRequest, NextResponse } from 'next/server';

const CAPABILITIES = ['interlink-routing', 'governance-enforcement', 'agent-relay'];
const BASE_URL = 'https://capi.veklom.com';
const HEALTH = '/health';
const DEPENDENCIES = '/health/dependencies';
const LINKS = {
  core: 'https://api.veklom.com/protocol.json',
  byos: 'https://api.veklom.com/protocol.json',
  cappo: 'https://cappo.veklom.com/protocol.json',
  pgl: 'https://pgl.veklom.com/protocol.json',
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({ query: '' }));
  const q = (body.query || '').toLowerCase();
  const matches = CAPABILITIES.filter((c) => q === '*' || c.includes(q));
  return NextResponse.json({
    query: body.query || '',
    matches,
    total: matches.length,
    base_url: BASE_URL,
    health: HEALTH,
    dependencies: DEPENDENCIES,
    auth_mode: 'bearer',
    links: LINKS,
  });
}
