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
