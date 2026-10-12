import { NextResponse } from 'next/server';
import { overallState, probeDependencies } from '@/lib/network/probe';

export const dynamic = 'force-dynamic';

export async function GET() {
  const dependencies = await probeDependencies();

  return NextResponse.json({
    status: overallState(Object.values(dependencies)),
    dependencies,
  });
}
