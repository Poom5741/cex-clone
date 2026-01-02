# TradingView Charting POC Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a proof-of-concept cryptocurrency charting interface with self-hosted TradingView Lightweight Charts, TimescaleDB, and mock trade data.

**Architecture:** All-in-One Next.js application with TimescaleDB in Docker. Next.js handles frontend chart UI, API routes for data endpoints, and database queries. Mock data generator simulates trades that aggregate into candles.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, TradingView Lightweight Charts, TimescaleDB, Docker Compose

---

## Task 1: Docker Setup for TimescaleDB

**Files:**
- Create: `docker-compose.yml`
- Create: `.env`
- Create: `.gitignore`

**Step 1: Create .gitignore**

Create `.gitignore`:

```gitignore
node_modules
.next
.env.local
.env*.local
*.log
.DS_Store
```

**Step 2: Create .env file**

Create `.env`:

```env
POSTGRES_USER=trading_user
POSTGRES_PASSWORD=trading_password
POSTGRES_DB=trading_db
TIMESCALEDB_PORT=5432
PGADMIN_PORT=5050
```

**Step 3: Create docker-compose.yml**

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  timescaledb:
    image: timescale/timescaledb:latest-pg15
    container_name: trading_timescaledb
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "${TIMESCALEDB_PORT}:5432"
    volumes:
      - timescaledb_data:/home/postgresql/data
      - ./init-db.sql:/docker-entrypoint-initdb.d/init-db.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: trading_pgadmin
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@trading.local
      PGADMIN_DEFAULT_PASSWORD: admin
      PGADMIN_CONFIG_SERVER_MODE: 'False'
    ports:
      - "${PGADMIN_PORT}:80"
    depends_on:
      - timescaledb

volumes:
  timescaledb_data:
```

**Step 4: Commit Docker setup**

```bash
git add docker-compose.yml .env .gitignore
git commit -m "feat: add docker compose setup for timescaledb"
```

---

## Task 2: Database Schema

**Files:**
- Create: `init-db.sql`

**Step 1: Create database schema file**

Create `init-db.sql`:

```sql
-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Raw trades table (future-proof for on-chain integration)
CREATE TABLE IF NOT EXISTS trades (
  id SERIAL PRIMARY KEY,
  market VARCHAR(50) NOT NULL,
  price NUMERIC(36, 18) NOT NULL,
  size NUMERIC(36, 18) NOT NULL,
  side VARCHAR(10) NOT NULL CHECK (side IN ('buy', 'sell')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tx_hash VARCHAR(100),
  log_index INTEGER
);

-- Convert to hypertable for time-series optimization
SELECT create_hypertable('trades', 'timestamp', if_not_exists => TRUE);

-- Create index on market for faster queries
CREATE INDEX IF NOT EXISTS idx_trades_market ON trades(market);

-- 1-minute candles materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS candles_1m AS
SELECT
  time_bucket('1 minute', timestamp) AS time,
  market,
  first(price, timestamp) AS open,
  max(price) AS high,
  min(price) AS low,
  last(price, timestamp) AS close,
  sum(size) AS volume
FROM trades
GROUP BY time_bucket('1 minute', timestamp), market
WITH DATA;

-- Index for faster candle queries
CREATE UNIQUE INDEX IF NOT EXISTS idx_candles_1m_market_time
  ON candles_1m(market, time);

-- Function to refresh candles
CREATE OR REPLACE FUNCTION refresh_candles()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY candles_1m;
END;
$$ LANGUAGE plpgsql;
```

**Step 2: Commit database schema**

```bash
git add init-db.sql
git commit -m "feat: add database schema with trades table and candles"
```

---

## Task 3: Next.js Project Initialization

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.js`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`

**Step 1: Initialize package.json**

Create `package.json`:

```json
{
  "name": "trading-chart-poc",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "15.0.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "lightweight-charts": "^4.1.3",
    "pg": "^8.11.3",
    "clsx": "^2.1.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/pg": "^8.10.9",
    "typescript": "^5",
    "tailwindcss": "^3.4.1",
    "postcss": "^8",
    "autoprefixer": "^10.4.16",
    "eslint": "^8",
    "eslint-config-next": "15.0.3"
  }
}
```

**Step 2: Create TypeScript config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**Step 3: Create Next.js config**

Create `next.config.js`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}

module.exports = nextConfig
```

**Step 4: Create Tailwind config**

Create `tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0a0e17',
        surface: '#121826',
        amber: '#f59e0b',
        cyan: '#06b6d4',
        rose: '#f43f5e',
      },
      fontFamily: {
        mono: ['var(--font-jetbrains)', 'monospace'],
        sans: ['var(--font-ibm-plex)', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
```

**Step 5: Create PostCSS config**

Create `postcss.config.js`:

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

**Step 6: Install dependencies**

```bash
npm install
```

**Step 7: Commit project setup**

```bash
git add package.json tsconfig.json next.config.js tailwind.config.ts postcss.config.js
git commit -m "feat: initialize next.js project with typescript and tailwind"
```

---

## Task 4: Database Connection Layer

**Files:**
- Create: `lib/db.ts`
- Create: `lib/types.ts`

**Step 1: Create TypeScript types**

Create `lib/types.ts`:

```ts
export interface Trade {
  id: number;
  market: string;
  price: string;
  size: string;
  side: 'buy' | 'sell';
  timestamp: Date;
  tx_hash?: string;
  log_index?: number;
}

export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandleRow {
  time: Date;
  market: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export type Resolution = '1' | '5' | '15' | '60' | '240' | 'D';

export interface HistoryQuery {
  symbol: string;
  resolution: Resolution;
  from: number; // Unix timestamp
  to: number; // Unix timestamp
}
```

**Step 2: Create database connection**

Create `lib/db.ts`:

```ts
import { Pool, PoolClient } from 'pg';
import { Candle, CandleRow, Resolution, Trade } from './types';

const pool = new Pool({
  host: process.env.TIMESCALEDB_HOST || 'localhost',
  port: parseInt(process.env.TIMESCALEDB_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'trading_db',
  user: process.env.POSTGRES_USER || 'trading_user',
  password: process.env.POSTGRES_PASSWORD || 'trading_password',
});

export async function getConnection(): Promise<PoolClient> {
  return pool.connect();
}

export async function insertTrade(trade: Omit<Trade, 'id'>): Promise<void> {
  const client = await getConnection();
  try {
    await client.query(
      `INSERT INTO trades (market, price, size, side, timestamp, tx_hash, log_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [trade.market, trade.price, trade.size, trade.side, trade.timestamp, trade.tx_hash, trade.log_index]
    );
  } finally {
    client.release();
  }
}

export async function getCandles(
  market: string,
  from: Date,
  to: Date,
  resolution: Resolution = '1'
): Promise<Candle[]> {
  const client = await getConnection();
  try {
    const resolutionMinutes = resolution === 'D' ? 1440 : parseInt(resolution);
    const bucket = resolution === 'D' ? '1 day' : `${resolutionMinutes} minute`;

    const query = `
      SELECT
        time_bucket('${bucket}', time) AS time,
        market,
        first(open, time) AS open,
        max(high) AS high,
        min(low) AS low,
        last(close, time) AS close,
        sum(volume) AS volume
      FROM candles_1m
      WHERE market = $1 AND time BETWEEN $2 AND $3
      GROUP BY time_bucket('${bucket}', time), market
      ORDER BY time
    `;

    const result = await client.query<CandleRow>(query, [market, from, to]);

    return result.rows.map(row => ({
      time: Math.floor(new Date(row.time).getTime() / 1000),
      open: parseFloat(row.open),
      high: parseFloat(row.high),
      low: parseFloat(row.low),
      close: parseFloat(row.close),
      volume: parseFloat(row.volume),
    }));
  } finally {
    client.release();
  }
}

export async function refreshCandles(): Promise<void> {
  const client = await getConnection();
  try {
    await client.query('REFRESH MATERIALIZED VIEW CONCURRENTLY candles_1m');
  } finally {
    client.release();
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    const client = await getConnection();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch {
    return false;
  }
}
```

**Step 3: Commit database layer**

```bash
git add lib/types.ts lib/db.ts
git commit -m "feat: add database connection layer with types"
```

---

## Task 5: Global Styles and Fonts

**Files:**
- Create: `app/layout.tsx`
- Create: `app/globals.css`

**Step 1: Create global styles**

Create `app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap');

:root {
  --font-jetbrains: 'JetBrains Mono', monospace;
  --font-space-mono: 'Space Mono', monospace;
  --font-ibm-plex: 'IBM Plex Sans', sans-serif;

  --bg-primary: #0a0e17;
  --bg-surface: #121826;
  --accent-amber: #f59e0b;
  --accent-cyan: #06b6d4;
  --bearish: #f43f5e;
  --text-primary: #e2e8f0;
  --text-secondary: #94a3b8;
  --grid-color: #1e293b;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-ibm-plex);
  overflow: hidden;
}

/* Scanline effect */
body::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.05),
    rgba(0, 0, 0, 0.05) 1px,
    transparent 1px,
    transparent 2px
  );
  pointer-events: none;
  z-index: 9999;
}

/* Glow effects */
@layer utilities {
  .glow-amber {
    box-shadow: 0 0 20px rgba(245, 158, 11, 0.3);
  }
  .glow-cyan {
    box-shadow: 0 0 20px rgba(6, 182, 212, 0.3);
  }
  .text-glow {
    text-shadow: 0 0 10px currentColor;
  }
}

/* Custom scrollbar */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: var(--bg-surface);
}
::-webkit-scrollbar-thumb {
  background: var(--grid-color);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--accent-cyan);
}
```

**Step 2: Create root layout**

Create `app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Trading Terminal POC',
  description: 'Cryptocurrency charting with TradingView Lightweight Charts',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

**Step 3: Commit styles**

```bash
git add app/layout.tsx app/globals.css
git commit -m "feat: add global styles with dark retro-futuristic theme"
```

---

## Task 6: API Route - History Endpoint

**Files:**
- Create: `app/api/history/route.ts`

**Step 1: Create history API route**

Create `app/api/history/route.ts`:

```ts
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
```

**Step 2: Commit history API**

```bash
git add app/api/history/route.ts
git commit -m "feat: add history API endpoint for candle data"
```

---

## Task 7: Mock Data Generator

**Files:**
- Create: `lib/mockData.ts`

**Step 1: Create mock data generator**

Create `lib/mockData.ts`:

```ts
import { insertTrade, refreshCandles } from './db';
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

  for (let t = startTime; t < now; t += 60000) {
    // Generate 5-20 trades per minute
    const tradesPerMinute = Math.floor(Math.random() * 15) + 5;

    for (let i = 0; i < tradesPerMinute; i++) {
      const change = (Math.random() - 0.5) * 2 * config.volatility * currentPrices[market];
      currentPrices[market] += change;

      await insertTrade({
        market,
        price: currentPrices[market].toFixed(2),
        size: (Math.random() * 2 + 0.01).toFixed(4),
        side: Math.random() > 0.5 ? 'buy' : 'sell',
        timestamp: new Date(t + Math.random() * 60000),
      });
    }
  }

  await refreshCandles();
  console.log('Initial candles generated');
}
```

**Step 2: Commit mock data generator**

```bash
git add lib/mockData.ts
git commit -m "feat: add mock trade data generator"
```

---

## Task 8: Loading Skeleton Component

**Files:**
- Create: `components/LoadingSkeleton.tsx`

**Step 1: Create loading skeleton**

Create `components/LoadingSkeleton.tsx`:

```tsx
export default function LoadingSkeleton() {
  return (
    <div className="w-full h-[85vh] flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="inline-block">
          <div className="w-16 h-16 border-4 border-amber/20 border-t-amber rounded-full animate-spin"></div>
        </div>
        <p className="font-mono text-amber text-glow animate-pulse">INITIALIZING TERMINAL...</p>
      </div>
    </div>
  );
}
```

**Step 2: Commit loading skeleton**

```bash
git add components/LoadingSkeleton.tsx
git commit -m "feat: add loading skeleton component"
```

---

## Task 9: Status Bar Component

**Files:**
- Create: `components/StatusBar.tsx`

**Step 1: Create status bar component**

Create `components/StatusBar.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { testConnection } from '@/lib/db';

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

**Step 2: Commit status bar**

```bash
git add components/StatusBar.tsx
git commit -m "feat: add status bar component"
```

---

## Task 10: Market Selector Component

**Files:**
- Create: `components/MarketSelector.tsx`

**Step 1: Create market selector**

Create `components/MarketSelector.tsx`:

```tsx
'use client';

import { useState } from 'react';

const MARKETS = ['ETH/USDC', 'BTC/USDC', 'SOL/USDC'];

interface MarketSelectorProps {
  value: string;
  onChange: (market: string) => void;
}

export default function MarketSelector({ value, onChange }: MarketSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-surface border border-amber/30 hover:border-amber rounded transition-all hover:glow-amber"
      >
        <span className="font-mono text-sm text-secondary">MARKET</span>
        <span className="font-mono text-sm text-amber font-semibold">{value}</span>
        <span className={`text-amber transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          ></div>
          <div className="absolute top-full left-0 mt-2 z-20 bg-surface border border-amber/30 rounded overflow-hidden shadow-2xl">
            {MARKETS.map((market) => (
              <button
                key={market}
                onClick={() => {
                  onChange(market);
                  setIsOpen(false);
                }}
                className={`block w-full px-4 py-2 text-left font-mono text-sm transition-colors ${
                  value === market
                    ? 'bg-amber/20 text-amber'
                    : 'text-primary hover:bg-amber/10 hover:text-amber'
                }`}
              >
                {market}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

**Step 2: Commit market selector**

```bash
git add components/MarketSelector.tsx
git commit -m "feat: add market selector dropdown component"
```

---

## Task 11: Timeframe Tabs Component

**Files:**
- Create: `components/TimeframeTabs.tsx`

**Step 1: Create timeframe tabs**

Create `components/TimeframeTabs.tsx`:

```tsx
'use client';

import { type Resolution } from '@/lib/types';

const TIMEFRAMES: { value: Resolution; label: string }[] = [
  { value: '1', label: '1m' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '60', label: '1H' },
  { value: '240', label: '4H' },
  { value: 'D', label: '1D' },
];

interface TimeframeTabsProps {
  value: Resolution;
  onChange: (resolution: Resolution) => void;
}

export default function TimeframeTabs({ value, onChange }: TimeframeTabsProps) {
  return (
    <div className="flex items-center gap-1 bg-surface border border-cyan/30 rounded p-1">
      <span className="px-2 font-mono text-xs text-secondary">TF</span>
      {TIMEFRAMES.map(({ value: tf, label }) => (
        <button
          key={tf}
          onClick={() => onChange(tf)}
          className={`px-3 py-1 font-mono text-sm rounded transition-all ${
            value === tf
              ? 'bg-cyan/20 text-cyan font-semibold'
              : 'text-primary hover:bg-cyan/10 hover:text-cyan'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
```

**Step 2: Commit timeframe tabs**

```bash
git add components/TimeframeTabs.tsx
git commit -m "feat: add timeframe tabs component"
```

---

## Task 12: Chart Component with TradingView Lightweight Charts

**Files:**
- Create: `components/Chart.tsx`

**Step 1: Create chart component**

Create `components/Chart.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType, Time } from 'lightweight-charts';
import type { Candle, Resolution } from '@/lib/types';

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

        const data: Candle[] = await response.json();

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

**Step 2: Commit chart component**

```bash
git add components/Chart.tsx
git commit -m "feat: add TradingView Lightweight Charts component"
```

---

## Task 13: Main Page Integration

**Files:**
- Create: `app/page.tsx`

**Step 1: Create main page**

Create `app/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import StatusBar from '@/components/StatusBar';
import MarketSelector from '@/components/MarketSelector';
import TimeframeTabs from '@/components/TimeframeTabs';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import type { Resolution } from '@/lib/types';

const Chart = dynamic(() => import('@/components/Chart'), {
  loading: () => <LoadingSkeleton />,
  ssr: false,
});

export default function HomePage() {
  const [market, setMarket] = useState('ETH/USDC');
  const [resolution, setResolution] = useState<Resolution>('5');

  const handleMarketChange = (newMarket: string) => {
    setMarket(newMarket);
  };

  const handleResolutionChange = (newResolution: Resolution) => {
    setResolution(newResolution);
  };

  return (
    <div className="min-h-screen bg-primary">
      {/* Header */}
      <header className="border-b border-grid">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <h1 className="font-mono text-xl font-bold text-amber text-glow">
              TRADING_TERMINAL
            </h1>
            <MarketSelector value={market} onChange={handleMarketChange} />
          </div>
          <TimeframeTabs value={resolution} onChange={handleResolutionChange} />
        </div>
        <StatusBar market={market} />
      </header>

      {/* Chart */}
      <main>
        <Chart symbol={market} resolution={resolution} />
      </main>
    </div>
  );
}
```

**Step 2: Commit main page**

```bash
git add app/page.tsx
git commit -m "feat: add main page with chart integration"
```

---

## Task 14: Environment Configuration

**Files:**
- Modify: `.env`

**Step 1: Update .env for local development**

Update `.env`:

```env
# Database
POSTGRES_USER=trading_user
POSTGRES_PASSWORD=trading_password
POSTGRES_DB=trading_db
TIMESCALEDB_HOST=localhost
TIMESCALEDB_PORT=5432
PGADMIN_PORT=5050

# Next.js
NEXT_PUBLIC_API_URL=http://localhost:3000
```

**Step 2: Commit .env.example**

Create `.env.example`:

```env
# Database
POSTGRES_USER=trading_user
POSTGRES_PASSWORD=trading_password
POSTGRES_DB=trading_db
TIMESCALEDB_HOST=localhost
TIMESCALEDB_PORT=5432
PGADMIN_PORT=5050

# Next.js
NEXT_PUBLIC_API_URL=http://localhost:3000
```

**Step 3: Commit environment config**

```bash
git add .env .env.example
git commit -m "feat: add environment configuration"
```

---

## Task 15: Seed Script for Initial Data

**Files:**
- Create: `scripts/seed.ts`
- Modify: `package.json`

**Step 1: Create seed script**

Create `scripts/seed.ts`:

```ts
import { generateInitialCandles, startMockTrades } from '../lib/mockData';

async function main() {
  console.log('Seeding database with initial data...');

  // Generate 7 days of candles for each market
  const markets = ['ETHUSDC', 'BTCUSDC', 'SOLUSDC'];

  for (const market of markets) {
    console.log(`Generating data for ${market}...`);
    await generateInitialCandles(market, 7);
  }

  console.log('Seed complete!');
  console.log('Starting mock trades...');

  // Start generating live trades
  await startMockTrades('ETHUSDC', 2000);

  // Keep running
  process.on('SIGINT', () => {
    console.log('\nStopping...');
    process.exit(0);
  });
}

main().catch(console.error);
```

**Step 2: Add ts-node dependency**

Update `package.json` scripts section:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "seed": "ts-node --project tsconfig.json scripts/seed.ts"
},
```

Add ts-node to devDependencies:

```json
"devDependencies": {
  "@types/node": "^20",
  "@types/react": "^19",
  "@types/react-dom": "^19",
  "@types/pg": "^8.10.9",
  "typescript": "^5",
  "tailwindcss": "^3.4.1",
  "postcss": "^8",
  "autoprefixer": "^10.4.16",
  "eslint": "^8",
  "eslint-config-next": "15.0.3",
  "ts-node": "^10.9.2"
}
```

**Step 3: Commit seed script**

```bash
git add scripts/seed.ts package.json
git commit -m "feat: add seed script for initial data generation"
```

---

## Task 16: README Documentation

**Files:**
- Create: `README.md`

**Step 1: Create README**

Create `README.md`:

```markdown
# Trading Terminal POC

A proof-of-concept cryptocurrency charting interface using TradingView Lightweight Charts and TimescaleDB.

## Tech Stack

- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Charts:** TradingView Lightweight Charts
- **Database:** TimescaleDB (PostgreSQL with time-series extensions)
- **Infrastructure:** Docker Compose

## Quick Start

### 1. Start TimescaleDB

```bash
docker-compose up -d
```

TimescaleDB will be available on `localhost:5432`.
pgAdmin will be available on `http://localhost:5050`.

### 2. Install Dependencies

```bash
npm install
```

### 3. Seed Database (Optional)

Run this to generate initial candle data:

```bash
npm run seed
```

This will:
- Generate 7 days of historical candles for ETH/USDC, BTC/USDC, and SOL/USDC
- Start generating mock trades every 2 seconds

### 4. Start Development Server

```bash
npm run dev
```

Open `http://localhost:3000` to view the chart.

## Features

- Real-time candlestick chart with TradingView Lightweight Charts
- Market selector (ETH/USDC, BTC/USDC, SOL/USDC)
- Timeframe switching (1m, 5m, 15m, 1H, 4H, 1D)
- Database status indicator
- Dark retro-futuristic trading terminal aesthetic

## Architecture

```
Next.js Frontend → API Routes → TimescaleDB
     ↓
  Chart UI
```

- Next.js handles frontend, API routes, and database queries
- TimescaleDB stores raw trades and aggregated candles
- Mock data generator simulates live trading

## Database Schema

### trades (hypertable)
Raw trade data for future on-chain integration.

### candles_1m (materialized view)
1-minute OHLCV candles aggregated from trades.

## Development

### Adding New Markets

Edit `lib/mockData.ts` to add new market configurations:

```ts
const MARKETS: Record<string, MarketConfig> = {
  'ETHUSDC': { basePrice: 3500, volatility: 0.002 },
  'YOURTICKER': { basePrice: 100, volatility: 0.002 },
};
```

### Adding New Timeframes

Edit `components/TimeframeTabs.tsx` to add new resolution options.

## Future Work

- WebSocket for real-time updates
- Real exchange API integration
- On-chain event ingestion
- Order book display
- Trading interface
- Authentication
```

**Step 2: Commit README**

```bash
git add README.md
git commit -m "docs: add comprehensive README"
```

---

## Task 17: Final Integration and Testing

**Files:**
- None (verification task)

**Step 1: Install all dependencies**

```bash
npm install
```

**Step 2: Start Docker services**

```bash
docker-compose up -d
```

Wait for TimescaleDB to be healthy (check with `docker-compose ps`).

**Step 3: Seed database with mock data**

Open a new terminal and run:

```bash
npm run seed
```

Let it run for a bit to generate initial data, then stop with Ctrl+C.

**Step 4: Start Next.js development server**

```bash
npm run dev
```

**Step 5: Verify functionality**

1. Open `http://localhost:3000`
2. Check that chart loads with historical candles
3. Try switching timeframes (1m, 5m, 15m, 1H, 4H, 1D)
4. Try switching markets (ETH/USDC, BTC/USDC, SOL/USDC)
5. Check that database status shows "connected"

**Step 6: Test real-time updates**

In another terminal, start the mock trade generator again:

```bash
npm run seed
```

Watch the chart update with new candles.

**Step 7: Final commit**

```bash
git add .
git commit -m "feat: complete trading chart POC implementation"
```

---

## Success Criteria Verification

- [ ] Chart loads and displays historical candles
- [ ] Timeframe switch works (1m, 5m, 15m, 1H, 4H, 1D)
- [ ] Last candle updates in real-time (when seed script running)
- [ ] Market selector changes displayed data
- [ ] Connection status indicator shows "connected"
- [ ] Docker Compose runs all services successfully

---

## Notes for Implementation

1. **Dependencies:** Run `npm install` after committing package.json changes
2. **Database:** Ensure TimescaleDB is fully started before seeding
3. **Browser:** TradingView Lightweight Charts requires client-side rendering (ssr: false)
4. **Styling:** All custom CSS variables are in `app/globals.css`
5. **Mock Data:** The seed script continues running - press Ctrl+C to stop

## Future Extensions

- WebSocket endpoint at `/api/stream` for real-time candle updates
- Refresh materialized view on a schedule instead of per-trade
- Add more technical indicators (volume, MA, RSI)
- Implement proper error boundaries
- Add chart drawing tools
- Historical data export functionality
