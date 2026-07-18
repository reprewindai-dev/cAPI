import { NextResponse } from 'next/server';

const MANIFEST = {
  service: 'cAPI-interlink-console',
  repo: 'reprewindai-dev/cAPI',
  role: 'connection-layer',
  version: '2026.07',
  base_url: 'https://interlink.veklom.com',
  health: '/api/health',
  dependencies: '/api/health/dependencies',
  auth_mode: 'bearer',
  status: 'ok',
  capabilities: ['interlink-routing', 'governance-enforcement', 'agent-relay'],
  links: {
    core: 'https://api.veklom.com/protocol.json',
    cappo: 'https://capi.veklom.com/protocol.json',
    pgl: 'https://pgl.veklom.com/protocol.json',
  },
};

export async function GET() {
  return NextResponse.json(MANIFEST);
}
