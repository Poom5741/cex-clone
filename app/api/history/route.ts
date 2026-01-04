import { NextRequest, NextResponse } from 'next/server';
import { authenticateAsAdmin, getCandles } from '@/lib/pocketbase';
import type { HistoryQuery, Resolution } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    // Authenticate as admin for API access
    const authenticated = await authenticateAsAdmin();
    if (!authenticated) {
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;

    const symbol = searchParams.get('symbol') || 'ETH/USDC';
    const resolution = (searchParams.get('resolution') || '1') as Resolution;
    const from = parseInt(searchParams.get('from') || '0');
    const to = parseInt(searchParams.get('to') || '0');
    const direction = (searchParams.get('direction') || 'forward') as 'forward' | 'backward';
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;

    if (!from || !to) {
      return NextResponse.json(
        { error: 'Invalid timestamp parameters' },
        { status: 400 }
      );
    }

    const fromDate = new Date(from * 1000);
    const toDate = new Date(to * 1000);

    // Normalize symbol format (ETH/USDC -> ETHUSDC for DB)
    const market = symbol.replace('/', '');

    console.log(`[DEBUG] Query: market=${market}, from=${fromDate.toISOString()}, to=${toDate.toISOString()}, resolution=${resolution}, direction=${direction}, limit=${limit}`);
    console.log(`[DEBUG] Raw params - symbol=${symbol}, from=${from}, to=${to}`);

    const candles = await getCandles(market, fromDate, toDate, resolution, direction, limit);

    console.log(`[DEBUG] Result: ${candles.length} candles`);

    return NextResponse.json(candles);
  } catch (error) {
    console.error('History API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch candle data' },
      { status: 500 }
    );
  }
}
