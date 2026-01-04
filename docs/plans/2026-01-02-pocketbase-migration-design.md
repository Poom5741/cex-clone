# PocketBase Migration Design

**Date:** 2026-01-02
**Status:** Design Approved
**Branch:** pocketbase

## Overview

Migrate from TimescaleDB (PostgreSQL) to PocketBase for the trading chart POC. Primary motivation is leveraging PocketBase's built-in realtime subscriptions instead of manual WebSocket implementation. Future-proof design for multi-quote trading platform with on-chain traceability.

## Scope & Boundaries

**What This System Does:**
- Store historical trade data for chart display
- Aggregate trades into OHLCV candles (1m base + on-demand higher timeframes)
- Serve chart data to frontend via REST API
- Push real-time candle updates via PocketBase subscriptions
- Display charts using TradingView Lightweight Charts

**What This System Does NOT Do:**
- ❌ Execute trades (trades happen on-chain via DEX/order book)
- ❌ Ingest blockchain data (separate indexer service writes to PocketBase)
- ❌ Manage order book (on-chain order book is source of truth)
- ❌ Handle user trading operations (PocketBase is read-layer only for charts)

**Data Flow:**
```
Blockchain (on-chain DEX) 
    ↓
[Separate Indexer Service] ← Outside scope of this plan
    ↓
PocketBase (chart data storage)
    ↓
Next.js API + Realtime
    ↓
Frontend (TradingView Charts)
```

**Note for AI Assistants:**
- The "mock trades generator" simulates the indexer service for POC testing
- In production, a separate blockchain indexer will write trades to PocketBase
- This design focuses solely on the chart data layer, not trade execution
- PocketBase handles controlled writes from indexer (not concurrent user traffic)

## Approach: Store-All-Trades + Base-Timeframe-Only

Store every individual trade for on-chain traceability, but only store 1m candles as base. Aggregate other timeframes on-demand in the backend.

**Rationale:**
- On-chain traceability is non-negotiable (tx_hash, log_index must be preserved)
- PocketBase hooks can handle aggregation efficiently
- Storage is cheap, audit capability is expensive
- Simplest consistency model: one source of truth (trades), everything derived

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  Mock Trades    │────▶│  PocketBase  │────▶│  Frontend   │
│  Generator      │     │  (SQLite)    │     │  (Next.js)  │
└─────────────────┘     └──────────────┘     └─────────────┘
                              │
                              ▼
                       Realtime Subscriptions
                       (automatic on change)
```

**Key Changes:**
- Remove TimescaleDB container and `pg` dependency
- Add PocketBase as separate service (Docker or local binary)
- Replace SQL queries with PocketBase SDK calls
- Use PocketBase Realtime API for live candle updates
- Keep existing TradingView Lightweight Charts frontend unchanged

**Data Flow:**
1. Mock trades → Insert into PocketBase `trades` collection
2. PocketBase hook triggers on trade insert → Updates `candles_1m` collection
3. Frontend subscribes via PocketBase Realtime → Receives candle updates
4. Frontend requests historical data → PocketBase queries + on-demand aggregation for higher timeframes

## PocketBase Schema

### trades Collection

Store every individual trade for on-chain traceability.

```
- id: string (auto-generated UUID)
- market: text (required, indexed)
- price: number (required)
- size: number (required)
- side: select (buy|sell, required)
- timestamp: date (required, indexed)
- tx_hash: text (optional)
- log_index: number (optional)
- created: date (auto)
- updated: date (auto)
```

**Indexes:** `market`, `timestamp` for fast time-series queries.

### candles_1m Collection

Aggregated 1-minute OHLCV candles. Regular collection updated via hooks (PocketBase doesn't have materialized views).

```
- id: string (auto-generated)
- time: date (required, indexed)
- market: text (required, indexed)
- open: number (required)
- high: number (required)
- low: number (required)
- close: number (required)
- volume: number (required)
- created: date (auto)
- updated: date (auto)
```

**Unique constraint:** `(market, time)` to prevent duplicates.

### markets Collection (Optional)

Static market configuration for base prices and volatility.

```
- id: string (auto)
- symbol: text (unique, required) - e.g., "ETHUSDC"
- base_price: number (required)
- volatility: number (required)
- active: bool (default: true)
```

## Realtime Updates

PocketBase's Realtime API automatically pushes updates when collections change. No manual WebSocket server needed.

**Subscription Flow:**

1. Client opens WebSocket to `ws://localhost:8090/api/realtim`
2. Client subscribes to `candles_1m` with filter `market = "ETHUSDC"`
3. Trade inserted → Hook updates candle
4. PocketBase auto-pushes updated candle to all subscribers
5. Chart updates via TradingView Lightweight Charts API

**Hook Logic (Pseudo-code):**

```javascript
// Hook runs on trade creation
onRecordAfterCreateRequest((e) => {
  const trade = e.record;
  const minuteBucket = floorToMinute(trade.timestamp);

  // Find or create candle for this minute
  const candle = findOne("candles_1m", {
    market: trade.market,
    time: minuteBucket
  });

  if (candle) {
    // Update existing
    candle.high = max(candle.high, trade.price);
    candle.low = min(candle.low, trade.price);
    candle.close = trade.price;
    candle.volume += trade.size;
    candle.save();
  } else {
    // Create new
    create("candles_1m", {
      time: minuteBucket,
      market: trade.market,
      open: trade.price,
      high: trade.price,
      low: trade.price,
      close: trade.price,
      volume: trade.size
    });
  }
}, "trades")
```

## API Layer

Next.js API routes use PocketBase SDK instead of SQL.

### History Endpoint (`/api/history`)

**1m candles:** Direct query to `candles_1m` collection
- Filter: `market = "ETHUSDC" && time >= from && time <= to`
- Sort: `time asc`
- Return formatted OHLCV array

**5m, 15m, 1h, 4h, 1d candles:** On-demand aggregation from 1m candles
- Query 1m candles for expanded time range
- Aggregate in JavaScript
- Return calculated OHLCV

**Aggregation Logic (5m from 1m):**

```javascript
const buckets = new Map();

oneMinuteCandles.forEach(candle => {
  const bucketTime = floorToResolution(candle.time, 5);

  if (!buckets.has(bucketTime)) {
    buckets.set(bucketTime, {
      time: bucketTime,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume
    });
  } else {
    const b = buckets.get(bucketTime);
    b.high = Math.max(b.high, candle.high);
    b.low = Math.min(b.low, candle.low);
    b.close = candle.close;
    b.volume += candle.volume;
  }
});

return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
```

### Trade Insert

Mock data generator uses PocketBase SDK directly:

```javascript
pb.collection('trades').create({
  market: "ETHUSDC",
  price: "3500.00",
  size: "1.5",
  side: "buy",
  timestamp: new Date().toISOString()
});
// Hook automatically updates candles and pushes to subscribers
```

## Error Handling

**Connection Management:**
- PocketBase health endpoint: `/api/health`
- Frontend polls health every 5 seconds for status indicator
- PocketBase SDK handles automatic reconnection for realtime
- Fallback: Show cached data or "reconnecting" state

**Data Consistency:**
- Hook uses idempotent upsert logic
- Find existing candle by `(market, time)`, update or create
- PocketBase retries failed hooks automatically

**Edge Cases:**
- **First trade of minute:** Creates new candle with open=high=low=close=price
- **Gap in data:** TradingView Lightweight Charts handles gaps gracefully
- **Clock drift:** Use UTC timestamps consistently, store as ISO 8601
- **Backfilling:** Bulk import script batches inserts, hooks build candles

**Empty States:**
- No candles for market: Return empty array, chart shows "No data"
- Empty time range (from > to): Return 400 error
- Invalid market: Return 404 or empty array with market list

## Migration Strategy

**Data Export (TimescaleDB → JSON):**

1. Query all trades from `trades` table
2. Export as JSON array with ISO timestamps
3. Split into batches (1000 records per file)

**Data Import (JSON → PocketBase):**

1. Use PocketBase batch import API or SDK
2. Insert trades in batches (100-500 per batch)
3. Hook fires automatically to rebuild candles_1m

**Verification:**

1. Compare record counts
2. Spot-check specific timestamps/markets
3. Verify OHLCV calculations match original

**Zero-Downtime Approach (optional):**

1. Run PocketBase in parallel with TimescaleDB
2. Migrate historical data
3. Switch frontend config to use PocketBase
4. Keep TimescaleDB as backup for rollback period
5. Decommission after verification

## Deployment Structure

**Docker Compose:**

```yaml
services:
  pocketbase:
    image: ghcr.io/muchobien/pocketbase:latest
    container_name: trading_pocketbase
    ports:
      - "8090:8090"
    volumes:
      - pocketbase_data:/pb_data
      - ./pocketbase/hooks:/pb_hooks
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8090/api/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  # (remove timescaledb and pgadmin)

volumes:
  pocketbase_data:
```

**Environment Variables:**

```env
# Replace TIMESCALEDB_* with:
POCKETBASE_URL=http://localhost:8090
```

**Dependencies:**

```json
{
  "dependencies": {
    "pocketbase": "^0.21.0"
    // remove "pg": "^8.11.3"
  }
}
```

## Implementation Checklist

**Phase 1: Setup**
- [ ] Download PocketBase binary or add to Docker Compose
- [ ] Create collections via Admin UI (trades, candles_1m, markets)
- [ ] Configure hooks for candle aggregation
- [ ] Update environment variables

**Phase 2: Data Layer**
- [ ] Replace lib/db.ts with PocketBase SDK
- [ ] Implement aggregation logic for timeframes (5m, 15m, 1h, 4h, 1d)
- [ ] Update API routes to use PocketBase
- [ ] Migrate existing data from TimescaleDB

**Phase 3: Frontend**
- [ ] Update realtime subscription to use PocketBase
- [ ] Remove custom WebSocket code (if any)
- [ ] Update connection status checks
- [ ] Test chart with live data

**Phase 4: Cleanup**
- [ ] Remove TimescaleDB from docker-compose
- [ ] Remove pg dependency from package.json
- [ ] Update documentation
- [ ] Commit and test on pocketbase branch

## Testing

**Unit Tests:**
- Candle aggregation logic (1m → 5m, 1m → 1h)
- Timestamp bucket calculations
- Hook behavior (first trade vs existing candle)

**Integration Tests:**
- Trade insert → Hook trigger → Candle update → Realtime push
- Historical query for all timeframes
- Connection failure and reconnection

**Manual Verification:**
- Compare chart output from old vs new system side-by-side
- Verify realtime updates arrive within 100ms
- Test multiple markets simultaneously
- Verify timestamp handling across day boundaries

## Tech Stack

- **Backend:** PocketBase 0.21+ (SQLite database)
- **Frontend:** Next.js 15, TypeScript, Tailwind CSS
- **Charts:** TradingView Lightweight Charts
- **Realtime:** PocketBase built-in WebSocket
- **Infrastructure:** Docker Compose (single service)

## Success Criteria

- [ ] Chart loads and displays historical candles
- [ ] Timeframe switch works (1m, 5m, 15m, 1H, 4H, 1D)
- [ ] Last candle updates in real-time via PocketBase subscriptions
- [ ] Market selector changes displayed data
- [ ] Connection status indicator works with PocketBase health
- [ ] Historical data migrated successfully from TimescaleDB
- [ ] Single Docker service runs all backend needs

## Future Considerations

- Add authentication via PocketBase built-in user system
- Use PocketBase file storage for exported historical data
- Leverage PocketBase admin UI for data inspection
- Add additional hooks for trade validation
- Implement backup/restore strategy for SQLite data
- Consider PocketBase extensions for custom aggregations
