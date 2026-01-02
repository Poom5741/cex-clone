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
