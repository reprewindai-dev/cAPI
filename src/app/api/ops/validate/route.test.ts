import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const ADMIN_TOKEN = 'ops-admin-token';
const ORIGINAL_TOKEN = process.env.COVENANT_ADMIN_TOKEN;

function request(headers: Record<string, string> = { 'x-covenant-admin-token': ADMIN_TOKEN }) {
  return new Request('http://localhost/api/ops/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ capabilityId: 'cap-test', capabilityName: 'Test capability' }),
  });
}

beforeEach(() => {
  process.env.COVENANT_ADMIN_TOKEN = ADMIN_TOKEN;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_TOKEN === undefined) delete process.env.COVENANT_ADMIN_TOKEN;
  else process.env.COVENANT_ADMIN_TOKEN = ORIGINAL_TOKEN;
});

describe('POST /api/ops/validate', () => {
  it('requires the admin token before probing CAPPO or anchoring in PGL', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const missing = await POST(request({}));
    const wrong = await POST(request({ 'x-covenant-admin-token': 'wrong' }));

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('locks the probe when no admin token is configured', async () => {
    delete process.env.COVENANT_ADMIN_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
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
