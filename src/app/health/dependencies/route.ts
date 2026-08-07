import { NextResponse } from 'next/server';

type DependencyState = 'healthy' | 'degraded' | 'unavailable' | 'unconfigured';

interface DependencyResult {
  state: DependencyState;
  host: string | null;
  latency_ms: number | null;
}

const TIMEOUT_MS = 2_000;

export const dynamic = 'force-dynamic';

function dependencyHost(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).host;
  } catch {
    return null;
  }
}

function endpoint(rawUrl: string, path: string): string {
  return `${rawUrl.replace(/\/+$/, '')}${path}`;
}

async function probe(rawUrl: string | undefined): Promise<DependencyResult> {
  const configured = rawUrl?.trim();
  if (!configured) {
    return { state: 'unconfigured', host: null, latency_ms: null };
  }

  const host = dependencyHost(configured);
  if (!host) return { state: 'unavailable', host: null, latency_ms: null };

  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let response = await fetch(endpoint(configured, '/health'), {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      let fallbackPath = '/protocol.json';
      let host = configured;
      if (configured.includes('/api/v1/mcp/gateway')) {
          fallbackPath = '/api/v1/health';
          host = configured.replace('/api/v1/mcp/gateway', '');
      }
      let headers: HeadersInit = {
        'cache': 'no-store'
      };
      if (fallbackPath === '/api/v1/health') {
          headers['Host'] = 'api.veklom.com';
      }
      
      response = await fetch(endpoint(host, fallbackPath), {
        method: 'GET',
        signal: controller.signal,
        headers,
      });
    }
    const latency_ms = Math.round(performance.now() - started);
    if (response.ok) return { state: 'healthy', host, latency_ms };
    if (response.status >= 500) return { state: 'unavailable', host, latency_ms };
    return { state: 'degraded', host, latency_ms };
  } catch {
    return {
      state: 'unavailable',
      host,
      latency_ms: Math.round(performance.now() - started),
    };
  } finally {
    clearTimeout(timer);
  }
}

function overallState(results: DependencyResult[]): DependencyState {
  if (results.some((result) => result.state === 'unavailable')) return 'unavailable';
  if (results.some((result) => result.state === 'degraded')) return 'degraded';
  if (results.some((result) => result.state === 'healthy')) return 'healthy';
  return 'unconfigured';
}

export async function GET() {
  const [cappo, pgl, byos, lockerphycer] = await Promise.all([
    probe(process.env.CAPPO_BACKEND_URL),
    probe(process.env.PGL_LEDGER_URL),
    probe(process.env.BYOS_MCP_GATEWAY_URL),
    probe(process.env.LOCKERPHYCER_URL ?? process.env.LOCKERPHYCER_BACKEND_URL),
  ]);
  const dependencies = { cappo, pgl, byos, lockerphycer };

  return NextResponse.json({
    status: overallState(Object.values(dependencies)),
    dependencies,
  });
}
