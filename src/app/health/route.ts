import { NextResponse } from 'next/server';
import packageJson from '../../../package.json';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    service: 'cAPI',
    version: packageJson.version,
    timestamp: new Date().toISOString(),
    status: 'ok',
  });
}
