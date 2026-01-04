import { insertTrade, insertTrades, authenticateAsAdmin } from './pocketbase';
import type { Trade } from './types';

// Re-export for seed script convenience
export { authenticateAsAdmin };

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

function generateTrade(market: string): Omit<Trade, 'id' | 'collectionId' | 'collectionName' | 'created' | 'updated'> {
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
  const size = parseFloat((Math.random() * 2 + 0.01).toFixed(4));

  // Random side
  const side: 'buy' | 'sell' = Math.random() > 0.5 ? 'buy' : 'sell';

  return {
    market,
    price: parseFloat(newPrice.toFixed(2)),
    size,
    side,
    timestamp: new Date().toISOString(),
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
      console.log(`[${trade.timestamp}] ${market}: ${trade.side} ${trade.size} @ ${trade.price}`);
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
  days: number = 7
): Promise<void> {
  console.log(`Generating ${days} days of initial candles for ${market}...`);

  initializePrices();
  const config = MARKETS[market];
  if (!config) {
    throw new Error(`Unknown market: ${market}`);
  }

  // Generate trades for each minute
  const now = Date.now();
  const startTime = now - days * 24 * 60 * 60 * 1000;

  const trades: Omit<Trade, 'id' | 'collectionId' | 'collectionName' | 'created' | 'updated'>[] = [];
  const totalMinutes = days * 24 * 60;
  let processedMinutes = 0;

  for (let t = startTime; t < now; t += 60000) {
    // Generate 5-20 trades per minute
    const tradesPerMinute = Math.floor(Math.random() * 15) + 5;

    for (let i = 0; i < tradesPerMinute; i++) {
      const change = (Math.random() - 0.5) * 2 * config.volatility * currentPrices[market];
      currentPrices[market] += change;

      trades.push({
        market,
        price: parseFloat(currentPrices[market].toFixed(2)),
        size: parseFloat((Math.random() * 2 + 0.01).toFixed(4)),
        side: Math.random() > 0.5 ? 'buy' : 'sell',
        timestamp: new Date(t + Math.random() * 60000).toISOString(),
      });
    }

    // Progress logging every 10%
    processedMinutes++;
    if (processedMinutes % Math.floor(totalMinutes / 10) === 0) {
      const progress = Math.round((processedMinutes / totalMinutes) * 100);
      console.log(`  Progress: ${progress}% (${processedMinutes}/${totalMinutes} minutes)`);
    }
  }

  console.log(`  Inserting ${trades.length} trades...`);
  await insertTrades(trades);
  console.log(`  ✓ Generated ${market} data`);
}
