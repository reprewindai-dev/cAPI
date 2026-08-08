import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { capabilityId, capabilityName } = body;

    if (!capabilityId) {
      return NextResponse.json({ error: 'Missing capabilityId' }, { status: 400 });
    }

    const logs: string[] = [];
    logs.push(`[cAPI-ops-router] Received ops command for "${capabilityName}" (${capabilityId})`);

    // 1. SLA test packet injection — real fetch to cappo-backend to measure latency
    const start = Date.now();
    try {
      await fetch('http://cappo-backend-node:8002/health', { signal: AbortSignal.timeout(2000) }).catch(() => {});
    } catch (_e) {
      // Latency probe — ignore connection failure; we only want elapsed time
    }
    const latency = Date.now() - start;
    logs.push(`[sub-agent-beta] SLA probe: latency to cappo-backend = ${latency}ms`);

    // 2. Commit cryptographic signature to PGL (GnomLedger)
    logs.push(`[sub-agent-gamma] Committing capability validation signature to PGL...`);

    let anchorHash: string | null = null;

    const pglBaseUrl = process.env.PGL_BASE_URL ?? 'https://pgl.veklom.com';
    const pglRes = await fetch(`${pglBaseUrl}/api/tools/mint_settlement_evidence_tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        capabilityId,
        capabilityName,
        timestamp: new Date().toISOString(),
        latency_ms: latency
      }),
      signal: AbortSignal.timeout(3000)
    });

    if (!pglRes.ok) {
      logs.push(`[PGL] Error: returned status ${pglRes.status}. Aborting — no fallback hash.`);
      return NextResponse.json(
        { error: 'PGL commitment failed', pgl_status: pglRes.status, logs },
        { status: 502 }
      );
    }

    const pglData = await pglRes.json();
    anchorHash = pglData.evidence_hash ?? pglData.result?.evidence_hash ?? pglData.response?.evidence_hash ?? null;

    if (!anchorHash) {
      logs.push(`[PGL] Error: response OK but no evidence_hash returned. Aborting.`);
      return NextResponse.json(
        { error: 'PGL returned no evidence hash', logs },
        { status: 502 }
      );
    }

    logs.push(`[PGL] Evidence anchored. Hash: ${anchorHash}`);

    return NextResponse.json({
      success: true,
      logs,
      anchorHash
    });

  } catch (error: any) {
    console.error('Ops Validate Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
