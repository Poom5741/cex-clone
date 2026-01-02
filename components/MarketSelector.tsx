'use client';

import { useState } from 'react';

const MARKETS = ['ETH/USDC', 'BTC/USDC', 'SOL/USDC'];

interface MarketSelectorProps {
  value: string;
  onChange: (market: string) => void;
}

export default function MarketSelector({ value, onChange }: MarketSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-surface border border-amber/30 hover:border-amber rounded transition-all hover:glow-amber"
      >
        <span className="font-mono text-sm text-secondary">MARKET</span>
        <span className="font-mono text-sm text-amber font-semibold">{value}</span>
        <span className={`text-amber transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          ></div>
          <div className="absolute top-full left-0 mt-2 z-20 bg-surface border border-amber/30 rounded overflow-hidden shadow-2xl">
            {MARKETS.map((market) => (
              <button
                key={market}
                onClick={() => {
                  onChange(market);
                  setIsOpen(false);
                }}
                className={`block w-full px-4 py-2 text-left font-mono text-sm transition-colors ${
                  value === market
                    ? 'bg-amber/20 text-amber'
                    : 'text-primary hover:bg-amber/10 hover:text-amber'
                }`}
              >
                {market}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
