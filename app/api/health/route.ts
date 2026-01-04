import { NextResponse } from 'next/server';
import { testConnection } from '@/lib/pocketbase';

export async function GET() {
  try {
    const connected = await testConnection();
    return NextResponse.json({ connected });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
