import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

describe('GET /health/dependencies', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.CAPPO_BACKEND_URL = 'http://cappo:8002';
    process.env.PGL_LEDGER_URL = 'http://gnomledger:8001';
    process.env.BYOS_MCP_GATEWAY_URL = 'http://byos:8088/api/v1/mcp/gateway';
    process.env.LOCKERPHYCER_URL = 'http://lockerphycer:8092';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('scopes the api.veklom.com Host override to BYOS only', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const calls = fetchMock.mock.calls.map(([url, init]) => ({
      url: String(url),
      headers: new Headers(init?.headers),
    }));

    const cappo = calls.find((call) => call.url.startsWith('http://cappo:8002'));
    const pgl = calls.find((call) => call.url.startsWith('http://gnomledger:8001'));
    const byos = calls.find((call) => call.url.startsWith('http://byos:8088'));
    const lockerphycer = calls.find((call) => call.url.startsWith('http://lockerphycer:8092'));

    expect(cappo?.headers.get('host')).toBeNull();
    expect(pgl?.headers.get('host')).toBeNull();
    expect(lockerphycer?.headers.get('host')).toBeNull();
    expect(byos?.headers.get('host')).toBe('api.veklom.com');
  });

  it('keeps the BYOS Host override on the fallback health request', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string) => {
        if (String(url).includes('byos:8088/api/v1/mcp/gateway/health')) {
          return new Response(null, { status: 400 });
        }
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });
    vi.stubGlobal('fetch', fetchMock);

    await GET();

    const fallback = fetchMock.mock.calls.find(([url]) =>
      String(url) === 'http://byos:8088/api/v1/health',
    );
    expect(fallback).toBeDefined();
    expect(new Headers(fallback?.[1]?.headers).get('host')).toBe('api.veklom.com');
  });
});
