import { NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/covenant/internal-auth';

export async function POST(request: Request) {
  const auth = requireInternalApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { capabilityId, capabilityName } = body;

    if (!capabilityId) {
      return NextResponse.json({ error: 'Missing capabilityId' }, { status: 400 });
    }

    const logs: string[] = [];
    logs.push(`[cAPI-ops-router] Received ops command for "${capabilityName}" (${capabilityId})`);

    // 1. Probe CAPPO and only report latency when an HTTP response was actually observed.
    const start = Date.now();
    let cappoRes: Response;
    try {
      cappoRes = await fetch('http://cappo-backend-node:8002/health', {
        signal: AbortSignal.timeout(2000),
      });
    } catch (_error) {
      logs.push('[CAPPO] Health probe failed. No latency measurement recorded.');
      return NextResponse.json(
        { error: 'CAPPO health probe failed', logs },
        { status: 502 },
      );
    }

    const latency = Date.now() - start;
    if (!cappoRes.ok) {
      logs.push(`[CAPPO] Health probe returned status ${cappoRes.status} after ${latency}ms.`);
      return NextResponse.json(
        { error: 'CAPPO health probe unhealthy', cappo_status: cappoRes.status, logs },
        { status: 502 },
      );
    }
    logs.push(`[CAPPO] Health probe succeeded in ${latency}ms.`);

    // 2. Commit cryptographic signature to PGL (GnomLedger).
    logs.push('[PGL] Committing capability validation signature...');

    const pglBaseUrl = process.env.PGL_BASE_URL ?? 'https://pgl.veklom.com';
    const pglRes = await fetch(`${pglBaseUrl}/api/tools/mint_settlement_evidence_tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        capabilityId,
        capabilityName,
        timestamp: new Date().toISOString(),
        latency_ms: latency,
      }),
      signal: AbortSignal.timeout(3000),
    });

    if (!pglRes.ok) {
      logs.push(`[PGL] Error: returned status ${pglRes.status}. Aborting — no fallback hash.`);
      return NextResponse.json(
        { error: 'PGL commitment failed', pgl_status: pglRes.status, logs },
        { status: 502 },
      );
    }

    const pglData = await pglRes.json();
    const anchorHash = pglData.evidence_hash ?? pglData.result?.evidence_hash ?? pglData.response?.evidence_hash ?? null;

    if (!anchorHash) {
      logs.push('[PGL] Error: response OK but no evidence_hash returned. Aborting.');
      return NextResponse.json(
        { error: 'PGL returned no evidence hash', logs },
        { status: 502 },
      );
    }

    logs.push(`[PGL] Evidence anchored. Hash: ${anchorHash}`);

    return NextResponse.json({
      success: true,
      logs,
      anchorHash,
    });
  } catch (error) {
    console.error('Ops Validate Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
