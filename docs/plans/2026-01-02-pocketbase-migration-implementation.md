# PocketBase Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate from TimescaleDB/PostgreSQL to PocketBase for the trading chart POC, replacing SQL queries with PocketBase SDK and enabling built-in realtime subscriptions.

**Architecture:** Replace TimescaleDB Docker container with PocketBase (SQLite in single binary). Next.js API routes use PocketBase JavaScript SDK for queries. Store all trades (on-chain traceability) + 1m candles (aggregated via hooks). Higher timeframes aggregated on-demand from 1m candles.

**Tech Stack:** PocketBase 0.21+, Next.js 15, TypeScript, TradingView Lightweight Charts, Docker Compose

---

## Task 1: Add PocketBase Dependency

**Files:**
- Modify: `package.json`

**Step 1: Add pocketbase dependency**

Run: `npm install pocketbase`

Expected: Dependency added to package.json and node_modules

**Step 2: Remove pg dependency**

Run: `npm uninstall pg @types/pg`

Expected: Dependencies removed from package.json

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add pocketbase sdk, remove pg dependency"
```

---

## Task 2: Download and Setup PocketBase Binary

**Files:**
- Create: `bin/pocketbase` (executable)
- Modify: `.gitignore`

**Step 1: Create bin directory**

Run: `mkdir -p bin`

**Step 2: Download PocketBase binary**

Run (macOS ARM64):
```bash
curl -L https://github.com/pocketbase/pocketbase/releases/download/v0.21.1/pocketbase_0.21.1_darwin_arm64.zip -o pocketbase.zip
unzip pocketbase.zip -d bin
rm pocketbase.zip
chmod +x bin/pocketbase
```

For other platforms, download from: https://github.com/pocketbase/pocketbase/releases

**Step 3: Add bin/ to .gitignore**

Append to `.gitignore`:
```
bin/
```

**Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: add pocketbase binary to gitignore"
```

**Step 5: Verify PocketBase runs**

Run: `./bin/pocketbase --version`

Expected: Version output like `0.21.1`

---

## Task 3: Create PocketBase Schema Migration File

**Files:**
- Create: `pocketbase/migrations/001_initial_schema.go`

**Step 1: Create migrations directory**

Run: `mkdir -p pocketbase/migrations`

**Step 2: Write schema migration**

Create `pocketbase/migrations/001_initial_schema.go`:

```go
package migrations

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models"
)

func InitialSchema(dao *daos.Dao) error {
	// Create trades collection
	tradesCollection := &models.Collection{
		Name: "trades",
		Type: models.CollectionTypeBase,
		Schema: models.Schema{
			{
				Name:     "market",
				Type:     models.FieldTypeText,
				Required: true,
				Options: &models.TextOptions{
					Min: 1,
				},
			},
			{
				Name:     "price",
				Type:     models.FieldTypeNumber,
				Required: true,
			},
			{
				Name:     "size",
				Type:     models.FieldTypeNumber,
				Required: true,
			},
			{
				Name:     "side",
				Type:     models.FieldTypeSelect,
				Required: true,
				Options: &models.SelectOptions{
					Values: []string{"buy", "sell"},
				},
			},
			{
				Name:     "timestamp",
				Type:     models.FieldTypeDate,
				Required: true,
			},
			{
				Name: "tx_hash",
				Type: models.FieldTypeText,
			},
			{
				Name: "log_index",
				Type: models.FieldTypeNumber,
			},
		},
		Indexes: models.Indexes{
			"idx_market":     `CREATE INDEX idx_market ON trades (market)`,
			"idx_timestamp": `CREATE INDEX idx_timestamp ON trades (timestamp)`,
		},
	}

	if err := dao.SaveCollection(tradesCollection); err != nil {
		return err
	}

	// Create candles_1m collection
	candlesCollection := &models.Collection{
		Name: "candles_1m",
		Type: models.CollectionTypeBase,
		Schema: models.Schema{
			{
				Name:     "time",
				Type:     models.FieldTypeDate,
				Required: true,
			},
			{
				Name:     "market",
				Type:     models.FieldTypeText,
				Required: true,
			},
			{
				Name:     "open",
				Type:     models.FieldTypeNumber,
				Required: true,
			},
			{
				Name:     "high",
				Type:     models.FieldTypeNumber,
				Required: true,
			},
			{
				Name:     "low",
				Type:     models.FieldTypeNumber,
				Required: true,
			},
			{
				Name:     "close",
				Type:     models.FieldTypeNumber,
				Required: true,
			},
			{
				Name:     "volume",
				Type:     models.FieldTypeNumber,
				Required: true,
			},
		},
		Indexes: models.Indexes{
			"idx_market_time": `CREATE UNIQUE INDEX idx_market_time ON candles_1m (market, time)`,
		},
	}

	if err := dao.SaveCollection(candlesCollection); err != nil {
		return err
	}

	return nil
}
```

**Step 3: Commit**

```bash
git add pocketbase/migrations/
git commit -m "feat: add pocketbase schema migration for trades and candles"
```

---

## Task 4: Create PocketBase Hook for Candle Aggregation

**Files:**
- Create: `pocketbase/hooks/candle_aggregation.go`

**Step 1: Create hooks directory**

Run: `mkdir -p pocketbase/hooks`

**Step 2: Write aggregation hook**

Create `pocketbase/hooks/candle_aggregation.go`:

```go
package hooks

import (
	"log"
	"math"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/tools/hook"
)

// FloorToMinute floors a timestamp to the nearest minute
func FloorToMinute(t time.Time) time.Time {
	return t.Truncate(time.Minute)
}

// RegisterCandleAggregationHook registers the hook that aggregates candles from trades
func RegisterCandleAggregationHook(app *pocketbase.PocketBase) {
	app.OnRecordAfterCreateRequest("trades").Add(&hook.Handler[*models.Record]{
		Func: func(e *hook.Event[*models.Record]) error {
			trade := e.Record

			// Get market and timestamp
			market := trade.GetString("market")
			timestamp := trade.GetDateTime("timestamp")
			if timestamp.IsZero() {
				timestamp = time.Now()
			}

			// Floor to minute
			minuteBucket := FloorToMinute(timestamp.Time())

			// Find existing candle or create new one
			candle, err := app.Dao().FindFirstRecordByFilter(
				"candles_1m",
				"market = {:market} && time = {:time}",
				dbx.Params{"market": market, "time": minuteBucket},
			)

			price := trade.GetFloat64("price")
			size := trade.GetFloat64("size")

			if err != nil {
				// Create new candle
				candle = models.NewRecord(app.Dao().FindCollectionByNameOrId("candles_1m"))
				candle.Set("market", market)
				candle.Set("time", minuteBucket)
				candle.Set("open", price)
				candle.Set("high", price)
				candle.Set("low", price)
				candle.Set("close", price)
				candle.Set("volume", size)
			} else {
				// Update existing candle
				existingHigh := candle.GetFloat64("high")
				existingLow := candle.GetFloat64("low")
				existingVolume := candle.GetFloat64("volume")

				candle.Set("high", math.Max(existingHigh, price))
				candle.Set("low", math.Min(existingLow, price))
				candle.Set("close", price)
				candle.Set("volume", existingVolume+size)
			}

			if err := app.Dao().SaveRecord(candle); err != nil {
				log.Printf("Error saving candle: %v", err)
				return err
			}

			return nil
		},
	})
}
```

**Step 3: Create main.go to register hook**

Create `pocketbase/main.go`:

```go
package main

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/plugins/automigrate"
)

func main() {
	app := pocketbase.New()

	// Register hooks
	hooks.RegisterCandleAggregationHook(app)

	// Auto migrate
	automigrate.Register(app, app.RootCmd, &automigrate.Config{
		Dirs: []string{"./migrations"},
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
```

**Step 4: Commit**

```bash
git add pocketbase/hooks/ pocketbase/main.go
git commit -m "feat: add candle aggregation hook for pocketbase"
```

---

## Task 5: Update TypeScript Types

**Files:**
- Modify: `lib/types.ts`

**Step 1: Read current types**

Run: `cat lib/types.ts`

**Step 2: Update types for PocketBase**

Replace `lib/types.ts`:

```ts
// PocketBase record types
export interface PocketBaseRecord {
  id: string;
  collectionId: string;
  collectionName: string;
  created: string;
  updated: string;
}

export interface Trade extends PocketBaseRecord {
  market: string;
  price: number;
  size: number;
  side: 'buy' | 'sell';
  timestamp: string;
  tx_hash?: string;
  log_index?: number;
}

export interface Candle extends PocketBaseRecord {
  time: string;
  market: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Chart formats (TradingView Lightweight Charts expects)
export interface ChartCandle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Resolution = '1' | '5' | '15' | '60' | '240' | 'D';

export interface HistoryQuery {
  symbol: string;
  resolution: Resolution;
  from: number; // Unix timestamp
  to: number; // Unix timestamp
}

// PocketBase list response
export interface PocketBaseList<T> {
  page: number;
  perPage: number;
  totalItems: number;
  items: T[];
}
}
```

**Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "refactor: update types for PocketBase"
```

---

## Task 6: Create PocketBase Client

**Files:**
- Create: `lib/pocketbase.ts`
- Delete: `lib/db.ts`

**Step 1: Create PocketBase client**

Create `lib/pocketbase.ts`:

```ts
import PocketBase from 'pocketbase';
import type { ChartCandle, Candle, Resolution } from './types';

const pb = new PocketBase(
  process.env.POCKETBASE_URL || 'http://localhost:8090'
);

// Export for use in other modules
export { pb };

// Helper: Floor timestamp to minute
function floorToMinute(date: Date): Date {
  const d = new Date(date);
  d.setSeconds(0, 0);
  return d;
}

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
```

**Step 2: Remove old db.ts**

Run: `rm lib/db.ts`

**Step 3: Commit**

```bash
git add lib/pocketbase.ts lib/db.ts
git commit -m "refactor: replace pg db layer with pocketbase client"
```

---

## Task 7: Update History API Route

**Files:**
- Modify: `app/api/history/route.ts`

**Step 1: Read current route**

Run: `cat app/api/history/route.ts`

**Step 2: Update to use PocketBase**

Replace `app/api/history/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getCandles } from '@/lib/pocketbase';
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
```

**Step 3: Commit**

```bash
git add app/api/history/route.ts
git commit -m "refactor: update history api to use pocketbase"
```

---

## Task 8: Update Mock Data Generator

**Files:**
- Modify: `lib/mockData.ts`

**Step 1: Read current mock data**

Run: `cat lib/mockData.ts`

**Step 2: Update to use PocketBase**

Replace `lib/mockData.ts`:

```ts
import { insertTrade } from './pocketbase';
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
  }

  await insertTrades(trades);
  console.log('Initial candles generated');
}
```

**Step 3: Commit**

```bash
git add lib/mockData.ts
git commit -m "refactor: update mock data generator to use pocketbase"
```

---

## Task 9: Update Environment Variables

**Files:**
- Modify: `.env`
- Modify: `.env.example`

**Step 1: Update .env**

Replace `.env`:

```env
# PocketBase
POCKETBASE_URL=http://localhost:8090

# Next.js
NEXT_PUBLIC_API_URL=http://localhost:3000
```

**Step 2: Update .env.example**

Replace `.env.example`:

```env
# PocketBase
POCKETBASE_URL=http://localhost:8090

# Next.js
NEXT_PUBLIC_API_URL=http://localhost:3000
```

**Step 3: Commit**

```bash
git add .env .env.example
git commit -m "refactor: update env vars for pocketbase"
```

---

## Task 10: Update Docker Compose for PocketBase

**Files:**
- Modify: `docker-compose.yml`

**Step 1: Read current docker-compose**

Run: `cat docker-compose.yml`

**Step 2: Replace with PocketBase service**

Replace `docker-compose.yml`:

```yaml
version: '3.8'

services:
  pocketbase:
    image: ghcr.io/muchobien/pocketbase:latest
    container_name: trading_pocketbase
    ports:
      - "8090:8090"
    volumes:
      - pocketbase_data:/pb_data
      - ./pocketbase:/pb_hooks
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8090/api/health"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pocketbase_data:
```

**Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "refactor: replace timescaledb with pocketbase in docker compose"
```

---

## Task 11: Update StatusBar Component for PocketBase Health

**Files:**
- Modify: `components/StatusBar.tsx`

**Step 1: Read current StatusBar**

Run: `cat components/StatusBar.tsx`

**Step 2: Update to use PocketBase health check**

Replace `components/StatusBar.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { testConnection } from '@/lib/pocketbase';

interface StatusBarProps {
  market: string;
}

export default function StatusBar({ market }: StatusBarProps) {
  const [dbStatus, setDbStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');

  useEffect(() => {
    const checkConnection = async () => {
      setDbStatus('connecting');
      const connected = await testConnection();
      setDbStatus(connected ? 'connected' : 'disconnected');
    };

    checkConnection();
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, []);

  const statusColor = {
    connected: 'text-amber',
    disconnected: 'text-rose',
    connecting: 'text-cyan',
  }[dbStatus];

  return (
    <div className="flex items-center gap-6 px-4 py-2 bg-surface border-b border-grid">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm text-secondary">MARKET:</span>
        <span className="font-mono text-sm text-primary font-semibold">{market}</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-mono text-sm text-secondary">DATABASE:</span>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusColor} ${
            dbStatus === 'connected' ? 'animate-pulse' : ''
          }`}></span>
          <span className={`font-mono text-sm ${statusColor} uppercase`}>{dbStatus}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-mono text-sm text-secondary">STATUS:</span>
        <span className="font-mono text-sm text-cyan uppercase">Live</span>
      </div>

      <div className="ml-auto font-mono text-xs text-secondary">
        {new Date().toLocaleString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add components/StatusBar.tsx
git commit -m "refactor: update statusbar to use pocketbase health check"
```

---

## Task 12: Build PocketBase and Start Services

**Files:**
- None (verification task)

**Step 1: Build PocketBase Go app**

Run from worktree root:
```bash
cd pocketbase
go build -o ../bin/pocketbase
cd ..
```

Expected: Binary created at `bin/pocketbase`

**Step 2: Start PocketBase**

Run: `./bin/pocketbase serve --dev`

Expected: Output showing server starting on http://127.0.0.1:8090

**Step 3: Create collections via Admin UI**

1. Open http://localhost:8090/_/
2. Login with default admin (create new admin)
3. Go to Collections
4. Verify `trades` and `candles_1m` collections exist (auto-created by migrations)

**Step 4: Seed initial data**

Run in new terminal:
```bash
npm run seed
```

Expected: Initial candles generated, mock trades starting

**Step 5: Start Next.js dev server**

Run in another terminal:
```bash
npm run dev
```

**Step 6: Test the application**

1. Open http://localhost:3000
2. Verify chart loads
3. Check database status shows "connected"
4. Test timeframe switching
5. Test market switching

---

## Task 13: Add Realtime Subscription to Chart Component

**Files:**
- Modify: `components/Chart.tsx`

**Step 1: Read current Chart component**

Run: `cat components/Chart.tsx`

**Step 2: Add realtime subscription**

Replace `components/Chart.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType, Time } from 'lightweight-charts';
import PocketBase from 'pocketbase';
import type { Candle, Resolution, ChartCandle } from '@/lib/types';

interface ChartProps {
  symbol: string;
  resolution: Resolution;
}

export default function Chart({ symbol, resolution }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0e17' },
        textColor: '#e2e8f0',
      },
      grid: {
        vertLines: { color: '#1e293b', style: 1, visible: true },
        horzLines: { color: '#1e293b', style: 1, visible: true },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#06b6d4',
          width: 1,
          style: 2,
          labelBackgroundColor: '#121826',
        },
        horzLine: {
          color: '#06b6d4',
          width: 1,
          style: 2,
          labelBackgroundColor: '#121826',
        },
      },
      rightPriceScale: {
        borderColor: '#1e293b',
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#f59e0b',
      downColor: '#f43f5e',
      borderUpColor: '#f59e0b',
      borderDownColor: '#f43f5e',
      wickUpColor: '#f59e0b',
      wickDownColor: '#f43f5e',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Load data when symbol or resolution changes
  useEffect(() => {
    const loadData = async () => {
      if (!seriesRef.current) return;

      setIsLoading(true);

      try {
        const to = Math.floor(Date.now() / 1000);
        const from = to - 7 * 24 * 60 * 60; // 7 days ago

        const market = symbol.replace('/', '');
        const params = new URLSearchParams({
          symbol: market,
          resolution,
          from: from.toString(),
          to: to.toString(),
        });

        const response = await fetch(`/api/history?${params}`);
        if (!response.ok) throw new Error('Failed to fetch data');

        const data: ChartCandle[] = await response.json();

        seriesRef.current.setData(data);
        chartRef.current?.timeScale().fitContent();
      } catch (error) {
        console.error('Error loading chart data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [symbol, resolution]);

  // Realtime subscription
  useEffect(() => {
    const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090');
    const market = symbol.replace('/');

    // Subscribe to candle updates
    const unsubscribe = pb.collection('candles_1m').subscribe('*', (e) => {
      const record = e.record as Candle;

      // Only update if it matches our market
      if (record.market !== market) return;

      if (!seriesRef.current) return;

      const chartCandle: ChartCandle = {
        time: Math.floor(new Date(record.time).getTime() / 1000),
        open: record.open,
        high: record.high,
        low: record.low,
        close: record.close,
        volume: record.volume,
      };

      // Update or add candle
      seriesRef.current.update(chartCandle);
    });

    return () => {
      unsubscribe.then((unsub) => unsub());
    };
  }, [symbol]);

  return (
    <div className="relative w-full h-[85vh]">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/80 z-10">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-amber/30 border-t-amber rounded-full animate-spin"></div>
            <span className="font-mono text-sm text-amber animate-pulse">LOADING DATA...</span>
          </div>
        </div>
      )}
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}
```

**Step 3: Update .env for client-side**

Add to `.env`:
```env
NEXT_PUBLIC_POCKETBASE_URL=http://localhost:8090
```

**Step 4: Update .env.example**

Add to `.env.example`:
```env
NEXT_PUBLIC_POCKETBASE_URL=http://localhost:8090
```

**Step 5: Commit**

```bash
git add components/Chart.tsx .env .env.example
git commit -m "feat: add realtime subscription to chart component"
```

---

## Task 14: Clean Up - Remove Old Files

**Files:**
- Delete: `init-db.sql`
- Delete: `docker-compose.yml` (if not already updated)

**Step 1: Remove old database init file**

Run: `rm init-db.sql`

**Step 2: Commit**

```bash
git add init-db.sql
git commit -m "chore: remove old timescaledb init file"
```

---

## Task 15: Final Testing and Verification

**Files:**
- None (verification task)

**Step 1: Build application**

Run: `npm run build`

Expected: Build succeeds without errors

**Step 2: Run all checks**

Run: `npm run lint`

Expected: No linting errors

**Step 3: Manual testing checklist**

- [ ] Chart loads with historical candles
- [ ] Timeframe switching works (1m, 5m, 15m, 1H, 4H, 1D)
- [ ] Market switching works (ETH/USDC, BTC/USDC, SOL/USDC)
- [ ] Last candle updates in real-time
- [ ] Database status shows "connected"
- [ ] PocketBase admin UI accessible at http://localhost:8090/_/

**Step 4: Final commit**

```bash
git add .
git commit -m "feat: complete pocketbase migration implementation"
```

---

## Success Criteria

- [x] PocketBase binary runs successfully
- [x] Collections created (trades, candles_1m)
- [x] Hook aggregates candles on trade insert
- [x] History API returns candle data
- [x] Chart displays data correctly
- [x] Realtime updates push to frontend
- [x] All timeframes work (1m, 5m, 15m, 1H, 4H, 1D)
- [x] Multiple markets work
- [x] No TimescaleDB dependencies remaining

---

## Notes

- PocketBase Admin UI: http://localhost:8090/_/
- Default admin: create on first visit
- Data stored in `pb_data` directory (in Docker volume or local)
- Hook code automatically aggregates candles when trades are inserted
- Realtime is automatic - no manual WebSocket code needed
- For production, use Docker Compose deployment

---

## References

- PocketBase docs: https://pocketbase.io/docs/
- Realtime API: https://pocketbase.io/docs/api-realtime/
- Go hooks: https://pocketbase.io/docs/js-overview/#go-hooks
- Migrations: https://pocketbase.io/docs/go-migrations/
