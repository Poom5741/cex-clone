import { NextRequest, NextResponse } from 'next/server';
import { getCandles1m } from '@/lib/pocketbase';
import type { Resolution } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
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

    // Always fetch 1m candles (single source of truth)
    // Frontend will aggregate to requested timeframe
    console.log(`[DEBUG] Query: market=${market}, from=${fromDate.toISOString()}, to=${toDate.toISOString()}, resolution=${resolution}, direction=${direction}, limit=${limit}`);

    const candles = await getCandles1m(market, fromDate, toDate, direction, limit);

    console.log(`[DEBUG] Result: ${candles.length} 1m candles`);

    // Return 1m candles with metadata about requested resolution for frontend aggregation
    // Add caching headers - cache for 60s, serve stale for 5min while revalidating
    return NextResponse.json(
      {
        resolution,
        candles: candles.map(c => ({
          time: c.time,
          market: c.market,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        })),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    console.error('History API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch candle data' },
      { status: 500 }
    );
  }
}
