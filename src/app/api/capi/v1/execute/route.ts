import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { verifySnapshot } from '@/lib/mcp/snapshot';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Phase 1: RECEIVE (Schema validation would happen here)
    if (!body.connection_id || !body.agent_id || !body.capability_id) {
      return NextResponse.json({ error: 'Invalid schema' }, { status: 400 });
    }

    const snapshotHash = request.headers.get('X-Capability-Hash') || body.snapshot_hash;
    const snapshotSignature = request.headers.get('X-Capability-Signature') || body.snapshot_signature;

    if (!snapshotHash || !snapshotSignature || !verifySnapshot(snapshotHash, snapshotSignature)) {
      return NextResponse.json({ 
        error: 'Forbidden: Missing or invalid capability snapshot signature. Fail-closed enforced.' 
      }, { status: 403 });
    }

    // Task 5: Consequential Reauthorization Routing
    // Check if the runtime graph has mutated (e.g., version pin mismatch)
    // or if the capability enforces requires_reauthorization flag.
    if (body.reauthorize_required === true || body.capability_version_mismatch === true) {
      return NextResponse.json({
        connection_id: body.connection_id,
        status: 'quarantined',
        error: {
          code: 'CONSEQUENTIAL_REAUTHORIZATION_REQUIRED',
          message: 'Capability graph mutated or reauthorization explicitly required. Route back to CAPPO.',
          remediation: {
            action: 're_route_to_cappo',
            endpoint: '/api/v1/exec',
            reason: 'tier_upgrade_or_version_mismatch'
          }
        },
        metadata: {
          trust_delta: 0,
          new_trust_score: 50,
          audit_logged: true
        },
        trace: []
      });
    }

    // Phase 2-6: Identify, Authorize, Trust, Route, Execute (Simulated execution)
    const executionTimeMs = Math.floor(Math.random() * 200) + 50;
    const mockOutput = { success: true, processed_items: 42, action: body.action };
    
    // Phase 7: CAPTURE
    const outputHash = crypto.createHash('sha256').update(JSON.stringify(mockOutput)).digest('base64');
    
    // Phase 8: EVIDENCE
    const evidenceHash = crypto.createHash('sha256')
      .update(`${body.connection_id}:${body.agent_id}:${outputHash}:${Date.now()}`)
      .digest('base64');

    // Phase 9: RESPOND
    return NextResponse.json({
      connection_id: body.connection_id,
      status: 'authorized',
      evidence_hash: evidenceHash,
      result: {
        output: mockOutput,
        output_hash: outputHash,
        execution_time_ms: executionTimeMs
      },
      metadata: {
        trust_delta: 2,
        new_trust_score: 87,
        audit_logged: true
      }
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
