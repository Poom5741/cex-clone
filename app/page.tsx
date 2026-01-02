'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import StatusBar from '@/components/StatusBar';
import MarketSelector from '@/components/MarketSelector';
import TimeframeTabs from '@/components/TimeframeTabs';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import type { Resolution } from '@/lib/types';

const Chart = dynamic(() => import('@/components/Chart'), {
  loading: () => <LoadingSkeleton />,
  ssr: false,
});

export default function HomePage() {
  const [market, setMarket] = useState('ETH/USDC');
  const [resolution, setResolution] = useState<Resolution>('5');

  const handleMarketChange = (newMarket: string) => {
    setMarket(newMarket);
  };

  const handleResolutionChange = (newResolution: Resolution) => {
    setResolution(newResolution);
  };

  return (
    <div className="min-h-screen bg-primary">
      {/* Header */}
      <header className="border-b border-grid">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <h1 className="font-mono text-xl font-bold text-amber text-glow">
              TRADING_TERMINAL
            </h1>
            <MarketSelector value={market} onChange={handleMarketChange} />
          </div>
          <TimeframeTabs value={resolution} onChange={handleResolutionChange} />
        </div>
        <StatusBar market={market} />
      </header>

      {/* Chart */}
      <main>
        <Chart symbol={market} resolution={resolution} />
      </main>
    </div>
  );
}
