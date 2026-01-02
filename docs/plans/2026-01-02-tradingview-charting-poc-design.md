# TradingView Charting POC Design

**Date:** 2026-01-02
**Status:** Design Complete

## Overview

Proof-of-concept for a self-hosted cryptocurrency charting interface using TradingView Lightweight Charts and TimescaleDB. Designed as a foundation for a future on-chain orderbook exchange.

## Architecture

**Approach: All-in-One Next.js**

Single codebase where Next.js handles:
- Frontend chart UI
- API routes for data endpoints
- Database queries to TimescaleDB

**Why:** Fastest POC development, single `docker-compose up`, easy to extract API service later when scaling.

**Alternatives Considered:**
1. Next.js + Separate API Service (more realistic production, but slower POC)
2. In-Memory Data (fastest, but requires rebuild later)

## System Components

### Frontend (Next.js App Router)

```
app/
├── page.tsx                 # Main chart page (client component)
├── layout.tsx               # Root layout with fonts
├── globals.css              # Tailwind + custom styles
└── api/
    ├── history/route.ts     # GET /api/history?symbol=...&from=...&to=...
    └── stream/route.ts      # WS /api/stream (real-time updates)

components/
├── Chart.tsx                # TradingView Lightweight Charts wrapper
├── MarketSelector.tsx       # Market dropdown
├── TimeframeTabs.tsx        # Resolution selector (1m, 5m, 1h, etc.)
├── StatusBar.tsx            # Connection/market status indicators
└── LoadingSkeleton.tsx      # Chart loading state

lib/
├── db.ts                    # TimescaleDB connection
├── mockData.ts              # Mock trade generator
└── types.ts                 # TypeScript types
```

### Database (Docker)

**Services:**
- `timescaledb` - PostgreSQL 15 + TimescaleDB extension
- `pgadmin` (optional) - Web UI for database inspection

**Schema:**

```sql
-- Raw trades table (future-proof for on-chain)
CREATE TABLE trades (
  id SERIAL PRIMARY KEY,
  market VARCHAR(50) NOT NULL,
  price NUMERIC(36, 18) NOT NULL,
  size NUMERIC(36, 18) NOT NULL,
  side VARCHAR(10) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tx_hash VARCHAR(100),
  log_index INTEGER
);

SELECT create_hypertable('trades', 'timestamp');

-- 1-minute candles (materialized view)
CREATE MATERIALIZED VIEW candles_1m AS
SELECT
  time_bucket('1 minute', timestamp) AS time,
  market,
  first(price, timestamp) AS open,
  max(price) AS high,
  min(price) AS low,
  last(price, timestamp) AS close,
  sum(size) AS volume
FROM trades
GROUP BY time_bucket('1 minute', timestamp), market;
```

## Data Flow

### Historical Data Load

1. User opens page → `Chart.tsx` initializes TradingView Lightweight Charts
2. Chart requests data → `fetchCandles(market, resolution, from, to)`
3. API `/api/history` queries TimescaleDB for candle data
4. DB returns OHLCV → API formats as array → Chart renders

### Real-time Updates (Mocked)

1. `mockData.ts` generates random trade every 1-3 seconds
2. Trade inserts into `trades` table
3. `candles_1m` view updates (refresh materialized view)
4. WebSocket `/api/stream` pushes updated candle to client
5. Chart updates last candle

### Timeframe Switch

1. User changes resolution (1m → 5m)
2. Chart calls `fetchCandles(..., resolution='5')`
3. API aggregates data on-the-fly from 1m candles
4. Chart re-renders

## Frontend Design

**Aesthetic Direction: Dark Retro-Futuristic Trading Terminal**

Bloomberg terminal meets cyberpunk - a professional, memorable interface that stands apart from generic crypto dashboards.

### Typography

| Usage | Font | Rationale |
|-------|------|-----------|
| Headers | JetBrains Mono | Technical, monospace, highly legible |
| Data/Numbers | Space Mono | Perfect tabular alignment |
| Body | IBM Plex Sans | Readable but distinctive |

Avoids: Inter, Roboto, Arial (overused "AI slop")

### Color Palette

```css
--bg-primary: #0a0e17;     /* Deep charcoal-navy */
--bg-surface: #121826;     /* Panel background */
--accent-amber: #f59e0b;   /* Primary accent (bullish) */
--accent-cyan: #06b6d4;    /* Secondary accent */
--bearish: #f43f5e;        /* Rose/magenta (not generic red) */
--text-primary: #e2e8f0;   /* Off-white */
--grid-color: #1e293b;     /* Subtle grid lines */
```

### Visual Effects

- Subtle grain/noise texture overlay
- Glowing accent borders on active elements
- Status indicator pulse animations
- Scanline background (5% opacity)
- Hover glow effects

### Layout

- Full-height chart (85vh)
- Top bar: market selector + timeframe tabs
- Side panel: order book (placeholder)
- Floating status indicators
- Information-dense but organized

## Tech Stack

- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Charts:** TradingView Lightweight Charts (free, open-source)
- **Database:** TimescaleDB in Docker
- **Data Source:** Mock trades (future: exchange API / on-chain)

## POC Success Criteria

- [ ] Chart loads and displays historical candles
- [ ] Timeframe switch works (1m, 5m, 15m, 1h, 4h, 1d)
- [ ] Last candle updates in real-time
- [ ] Market selector changes displayed data
- [ ] Connection status indicator works
- [ ] Docker Compose runs all services

## Future Considerations

- Extract API to separate Node/Express service
- Add real exchange API integration (Binance, Coinbase)
- On-chain event ingestion for DEX data
- Additional timeframes materialized views
- WebSocket reconnection logic
- Authentication for multi-user support
