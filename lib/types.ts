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
  time: number; // Unix timestamp in seconds (UTCTimestamp for Lightweight Charts)
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
