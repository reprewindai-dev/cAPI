import { NextResponse } from 'next/server';

const MOCK_CAPABILITIES = [
  { id: 'cap-1', name: 'read-database', description: 'Read records from the main db', trust_minimum: 10 },
  { id: 'cap-2', name: 'write-database', description: 'Write records to the main db', trust_minimum: 50 },
  { id: 'cap-3', name: 'process-payment', description: 'Execute a payment settlement', trust_minimum: 90 }
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get('agent_id');

  // If we had a real DB, we would filter by agent_id's allowed scopes here.
  return NextResponse.json({
    data: MOCK_CAPABILITIES,
    total: MOCK_CAPABILITIES.length
  });
}
