'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType } from 'lightweight-charts';
import type { Resolution, ChartCandle } from '@/lib/types';

interface ChartProps {
  symbol: string;
  resolution: Resolution;
}

interface LoadedRange {
  from: number; // Unix timestamp in seconds
  to: number; // Unix timestamp in seconds
}

interface HistoryResponse {
  resolution: Resolution;
  candles: Array<{
    time: string;
    market: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
}

// Configuration constants
const CONFIG = {
  initialLoadDays: 30,        // Initial days to load (regardless of resolution)
  preloadChunk: 1000,         // Proactive preload chunk size in 1m candles
  preloadTrigger: 0.3,        // Trigger preload when 30% of data remaining
} as const;

export default function Chart({ symbol, resolution }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  // State management
  const [candles, setCandles] = useState<Map<number, ChartCandle>>(new Map());
  const [loadedRange, setLoadedRange] = useState<LoadedRange | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPreloading, setIsPreloading] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);

  const market = symbol.replace('/', '');

  // Helper: Floor timestamp to resolution
  const floorToResolution = useCallback((date: Date, res: Resolution): Date => {
    const d = new Date(date);
    d.setSeconds(0, 0);

    const minutes = parseInt(res);
    if (res === 'D') {
      d.setHours(0, 0, 0);
    } else {
      d.setMinutes(Math.floor(d.getMinutes() / minutes) * minutes);
    }

    return d;
  }, []);

  // Helper: Aggregate 1m candles to requested timeframe
  const aggregateCandles = useCallback((candles1m: ChartCandle[], res: Resolution): ChartCandle[] => {
    // If 1m resolution, just deduplicate
    if (res === '1') {
      const aggregated = new Map<number, ChartCandle>();

      for (const c of candles1m) {
        if (!aggregated.has(c.time)) {
          aggregated.set(c.time, { ...c });
        } else {
          const existing = aggregated.get(c.time)!;
          existing.high = Math.max(existing.high, c.high);
          existing.low = Math.min(existing.low, c.low);
          existing.close = c.close;
          existing.volume += c.volume;
        }
      }

      return Array.from(aggregated.values()).sort((a, b) => a.time - b.time);
    }

    // Aggregate to higher timeframe
    const buckets = new Map<number, ChartCandle>();

    for (const candle of candles1m) {
      const candleTime = new Date(candle.time * 1000);
      const bucketTime = floorToResolution(candleTime, res);
      const bucketTimestamp = Math.floor(bucketTime.getTime() / 1000);

      if (!buckets.has(bucketTimestamp)) {
        buckets.set(bucketTimestamp, {
          time: bucketTimestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        });
      } else {
        const b = buckets.get(bucketTimestamp)!;
        b.high = Math.max(b.high, candle.high);
        b.low = Math.min(b.low, candle.low);
        b.close = candle.close;
        b.volume += candle.volume;
      }
    }

    return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
  }, [floorToResolution]);

  // Helper: Convert PocketBase candle to ChartCandle
  const convertToChartCandle = useCallback((pbCandle: {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }): ChartCandle => {
    return {
      time: Math.floor(new Date(pbCandle.time).getTime() / 1000),
      open: pbCandle.open,
      high: pbCandle.high,
      low: pbCandle.low,
      close: pbCandle.close,
      volume: pbCandle.volume,
    };
  }, []);

  // Fetch historical candles from API
  const fetchHistory = useCallback(async (
    from: number,
    to: number,
    direction: 'forward' | 'backward' = 'forward',
    limit?: number
  ): Promise<ChartCandle[]> => {
    const params = new URLSearchParams({
      symbol,
      resolution: '1', // Always fetch 1m candles
      from: from.toString(),
      to: to.toString(),
      direction,
    });

    if (limit !== undefined) {
      params.append('limit', limit.toString());
    }

    const response = await fetch(`/api/history?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch history: ${response.statusText}`);
    }

    const data: HistoryResponse = await response.json();

    // Handle both old format (array) and new format
    const candlesArray = Array.isArray(data) ? data : data.candles;

    return candlesArray.map(convertToChartCandle);
  }, [symbol, convertToChartCandle]);

  // Load initial data
  const loadInitialData = useCallback(async () => {
    if (!seriesRef.current) return;

    setIsLoading(true);

    try {
      const now = Math.floor(Date.now() / 1000);
      const oneDayMs = 24 * 60 * 60 * 1000;

      // Calculate range for initial load - load N days of 1m candles
      const from = now - Math.floor((CONFIG.initialLoadDays * oneDayMs) / 1000);
      const to = now;

      // Calculate how many 1m candles we need
      const totalMinutes = CONFIG.initialLoadDays * 24 * 60;
      const candles1m = await fetchHistory(from, to, 'backward', totalMinutes);
      const aggregated = aggregateCandles(candles1m, resolution);

      // Update state
      const candlesMap = new Map<number, ChartCandle>();
      aggregated.forEach(c => candlesMap.set(c.time, c));
      setCandles(candlesMap);
      setLoadedRange({ from, to });

      // Update chart
      seriesRef.current.setData(aggregated as any);

      // Position chart to show recent data (right side with padding)
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }

      // Check if there's more history available
      setHasMoreHistory(candles1m.length >= totalMinutes);
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [resolution, fetchHistory, aggregateCandles]);

  // Load historical data (proactive preloading)
  const preloadHistoricalData = useCallback(async (rangeFrom: number) => {
    if (!seriesRef.current || isPreloading || !hasMoreHistory) return;

    setIsPreloading(true);

    try {
      // Fetch N minutes of historical data (1m candles)
      const from = rangeFrom - (CONFIG.preloadChunk * 60); // preloadChunk is in minutes
      const to = rangeFrom;

      const candles1m = await fetchHistory(from, to, 'backward', CONFIG.preloadChunk);
      const aggregated = aggregateCandles(candles1m, resolution);

      if (aggregated.length === 0) {
        setHasMoreHistory(false);
        return;
      }

      // Merge with existing candles
      setCandles(prev => {
        const newMap = new Map(prev);
        aggregated.forEach(c => newMap.set(c.time, c));
        return newMap;
      });

      setLoadedRange(prev => prev ? { ...prev, from } : null);

      // Update chart with all data
      const allCandles = Array.from(candles.values());
      seriesRef.current.setData(allCandles as any);

      setHasMoreHistory(candles1m.length >= CONFIG.preloadChunk);
    } catch (error) {
      console.error('Error preloading history:', error);
    } finally {
      setIsPreloading(false);
    }
  }, [candles, resolution, fetchHistory, aggregateCandles, isPreloading, hasMoreHistory]);

  // Setup realtime subscription
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const setupRealtime = async () => {
      try {
        const { default: PocketBase } = await import('pocketbase');
        const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090');

        // Subscribe to 1m candle updates
        pb.collection('candles_1m').subscribe('*', (e) => {
          if (e.action !== 'create' && e.action !== 'update') return;

          const record = e.record;
          if (record.market !== market) return;

          const chartCandle: ChartCandle = {
            time: Math.floor(new Date(record.time).getTime() / 1000),
            open: record.open,
            high: record.high,
            low: record.low,
            close: record.close,
            volume: record.volume,
          };

          // Update latest candle in cache
          setCandles(prev => {
            const newMap = new Map(prev);
            newMap.set(chartCandle.time, chartCandle);
            return newMap;
          });

          // Update chart series
          if (seriesRef.current) {
            seriesRef.current.update(chartCandle as any);
          }

          // Expand loaded range
          setLoadedRange(prev => {
            if (!prev) return null;
            return {
              ...prev,
              to: Math.max(prev.to, chartCandle.time),
            };
          });
        });

        // Cleanup on unmount
        return () => {
          pb.collection('candles_1m').unsubscribe('*');
          pb.authStore.clear();
        };
      } catch (error) {
        console.error('Error setting up realtime subscription:', error);
        return () => { };
      }
    };

    const cleanupPromise = setupRealtime();

    return () => {
      cleanupPromise.then(cleanup => cleanup());
    };
  }, [market]);

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
        secondsVisible: resolution === '1',
        rightOffset: 5,
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
  }, [resolution]);

  // Handle infinite scroll with proactive preloading
  useEffect(() => {
    if (!chartRef.current || !loadedRange) return;

    const handleVisibleRangeChange = (logicalRange: { from: number; to: number } | null) => {
      if (!logicalRange || !loadedRange) return;

      // Calculate distance from the start of the dataset (index 0)
      // logicalRange.from is the index of the leftmost visible bar
      const barsFromLeft = logicalRange.from;

      // Trigger preload when user is close to the left edge (e.g. within 50 bars)
      // This works for all resolutions since logical indices are bar-based
      if (barsFromLeft < 50 && hasMoreHistory && !isPreloading) {
        console.log('[Proactive] Preloading more historical data...');
        preloadHistoricalData(loadedRange.from);
      }
    };

    const timeScale = chartRef.current.timeScale();
    timeScale.subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);

    return () => {
      try {
        timeScale.unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
      } catch (e) {
        // Ignore if already unsubscribed
      }
    };
  }, [loadedRange, hasMoreHistory, isPreloading, preloadHistoricalData]);

  // Load initial data when chart is ready
  useEffect(() => {
    if (seriesRef.current && !loadedRange) {
      loadInitialData();
    }
  }, [seriesRef, loadedRange, loadInitialData]);

  // Reload data when resolution changes
  useEffect(() => {
    if (seriesRef.current && loadedRange) {
      loadInitialData();
    }
  }, [resolution]);

  return (
    <div className="relative w-full h-[85vh]">
      {(isLoading || isPreloading) && (
        <div className="absolute top-4 right-4 z-10 bg-gray-900/80 px-3 py-1 rounded text-xs text-gray-400">
          {isPreloading ? 'Preloading history...' : 'Loading...'}
        </div>
      )}
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}
