'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType, Time } from 'lightweight-charts';
import type { Candle, Resolution } from '@/lib/types';

interface ChartProps {
  symbol: string;
  resolution: Resolution;
}

export default function Chart({ symbol, resolution }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
        secondsVisible: false,
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
  }, []);

  // Load data when symbol or resolution changes
  useEffect(() => {
    const loadData = async () => {
      if (!seriesRef.current) return;

      setIsLoading(true);

      try {
        const to = Math.floor(Date.now() / 1000);
        const from = to - 7 * 24 * 60 * 60; // 7 days ago

        const market = symbol.replace('/', '');
        const params = new URLSearchParams({
          symbol: market,
          resolution,
          from: from.toString(),
          to: to.toString(),
        });

        const response = await fetch(`/api/history?${params}`);
        if (!response.ok) throw new Error('Failed to fetch data');

        const data: Candle[] = await response.json();

        seriesRef.current.setData(data);
        chartRef.current?.timeScale().fitContent();
      } catch (error) {
        console.error('Error loading chart data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [symbol, resolution]);

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
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}
