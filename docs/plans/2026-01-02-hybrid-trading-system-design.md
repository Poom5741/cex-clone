# Hybrid Trading System Design

**Date:** 2026-01-02
**Status:** Design Approved
**Branch:** pocketbase

## Overview

Hybrid approach: Start with chart-only display layer using direct PocketBase realtime subscriptions, then incrementally add trading features from senior's design.

## Phase 1: Chart Display (Current - Complete)

**What it does:**
- Display historical candle charts
- Realtime updates via direct PocketBase subscriptions
- Multiple timeframes and markets

**Architecture (Phase 1):**
```
Frontend (Next.js)
    ├── REST API → /api/history → PocketBase (historical data)
    └── Realtime → PocketBase directly (live updates)
```

**Collections:**
- `trades` - individual trades for audit
- `candles_1m` - 1-minute candles (aggregated via hooks)

## Phase 2: Realtime Direct Connection (Current Task)

**Change from original plan:**
- ~~Frontend → Next.js API → PocketBase~~
- **Frontend → PocketBase directly** for realtime subscriptions

**Why direct connection:**
- Lower latency (no API layer in between)
- Simpler architecture
- PocketBase SDK handles auth/reconnection
- Matches senior's design pattern

**Implementation:**
```typescript
// In Chart component
import PocketBase from 'pocketbase';

const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL);

// Subscribe to candle updates
pb.collection('candles_1m').subscribe('*', (e) => {
  if (e.record.market === symbol) {
    seriesRef.current?.update({
      time: Math.floor(new Date(e.record.time).getTime() / 1000),
      open: e.record.open,
      high: e.record.high,
      low: e.record.low,
      close: e.record.close,
    });
  }
});
```

**Environment variable:**
```env
# .env.local (browser-accessible)
NEXT_PUBLIC_POCKETBASE_URL=http://localhost:8090
```

## Phase 3: Senior's Features (Future Incremental Additions)

After chart + realtime works, add these features one by one:

### 3.1 Ticker Collection
```
ticker_24h collection:
- id, token_pair, last_price
- high_24h, low_24h, volume_24h
- price_change_24h, price_change_percent_24h
```

### 3.2 Recent Trades Display
- Subscribe to `trades` collection realtime
- Show last 20 trades in sidebar

### 3.3 Order Form UI
- Buy/Sell buttons
- Price and amount inputs
- Place order → calls match engine

### 3.4 Match Engine
- Client-side order matching (for POC)
- Or separate service (production)

### 3.5 Order Book (Optional)
- Display pending orders
- Depth chart visualization

## Updated Collections Schema

### trades (existing)
```json
{
  "market": "text",
  "price": "number",
  "size": "number",
  "side": "select (buy|sell)",
  "timestamp": "date",
  "tx_hash": "text (optional)",
  "log_index": "number (optional)"
}
```

### candles_1m (existing)
```json
{
  "market": "text",
  "time": "date",
  "open": "number",
  "high": "number",
  "low": "number",
  "close": "number",
  "volume": "number"
}
```

### ticker_24h (to add)
```json
{
  "token_pair": "text (unique)",
  "last_price": "number",
  "high_24h": "number",
  "low_24h": "number",
  "volume_24h": "number",
  "price_change_24h": "number",
  "price_change_percent_24h": "number"
}
```

### orders (to add - if needed)
```json
{
  "token_pair": "text",
  "side": "select (buy|sell)",
  "price": "number",
  "amount": "number",
  "user_id": "text",
  "status": "select (open|filled|cancelled)",
  "filled_amount": "number",
  "timestamp": "date"
}
```

## Security Considerations

**Direct client-side PocketBase connection:**
- Collections must have appropriate API rules
- For development: Public access (`""`) is fine
- For production: Use authenticated users or API tokens

**Option A: Public access (POC)**
```json
{
  "listRule": "",
  "viewRule": "",
  "createRule": "",
  "updateRule": null,
  "deleteRule": null
}
```

**Option B: Authenticated (Production)**
```json
{
  "listRule": "@request.auth.id != \"\"",
  "viewRule": "@request.auth.id != \"\"",
  "createRule": "@request.auth.id != \"\""
}
```

## Implementation Order

### Immediate (Complete current tasks):
- [x] Tasks 1-11: PocketBase migration
- [ ] Task 12: Finish build & start services
- [ ] **Task 13 (Modified): Direct realtime subscriptions**

### Next (Phase 3 features):
- [ ] Add ticker_24h collection + hook
- [ ] Add recent trades sidebar
- [ ] Add order form UI
- [ ] Add match engine integration

## Success Criteria

**Phase 1 + 2 (Current Sprint):**
- [ ] Chart loads historical data
- [ ] Chart updates in realtime via direct PB subscription
- [ ] Status bar shows connected
- [ ] Timeframe switching works
- [ ] Market switching works

**Phase 3 (Future):**
- [ ] Ticker displays 24h stats
- [ ] Recent trades stream live
- [ ] Order form places orders
- [ ] Match engine processes orders
