'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType, Time } from 'lightweight-charts';
import PocketBase from 'pocketbase';
import type { Candle, ChartCandle, Resolution } from '@/lib/types';

// Resolution-specific initial load and chunk sizes
const RESOLUTION_CONFIG: Record<Resolution, { initialDays: number; chunkDays: number }> = {
  '1': { initialDays: 3, chunkDays: 1 },
  '5': { initialDays: 7, chunkDays: 3 },
  '15': { initialDays: 14, chunkDays: 7 },
  '60': { initialDays: 14, chunkDays: 7 },
  '240': { initialDays: 30, chunkDays: 30 },
  'D': { initialDays: 30, chunkDays: 30 },
};

interface ChartProps {
  symbol: string;
  resolution: Resolution;
}

export default function Chart({ symbol, resolution }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const pbRef = useRef<PocketBase | null>(null);

  // Infinite scroll state
  const [allCandles, setAllCandles] = useState<Map<number, ChartCandle>>(new Map());
  const [oldestLoadedTime, setOldestLoadedTime] = useState<number | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  // Track whether we've already loaded initial data
  const hasLoadedRef = useRef(false);

  // Calculate initial time range based on resolution
  const getTimeRange = useCallback((daysBack: number, endTime?: number) => {
    const to = endTime || Math.floor(Date.now() / 1000);
    const from = to - daysBack * 24 * 60 * 60;
    return { from, to };
  }, []);

  // Load candles from API
  const loadCandles = useCallback(async (
    from: number,
    to: number,
    direction: 'forward' | 'backward' = 'forward',
    limit?: number
  ): Promise<ChartCandle[]> => {
    const market = symbol.replace('/', '');
    const params = new URLSearchParams({
      symbol: market,
      resolution,
      from: from.toString(),
      to: to.toString(),
      direction,
    });

    if (limit) {
      params.append('limit', limit.toString());
    }

    const response = await fetch(`/api/history?${params}`);
    if (!response.ok) throw new Error('Failed to fetch data');

    return response.json();
  }, [symbol, resolution]);

  // Load more history when scrolling near left edge
  const loadMoreHistory = useCallback(async () => {
    if (isLoadingMore || !hasMoreHistory || !oldestLoadedTime) return;

    setIsLoadingMore(true);

    try {
      const config = RESOLUTION_CONFIG[resolution];
      const chunkSeconds = config.chunkDays * 24 * 60 * 60;

      // Fetch range before the oldest loaded candle
      const from = oldestLoadedTime - chunkSeconds;
      const to = oldestLoadedTime;

      const newCandles = await loadCandles(from, to, 'backward');

      if (newCandles.length === 0) {
        setHasMoreHistory(false);
      } else {
        // Merge new candles with existing ones
        setAllCandles(prev => {
          const updated = new Map(prev);
          for (const candle of newCandles) {
            updated.set(candle.time, candle);
          }
          return updated;
        });

        // Update oldest loaded time
        const newOldestTime = Math.min(...newCandles.map(c => c.time));
        setOldestLoadedTime(newOldestTime);

        // Update chart with prepended data
        if (seriesRef.current) {
          // Deduplicate by timestamp before creating chart data
          const uniqueCandles = new Map<number, ChartCandle>();
          for (const c of allCandles.values()) {
            const existing = uniqueCandles.get(c.time);

            if (!existing) {
              uniqueCandles.set(c.time, c);
            } else {
              existing.high = Math.max(existing.high, c.high);
              existing.low = Math.min(existing.low, c.low);
              existing.close = c.close;
              existing.volume = (existing.volume || 0) + (c.volume || 0);
            }
          }

          const chartData = Array.from(uniqueCandles.values())
            .map(c => ({
              time: c.time as Time,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            }))
            .sort((a, b) => (a.time as number) - (b.time as number));

          seriesRef.current.setData(chartData);
        }
      }
    } catch (error) {
      console.error('Error loading more history:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMoreHistory, oldestLoadedTime, resolution, loadCandles, allCandles]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current || hasLoadedRef.current) return;

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
    hasLoadedRef.current = true;

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
      hasLoadedRef.current = false;
    };
  }, [resolution]);

  // Subscribe to visible range changes for infinite scroll
  useEffect(() => {
    if (!chartRef.current) return;

    const timeScale = chartRef.current.timeScale();

    const handleVisibleRangeChange = () => {
      if (!oldestLoadedTime || isLoadingMore || !hasMoreHistory) return;

      const visibleRange = timeScale.getVisibleRange();
      if (!visibleRange) return;

      // Convert Time to number for arithmetic (Time can be number | string | BusinessDay)
      const toNumber = (t: Time): number => {
        if (typeof t === 'number') return t;
        if (typeof t === 'string') return parseInt(t);
        // BusinessDay format - convert to timestamp (simplified: not used in our implementation)
        return 0;
      };

      const fromTime = toNumber(visibleRange.from);
      const toTime = toNumber(visibleRange.to);

      if (!fromTime || !toTime) return;

      // Trigger load more if near left edge (within 5% of visible range)
      const rangeSize = toTime - fromTime;
      const threshold = fromTime + (rangeSize * 0.05);

      if (oldestLoadedTime >= threshold) {
        loadMoreHistory();
      }
    };

    timeScale.subscribeVisibleTimeRangeChange(handleVisibleRangeChange);

    return () => {
      timeScale.unsubscribeVisibleTimeRangeChange(handleVisibleRangeChange);
    };
  }, [oldestLoadedTime, isLoadingMore, hasMoreHistory, loadMoreHistory]);

  // Load initial data when symbol or resolution changes
  useEffect(() => {
    const loadData = async () => {
      if (!seriesRef.current) return;

      setIsLoading(true);
      setAllCandles(new Map());
      setOldestLoadedTime(null);
      setHasMoreHistory(true);
      hasLoadedRef.current = false;

      try {
        const config = RESOLUTION_CONFIG[resolution];
        const { from, to } = getTimeRange(config.initialDays);

        const data = await loadCandles(from, to, 'forward');

        // Store candles and set oldest loaded time
        const candleMap = new Map<number, ChartCandle>();
        let minTime = Infinity;

        for (const candle of data) {
          candleMap.set(candle.time, candle);
          if (candle.time < minTime) {
            minTime = candle.time;
          }
        }

        setAllCandles(candleMap);
        setOldestLoadedTime(data.length > 0 ? minTime : null);
        setHasMoreHistory(data.length > 0);

        // Convert to chart format (UTC timestamps) and deduplicate
        // Use a Map to handle duplicate timestamps (hook creates duplicates in DB)
        const uniqueCandles = new Map<number, ChartCandle>();

        for (const candle of data) {
          const existing = uniqueCandles.get(candle.time);

          if (!existing) {
            uniqueCandles.set(candle.time, candle);
          } else {
            // Aggregate: take the first open, last close, and max/min high/low
            existing.high = Math.max(existing.high, candle.high);
            existing.low = Math.min(existing.low, candle.low);
            existing.close = candle.close;
            existing.volume = (existing.volume || 0) + (candle.volume || 0);
          }
        }

        const chartData = Array.from(uniqueCandles.values()).map(candle => ({
          time: candle.time as Time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        })).sort((a, b) => (a.time as number) - (b.time as number));

        seriesRef.current.setData(chartData);
        chartRef.current?.timeScale().fitContent();
      } catch (error) {
        console.error('Error loading chart data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [symbol, resolution, getTimeRange, loadCandles]);

  // PocketBase realtime subscription for live candle updates
  useEffect(() => {
    const market = symbol.replace('/', '');
    setRealtimeStatus('connecting');

    try {
      // Create new PB instance
      const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090');
      // Clear stale auth to avoid log noise (public endpoints don't need auth)
      pb.authStore.clear();
      pbRef.current = pb;

      // Subscribe to candle updates
      const unsubscribe = pb.collection('candles_1m').subscribe('*', (e) => {
        const record = e.record as Candle;

        // Null check
        if (!record || record.market !== market) return;

        // Convert Candle (time: string) to ChartCandle (time: number)
        const timestamp = Math.floor(new Date(record.time).getTime() / 1000);
        const chartCandle: ChartCandle = {
          time: timestamp,
          open: record.open,
          high: record.high,
          low: record.low,
          close: record.close,
          volume: record.volume,
        };

        // Update the chart with new candle data
        seriesRef.current?.update({
          time: timestamp as Time,
          open: record.open,
          high: record.high,
          low: record.low,
          close: record.close,
        });

        // Also update our local cache (convert to ChartCandle format)
        setAllCandles(prev => {
          const updated = new Map(prev);
          updated.set(timestamp, chartCandle);
          return updated;
        });

        setRealtimeStatus('connected');
      });

      setRealtimeStatus('connected');

      // Cleanup
      return () => {
        unsubscribe.then(fn => fn()).catch(err => {
          console.error('Unsubscribe error:', err);
        });
        pbRef.current = null;
        setRealtimeStatus('disconnected');
      };
    } catch (error) {
      console.error('Realtime subscription error:', error);
      setRealtimeStatus('disconnected');
    }
  }, [symbol]);

  return (
    <div className="relative w-full h-[85vh]">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/80 z-10">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-amber/30 border-t-amber rounded-full animate-spin"></div>
            <span className="font-mono text-sm text-amber animate-pulse">LOADING DATA...</span>
          </div>
        </div>
      )}
      {isLoadingMore && (
        <div className="absolute top-4 left-4 z-10">
          <div className="flex items-center gap-2 bg-surface/80 px-3 py-1.5 rounded border border-cyan/30">
            <div className="w-3 h-3 border-2 border-cyan/30 border-t-cyan rounded-full animate-spin"></div>
            <span className="font-mono text-xs text-cyan">LOADING MORE...</span>
          </div>
        </div>
      )}
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}
