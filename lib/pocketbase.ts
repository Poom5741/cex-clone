import PocketBase from 'pocketbase';
import type { ChartCandle, Candle, Resolution, Trade } from './types';

const pb = new PocketBase(
  process.env.POCKETBASE_URL || 'http://localhost:8090'
);

// Authenticate as admin for server-side operations (seed script, API routes)
export async function authenticateAsAdmin(): Promise<boolean> {
  const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
  const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.warn('POCKETBASE_ADMIN_EMAIL or POCKETBASE_ADMIN_PASSWORD not set');
    return false;
  }

  try {
    await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);
    console.log('✅ Authenticated as PocketBase admin');
    return true;
  } catch (error) {
    console.error('❌ Failed to authenticate as PocketBase admin:', error);
    return false;
  }
}

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
  to: Date,
  direction: 'forward' | 'backward' = 'forward',
  limit?: number
): Promise<Candle[]> {
  const filter = `market = "${market}" && time >= "${from.toISOString()}" && time <= "${to.toISOString()}"`;
  console.log(`[DEBUG getCandles1m] filter: ${filter}, direction: ${direction}, limit: ${limit}`);

  // Determine sort order based on direction
  const sortOrder = direction === 'backward' ? '-time' : '+time';
  const perPage = limit || 10000;

  const result = await pb.collection('candles_1m').getList(1, perPage, {
    filter: filter,
    sort: sortOrder,
  });

  console.log(`[DEBUG getCandles1m] returned: ${result.items.length} (filtered), total: ${result.totalItems}`);
  return result.items as Candle[];
}

// Aggregate candles from 1m to higher timeframe
export async function getCandles(
  market: string,
  from: Date,
  to: Date,
  resolution: Resolution = '1',
  direction: 'forward' | 'backward' = 'forward',
  limit?: number
): Promise<ChartCandle[]> {
  // Expand time range for aggregation
  const expandedFrom = new Date(from);
  const expandedTo = new Date(to);

  if (resolution !== '1') {
    // Add buffer for aggregation (1 resolution before and after)
    let resolutionMs: number;
    if (resolution === 'D') {
      resolutionMs = 24 * 60 * 60 * 1000; // 1 day in ms
    } else {
      resolutionMs = parseInt(resolution) * 60 * 1000;
    }
    expandedFrom.setTime(expandedFrom.getTime() - resolutionMs);
    expandedTo.setTime(expandedTo.getTime() + resolutionMs);
  }

  // Get 1m candles
  const candles1m = await getCandles1m(market, expandedFrom, expandedTo, direction, limit);

  // If 1m resolution, aggregate duplicates first (handle hook not working properly)
  if (resolution === '1') {
    const aggregated = new Map<number, ChartCandle>();

    for (const c of candles1m) {
      const timestamp = Math.floor(new Date(c.time).getTime() / 1000);

      if (!aggregated.has(timestamp)) {
        aggregated.set(timestamp, {
          time: timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        });
      } else {
        const existing = aggregated.get(timestamp)!;
        existing.high = Math.max(existing.high, c.high);
        existing.low = Math.min(existing.low, c.low);
        existing.close = c.close;
        existing.volume += c.volume;
      }
    }

    // Filter to requested range and return sorted
    const fromTimestamp = Math.floor(from.getTime() / 1000);
    const toTimestamp = Math.floor(to.getTime() / 1000);

    return Array.from(aggregated.values())
      .filter(c => c.time >= fromTimestamp && c.time < toTimestamp)
      .sort((a, b) => a.time - b.time);
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
  // Include candles that overlap with the requested time range [from, to]
  // For a candle at time T with resolution R, it covers [T, T+R)
  // We include it if it overlaps: T < to AND T+R > from
  const fromTimestamp = Math.floor(from.getTime() / 1000);
  const toTimestamp = Math.floor(to.getTime() / 1000);

  // Calculate resolution in seconds
  let resolutionSeconds: number;
  if (resolution === 'D') {
    resolutionSeconds = 24 * 60 * 60;
  } else {
    resolutionSeconds = parseInt(resolution) * 60;
  }

  return Array.from(buckets.values())
    .filter(c => c.time < toTimestamp && c.time + resolutionSeconds > fromTimestamp)
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
