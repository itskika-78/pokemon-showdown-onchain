'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Health {
  ok: boolean;
  postgres: boolean;
  redis: boolean;
  redisMode?: string;
}

export function BackendBanner() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3_000);
      fetch('/api/health', { signal: ctrl.signal })
        .then((r) => r.json() as Promise<Health>)
        .then((h) => {
          if (!cancelled) setHealth(h);
        })
        .catch(() => {
          if (!cancelled) setHealth({ ok: false, postgres: false, redis: false });
        })
        .finally(() => clearTimeout(t));
    };
    check();
    const id = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!health || health.ok) return null;

  return (
    <div className="shine-banner warning" role="status">
      <div className="shine-banner-body">
        <span className="new-pulse" aria-hidden />
        <span>
          Backend services need attention —{' '}
          {!health.postgres && 'Postgres is offline'}
          {!health.postgres && !health.redis && ' · '}
          {!health.redis && health.redisMode !== 'memory' && 'Redis is offline'}
          {health.redisMode === 'memory' && ' (using in-memory cache)'}
          . Run <code className="kbd">pnpm dev:postgres</code> and <code className="kbd">pnpm dev:redis</code> in separate terminals, then refresh.
        </span>
      </div>
      <Link href="/settings" className="btn sm secondary">Settings</Link>
    </div>
  );
}
