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
