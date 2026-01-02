import { insertTrade, insertTrades, refreshCandles } from './db';
import type { Trade } from './types';

interface MarketConfig {
  basePrice: number;
  volatility: number;
}

const MARKETS: Record<string, MarketConfig> = {
  'ETHUSDC': { basePrice: 3500, volatility: 0.002 },
  'BTCUSDC': { basePrice: 95000, volatility: 0.0015 },
  'SOLUSDC': { basePrice: 220, volatility: 0.003 },
};

let currentPrices: Record<string, number> = {};

function initializePrices(): void {
  Object.entries(MARKETS).forEach(([market, config]) => {
    currentPrices[market] = config.basePrice;
  });
}

function generateTrade(market: string): Omit<Trade, 'id'> {
  const config = MARKETS[market];
  if (!config) {
    throw new Error(`Unknown market: ${market}`);
  }

  // Get current price or initialize
  if (!currentPrices[market]) {
    initializePrices();
  }

  const currentPrice = currentPrices[market];

  // Random walk for price movement
  const change = (Math.random() - 0.5) * 2 * config.volatility * currentPrice;
  const newPrice = currentPrice + change;
  currentPrices[market] = newPrice;

  // Random trade size
  const size = (Math.random() * 2 + 0.01).toFixed(4);

  // Random side
  const side: 'buy' | 'sell' = Math.random() > 0.5 ? 'buy' : 'sell';

  return {
    market,
    price: newPrice.toFixed(2),
    size,
    side,
    timestamp: new Date(),
  };
}

let isGenerating = false;
let intervalId: NodeJS.Timeout | null = null;

export async function startMockTrades(
  market: string = 'ETHUSDC',
  intervalMs: number = 2000
): Promise<void> {
  if (isGenerating) {
    console.log('Mock trades already running');
    return;
  }

  isGenerating = true;
  initializePrices();

  console.log(`Starting mock trades for ${market} every ${intervalMs}ms`);

  intervalId = setInterval(async () => {
    try {
      const trade = generateTrade(market);
      await insertTrade(trade);
      await refreshCandles();
      console.log(`[${trade.timestamp.toISOString()}] ${market}: ${trade.side} ${trade.size} @ ${trade.price}`);
    } catch (error) {
      console.error('Error inserting mock trade:', error);
    }
  }, intervalMs);
}

export function stopMockTrades(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    isGenerating = false;
    console.log('Stopped mock trades');
  }
}

export async function generateInitialCandles(
  market: string = 'ETHUSDC',
  days: number = 1
): Promise<void> {
  console.log(`Generating ${days} day(s) of initial candles for ${market}...`);

  initializePrices();
  const config = MARKETS[market];
  if (!config) {
    throw new Error(`Unknown market: ${market}`);
  }

  // Generate trades for each minute
  const now = Date.now();
  const startTime = now - days * 24 * 60 * 60 * 1000;

  const BATCH_SIZE = 1000;
  const batch: Omit<Trade, 'id'>[] = [];
  let totalTrades = 0;

  for (let t = startTime; t < now; t += 60000) {
    // Generate 2-5 trades per minute (reduced from 5-20 for speed)
    const tradesPerMinute = Math.floor(Math.random() * 3) + 2;

    for (let i = 0; i < tradesPerMinute; i++) {
      const change = (Math.random() - 0.5) * 2 * config.volatility * currentPrices[market];
      currentPrices[market] += change;

      batch.push({
        market,
        price: currentPrices[market].toFixed(2),
        size: (Math.random() * 2 + 0.01).toFixed(4),
        side: Math.random() > 0.5 ? 'buy' : 'sell',
        timestamp: new Date(t + Math.random() * 60000),
      });

      totalTrades++;

      // Batch insert when we reach BATCH_SIZE
      if (batch.length >= BATCH_SIZE) {
        await insertTrades(batch);
        batch.length = 0;
        process.stdout.write(`\rGenerated ${totalTrades} trades...`);
      }
    }
  }

  // Insert remaining trades
  if (batch.length > 0) {
    await insertTrades(batch);
  }

  await refreshCandles();
  console.log(`\nGenerated ${totalTrades} trades for ${market}`);
}
