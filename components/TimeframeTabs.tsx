'use client';

import { type Resolution } from '@/lib/types';

const TIMEFRAMES: { value: Resolution; label: string }[] = [
  { value: '1', label: '1m' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '60', label: '1H' },
  { value: '240', label: '4H' },
  { value: 'D', label: '1D' },
];

interface TimeframeTabsProps {
  value: Resolution;
  onChange: (resolution: Resolution) => void;
}

export default function TimeframeTabs({ value, onChange }: TimeframeTabsProps) {
  return (
    <div className="flex items-center gap-1 bg-surface border border-cyan/30 rounded p-1">
      <span className="px-2 font-mono text-xs text-secondary">TF</span>
      {TIMEFRAMES.map(({ value: tf, label }) => (
        <button
          key={tf}
          onClick={() => onChange(tf)}
          className={`px-3 py-1 font-mono text-sm rounded transition-all ${
            value === tf
              ? 'bg-cyan/20 text-cyan font-semibold'
              : 'text-primary hover:bg-cyan/10 hover:text-cyan'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
