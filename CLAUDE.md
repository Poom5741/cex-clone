# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Init Command

**Run this when first working on this project:**

```bash
# 0. Install dependencies
npm install

# 1. Configure environment (if .env doesn't exist)
cp .env.example .env
# Edit .env with your PocketBase admin credentials

# 2. Start PocketBase (in a separate terminal)
cd pocketbase && ./pocketbase serve

# 3. Create admin user at http://localhost:8090/_/
# Use the same credentials from your .env file

# 4. Seed database (in another terminal)
npm run seed

# 5. Start Next.js dev server (in another terminal)
npm run dev

# 6. Open http://localhost:3000
```

**Environment Variables Required (.env):**
```env
POCKETBASE_URL=http://localhost:8090
POCKETBASE_ADMIN_EMAIL=your@email.com
POCKETBASE_ADMIN_PASSWORD=your_password
NEXT_PUBLIC_POCKETBASE_URL=http://localhost:8090
```

## Common Commands

```bash
# Development
npm run dev          # Start Next.js dev server (http://localhost:3000)
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint

# Database Operations
npm run seed         # Generate 7 days of historical candles + start live mock trades
npm run mock-trades  # Start generating live mock trades only

# PocketBase (run from pocketbase/ directory)
./pocketbase serve   # Start PocketBase server on http://localhost:8090
```

## Service Execution Rule

**DO NOT run any background services, daemons, or long-running processes by yourself.**

When you need to start PocketBase, run seed scripts, or execute mock data generators, **provide clear instructions to the user** instead of running them directly.

## Architecture

This is a **DEX-first cryptocurrency charting POC**. The key architectural principle: **on-chain smart contracts are the source of truth; PocketBase is merely a read-layer for charts**.

### Data Flow

```
┌─────────────────────────┐
│  Blockchain (DEX)        │  ← Source of truth (outside current scope)
│  - On-chain order book  │
│  - Trade execution      │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Blockchain Indexer     │  ← Separate service (not yet implemented)
│  - Reads chain events   │
│  - Writes to PocketBase │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  PocketBase (SQLite)    │
│  - trades collection    │  ← Every trade stored for traceability
│  - candles_1m collection │  ← Aggregated by Go hook
└───────────┬─────────────┘
            │
    ┌───────┴────────┐
    ▼                 ▼
┌─────────┐     ┌──────────────┐
│ REST API │     │  Realtime    │
│ /history │     │  Subscriptions│
└─────┬───┘     └──────┬───────┘
      │                │
      └────────┬───────┘
               ▼
      ┌─────────────────┐
      │  Frontend       │
      │  - TradingView  │
      │    Charts      │
      └─────────────────┘
```

**For POC testing**, the `mock-trades` script simulates the blockchain indexer.

### PocketBase Hook System

The `candles_1m` collection is maintained by a **Go hook** that runs on every trade insert:

- **File:** `pocketbase/hooks/candle_aggregation.go`
- **Trigger:** `OnRecordAfterCreateSuccess("trades")`
- **Logic:** Finds or creates a 1-minute candle, updates OHLCV
- **Known Issue:** Hook has race condition handling but currently creates duplicates (workaround: deduplication in `getCandles()`)

### Schema

**trades collection:**
- `market` (indexed) + `timestamp` (indexed) → composite index for fast queries
- `price`, `size`, `side` → trade data
- `tx_hash`, `log_index` → for on-chain traceability (future)

**candles_1m collection:**
- Unique constraint on (`market`, `time`)
- Stores 1-minute OHLCV candles
- Higher timeframes (5m, 15m, 1H, 4H, 1D) are **aggregated on-demand** in `lib/pocketbase.ts`

### Key Files

| File | Purpose |
|------|---------|
| `lib/pocketbase.ts` | PocketBase client, `getCandles()` with multi-timeframe aggregation, `insertTrade()` |
| `pocketbase/hooks/candle_aggregation.go` | Go hook that aggregates trades into 1m candles |
| `pocketbase/migrations/001_initial_schema.go` | Creates collections and indexes |
| `components/Chart.tsx` | TradingView Lightweight Charts wrapper + realtime subscription |
| `scripts/seed.ts` | Generates N days of historical data (configured in script) |
| `scripts/mock-trades.ts` | Generates live mock trades every 2 seconds |
| `app/api/history/route.ts` | REST endpoint for historical candle data |

### Important Constraints

1. **Public endpoints** - PocketBase collections have empty rules (public access) for development
2. **Admin auth required** - Server-side operations (seed script) use admin authentication via `authenticateAsAdmin()`
3. **Single writer limitation** - SQLite single-writer means concurrent writes are limited; hook handles this with retry logic
4. **Auth token noise** - Frontend uses `pb.authStore.clear()` to avoid stale auth log spam

### Known Issues

1. **Hook creates duplicate candles** - The Go hook's upsert logic has issues. Workaround: `getCandles()` aggregates duplicates client-side before returning.
2. **Time boundary filtering** - Multi-timeframe queries must expand range by ±1 resolution to capture boundary candles, then filter properly using overlap logic (`c.time < to && c.time + resolution > from`).
