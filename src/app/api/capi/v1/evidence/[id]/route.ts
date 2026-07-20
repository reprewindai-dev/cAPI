import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;

  // Mock retrieving evidence from PGL
  const mockEvidence = {
    evidence_id: id,
    connection_id: 'conn-mock-1234',
    timestamp: new Date().toISOString(),
    who: {
      agent_id: 'ag-mock-999',
      owner_id: 'usr-mock-111'
    },
    what: {
      capability_id: 'cap-1',
      action: 'read'
    },
    result: {
      status: 'authorized',
      output_hash: 'mock-hash-base64',
      execution_time_ms: 120
    }
  };

  return NextResponse.json(mockEvidence);
}
