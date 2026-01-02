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
