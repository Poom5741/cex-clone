import { NextRequest, NextResponse } from 'next/server';
import { getCandles } from '@/lib/db';
import type { HistoryQuery } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const symbol = searchParams.get('symbol') || 'ETH/USDC';
    const resolution = (searchParams.get('resolution') || '1') as HistoryQuery['resolution'];
    const from = parseInt(searchParams.get('from') || '0');
    const to = parseInt(searchParams.get('to') || '0');

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

    const candles = await getCandles(market, fromDate, toDate, resolution);

    return NextResponse.json(candles);
  } catch (error) {
    console.error('History API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch candle data' },
      { status: 500 }
    );
  }
}
