/**
 * Fast seed script - Direct SQLite insertion for testing
 *
 * Bypasses PocketBase API and inserts directly into SQLite.
 * ~1000x faster than API-based insertion.
 *
 * Usage: npx tsx scripts/seed-fast.ts [days]
 */

import Database from 'better-sqlite3';
import { resolve } from 'path';

interface MarketConfig {
  basePrice: number;
  volatility: number;
}

const MARKETS: Record<string, MarketConfig> = {
  'ETHUSDC': { basePrice: 3500, volatility: 0.002 },
  'BTCUSDC': { basePrice: 95000, volatility: 0.0015 },
  'SOLUSDC': { basePrice: 220, volatility: 0.003 },
};

interface CandleRow {
  time: string;
  market: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function generateCandlesForMarket(
  market: string,
  days: number,
  config: MarketConfig
): CandleRow[] {
  console.log(`Generating ${days} days of candles for ${market}...`);

  const candles: CandleRow[] = [];
  const now = Date.now();
  const startTime = now - days * 24 * 60 * 60 * 1000;

  let currentPrice = config.basePrice;
  const totalMinutes = days * 24 * 60;

  for (let t = startTime; t < now; t += 60000) {
    // Generate 5-20 trades per minute, aggregated into OHLCV
    const tradesPerMinute = Math.floor(Math.random() * 15) + 5;
    let open = currentPrice;
    let high = currentPrice;
    let low = currentPrice;
    let close = currentPrice;
    let volume = 0;

    for (let i = 0; i < tradesPerMinute; i++) {
      // Random walk price movement
      const change = (Math.random() - 0.5) * 2 * config.volatility * currentPrice;
      currentPrice += change;
      close = currentPrice;

      // Update OHLC
      high = Math.max(high, currentPrice);
      low = Math.min(low, currentPrice);

      // Add volume
      volume += parseFloat((Math.random() * 2 + 0.01).toFixed(4));
    }

    candles.push({
      time: new Date(t).toISOString(),
      market,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: parseFloat(volume.toFixed(4)),
    });

    // Progress logging every 10%
    const minuteIndex = Math.floor((t - startTime) / 60000);
    if (minuteIndex % Math.floor(totalMinutes / 10) === 0) {
      const progress = Math.round((minuteIndex / totalMinutes) * 100);
      console.log(`  Progress: ${progress}% (${minuteIndex}/${totalMinutes} minutes)`);
    }
  }

  return candles;
}

async function main() {
  const days = parseInt(process.argv[2]) || 15;
  const markets = process.argv.slice(3);

  // Use all markets if none specified
  const targetMarkets = markets.length > 0 ? markets : Object.keys(MARKETS);

  console.log('========================================');
  console.log('Fast Seed - Direct SQLite Insertion');
  console.log('========================================');
  console.log(`Days: ${days}`);
  console.log(`Markets: ${targetMarkets.join(', ')}`);
  console.log(`From: ${new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()}`);
  console.log(`To: ${new Date().toISOString()}`);
  console.log('========================================\n');

  // Open database directly
  const dbPath = resolve(process.cwd(), 'pocketbase/pb_data/data.db');
  console.log(`Opening database: ${dbPath}`);

  const db = new Database(dbPath, { readonly: false });

  try {
    // Prepare insert statement (candles_1m has no created/updated columns)
    const insertStmt = db.prepare(`
      INSERT INTO candles_1m (id, time, market, open, high, low, close, volume)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Use transaction for bulk insert
    const insertMany = db.transaction((candles: CandleRow[]) => {
      for (const candle of candles) {
        const id = crypto.randomUUID();
        insertStmt.run(
          id,
          candle.time,
          candle.market,
          candle.open,
          candle.high,
          candle.low,
          candle.close,
          candle.volume
        );
      }
    });

    const startTime = Date.now();

    // Generate and insert for each market
    for (const market of targetMarkets) {
      const config = MARKETS[market];
      if (!config) {
        console.error(`Unknown market: ${market}`);
        continue;
      }

      const candles = generateCandlesForMarket(market, days, config);
      console.log(`Inserting ${candles.length} candles for ${market}...`);
      insertMany(candles);
      console.log(`✓ ${market}: ${candles.length} candles inserted\n`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    // Print stats
    const stats = db.prepare(`
      SELECT market, COUNT(*) as count
      FROM candles_1m
      GROUP BY market
    `).all() as { market: string; count: number }[];

    console.log('========================================');
    console.log('Seed Complete!');
    console.log('========================================');
    console.log(`Total time: ${elapsed}s`);
    console.log('\nDatabase stats:');
    for (const stat of stats) {
      console.log(`  ${stat.market}: ${stat.count} candles`);
    }
    console.log('========================================');

  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main().catch(console.error);
