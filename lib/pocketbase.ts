import PocketBase from 'pocketbase';
import type { ChartCandle, Candle, Resolution, Trade } from './types';

const pb = new PocketBase(
  process.env.POCKETBASE_URL || 'http://localhost:8090'
);

// Export for use in other modules
export { pb };

// Helper: Floor timestamp to resolution
function floorToResolution(date: Date, resolution: Resolution): Date {
  const d = new Date(date);
  d.setSeconds(0, 0);

  const minutes = parseInt(resolution);
  if (resolution === 'D') {
    d.setHours(0, 0, 0);
  } else {
    d.setMinutes(Math.floor(d.getMinutes() / minutes) * minutes);
  }

  return d;
}

// Insert a single trade
export async function insertTrade(trade: Omit<Trade, 'id' | 'collectionId' | 'collectionName' | 'created' | 'updated'>): Promise<void> {
  await pb.collection('trades').create({
    market: trade.market,
    price: trade.price,
    size: trade.size,
    side: trade.side,
    timestamp: trade.timestamp,
    tx_hash: trade.tx_hash || null,
    log_index: trade.log_index || null,
  });
}

// Insert multiple trades (batch)
export async function insertTrades(trades: Omit<Trade, 'id' | 'collectionId' | 'collectionName' | 'created' | 'updated'>[]): Promise<void> {
  for (const trade of trades) {
    await insertTrade(trade);
  }
}

// Get 1-minute candles for a market and time range
export async function getCandles1m(
  market: string,
  from: Date,
  to: Date
): Promise<Candle[]> {
  const result = await pb.collection('candles_1m').getList(1, 10000, {
    filter: `market = "${market}" && time >= "${from.toISOString()}" && time <= "${to.toISOString()}"`,
    sort: '+time',
  });

  return result.items as Candle[];
}

// Aggregate candles from 1m to higher timeframe
export async function getCandles(
  market: string,
  from: Date,
  to: Date,
  resolution: Resolution = '1'
): Promise<ChartCandle[]> {
  // Expand time range for aggregation
  const expandedFrom = new Date(from);
  if (resolution !== '1') {
    // Add buffer for aggregation
    expandedFrom.setHours(expandedFrom.getHours() - 24);
  }

  // Get 1m candles
  const candles1m = await getCandles1m(market, expandedFrom, to);

  // If 1m resolution, return directly
  if (resolution === '1') {
    return candles1m.map(c => ({
      time: Math.floor(new Date(c.time).getTime() / 1000),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  }

  // Aggregate to higher timeframe
  const buckets = new Map<number, ChartCandle>();

  for (const candle of candles1m) {
    const candleTime = new Date(candle.time);
    const bucketTime = floorToResolution(candleTime, resolution);
    const bucketTimestamp = Math.floor(bucketTime.getTime() / 1000);

    if (!buckets.has(bucketTimestamp)) {
      buckets.set(bucketTimestamp, {
        time: bucketTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      });
    } else {
      const b = buckets.get(bucketTimestamp)!;
      b.high = Math.max(b.high, candle.high);
      b.low = Math.min(b.low, candle.low);
      b.close = candle.close;
      b.volume += candle.volume;
    }
  }

  // Filter to requested range and return sorted
  return Array.from(buckets.values())
    .filter(c => c.time >= Math.floor(from.getTime() / 1000))
    .sort((a, b) => a.time - b.time);
}

export async function testConnection(): Promise<boolean> {
  try {
    await pb.health.check();
    return true;
  } catch {
    return false;
  }
}
