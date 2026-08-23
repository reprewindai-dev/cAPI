import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

function request() {
  return new Request('http://localhost/api/ops/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-internal-key' },
    body: JSON.stringify({ capabilityId: 'cap-test', capabilityName: 'Test capability' }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/ops/validate', () => {
  beforeEach(() => {
    process.env.BYOS_INTERNAL_API_KEY = 'test-internal-key';
  });

  it('fails closed without inventing CAPPO latency when the probe cannot connect', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('connection refused'));
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe('CAPPO health probe failed');
    expect(body.logs).toContain('[CAPPO] Health probe failed. No latency measurement recorded.');
    expect(body.logs.join('\n')).not.toMatch(/latency to cappo-backend/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not anchor evidence when CAPPO returns an unhealthy response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe('CAPPO health probe unhealthy');
    expect(body.cappo_status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('anchors only after a successful CAPPO health response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ evidence_hash: 'evidence-test-hash' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.anchorHash).toBe('evidence-test-hash');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const pglRequest = fetchMock.mock.calls[1];
    const pglBody = JSON.parse(String(pglRequest[1]?.body));
    expect(pglBody.latency_ms).toEqual(expect.any(Number));
  });
});
