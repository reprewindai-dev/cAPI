import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const protocolPath = path.join(process.cwd(), 'public', 'protocol.json');
    const protocol = JSON.parse(fs.readFileSync(protocolPath, 'utf8'));
    return NextResponse.json(protocol);
  } catch (error) {
    return NextResponse.json({ error: 'Catalog not found' }, { status: 404 });
  }
}
