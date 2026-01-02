'use client';

import { useEffect, useState } from 'react';

interface StatusBarProps {
  market: string;
}

export default function StatusBar({ market }: StatusBarProps) {
  const [dbStatus, setDbStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');

  useEffect(() => {
    const checkConnection = async () => {
      setDbStatus('connecting');
      try {
        const response = await fetch('/api/health');
        const { connected } = await response.json();
        setDbStatus(connected ? 'connected' : 'disconnected');
      } catch {
        setDbStatus('disconnected');
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, []);

  const statusColor = {
    connected: 'text-amber',
    disconnected: 'text-rose',
    connecting: 'text-cyan',
  }[dbStatus];

  return (
    <div className="flex items-center gap-6 px-4 py-2 bg-surface border-b border-grid">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm text-secondary">MARKET:</span>
        <span className="font-mono text-sm text-primary font-semibold">{market}</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-mono text-sm text-secondary">DATABASE:</span>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusColor} ${
            dbStatus === 'connected' ? 'animate-pulse' : ''
          }`}></span>
          <span className={`font-mono text-sm ${statusColor} uppercase`}>{dbStatus}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-mono text-sm text-secondary">STATUS:</span>
        <span className="font-mono text-sm text-cyan uppercase">Live</span>
      </div>

      <div className="ml-auto font-mono text-xs text-secondary">
        {new Date().toLocaleString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}
      </div>
    </div>
  );
}
