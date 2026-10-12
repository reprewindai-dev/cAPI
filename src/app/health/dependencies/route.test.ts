import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

describe('GET /health/dependencies', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.CAPPO_BACKEND_URL = 'http://cappo:8002';
    process.env.PGL_LEDGER_URL = 'http://gnomledger:8001';
    process.env.LOCKERPHYCER_URL = 'http://lockerphycer:8092';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('sets correct explicit Host overrides for each dependency and probes nothing else', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const calls = fetchMock.mock.calls.map(([url, init]) => ({
      url: String(url),
      headers: new Headers(init?.headers),
    }));

    const cappo = calls.find((call) => call.url.startsWith('http://cappo:8002'));
    const pgl = calls.find((call) => call.url.startsWith('http://gnomledger:8001'));
    const lockerphycer = calls.find((call) => call.url.startsWith('http://lockerphycer:8092'));

    expect(cappo?.headers.get('host')).toBe('cappo.veklom.com');
    expect(pgl?.headers.get('host')).toBe('pgl.veklom.com');
    expect(lockerphycer?.headers.get('host')).toBeNull();

    const body = (await response.json()) as { dependencies: Record<string, unknown> };
    expect(Object.keys(body.dependencies).sort()).toEqual(['cappo', 'lockerphycer', 'pgl']);
  });
});
