import { NextResponse } from 'next/server';

const MANIFEST = {
  service: 'cAPI-interlink-console',
  repo: 'reprewindai-dev/cAPI',
  role: 'connection-layer',
  version: '2026.07',
  base_url: 'https://capi.veklom.com',
  health: '/health',
  dependencies: '/health/dependencies',
  auth_mode: 'bearer',
  status: 'ok',
  capabilities: ['interlink-routing', 'governance-enforcement', 'agent-relay'],
  links: {
    core: 'https://api.veklom.com/protocol.json',
    byos: 'https://api.veklom.com/protocol.json',
    cappo: 'https://cappo.veklom.com/protocol.json',
    pgl: 'https://pgl.veklom.com/protocol.json',
  },
};

export async function GET() {
  return NextResponse.json(MANIFEST);
}
