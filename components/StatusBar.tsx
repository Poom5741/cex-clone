'use client';

import { useEffect, useState } from 'react';
import { testConnection } from '@/lib/pocketbase';

interface StatusBarProps {
  market: string;
}

export default function StatusBar({ market }: StatusBarProps) {
  const [dbStatus, setDbStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');
  const [currentTime, setCurrentTime] = useState<string | null>(null);

  useEffect(() => {
    const checkConnection = async () => {
      setDbStatus('connecting');
      const connected = await testConnection();
      setDbStatus(connected ? 'connected' : 'disconnected');
    };

    // Set initial time on client only
    setCurrentTime(new Date().toLocaleString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }));

    checkConnection();
    const interval = setInterval(checkConnection, 5000);
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date().toLocaleString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }));
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(timeInterval);
    };
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
        {currentTime || '--:--:--'}
      </div>
    </div>
  );
}
