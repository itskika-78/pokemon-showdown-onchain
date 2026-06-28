import { NextResponse, type NextRequest } from 'next/server';
import { getRedis } from '@battler/server-kit';

/**
 * Fixed-window rate limiter. Primary path is Redis (INCR + PEXPIRE) so the limit
 * holds across every serverless instance / replica — essential on Vercel where
 * each invocation may be a fresh process and an in-memory counter would reset on
 * every cold start. Falls back to a per-instance in-memory window if Redis is
 * unavailable, so the limiter degrades rather than failing open hard.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();
let lastSweep = 0;

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'local';
}

/** Drop expired buckets so the map can't grow unbounded under churny IPs. */
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return; // at most once a minute
  lastSweep = now;
  for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
}

/** In-memory fallback: true if allowed, false if it exceeded the limit. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= max;
}

/** Redis fixed-window: returns allowed boolean, or null if Redis is unavailable. */
async function redisAllow(key: string, max: number, windowMs: number): Promise<boolean | null> {
  try {
    const redis = getRedis();
    const k = `rl:${key}`;
    const count = await redis.incr(k);
    if (count === 1) await redis.pexpire(k, windowMs);
    return count <= max;
  } catch {
    return null; // signal caller to use the in-memory fallback
  }
}

/**
 * Rate-limit by IP+route, returning a 429 response when exceeded (else null).
 * Async because the authoritative counter lives in Redis; degrades to the
 * in-memory window when Redis can't be reached.
 */
export async function enforceRateLimit(
  req: NextRequest,
  route: string,
  max: number,
  windowMs: number,
): Promise<NextResponse | null> {
  const key = `${route}:${clientIp(req)}`;
  const viaRedis = await redisAllow(key, max, windowMs);
  const allowed = viaRedis === null ? rateLimit(key, max, windowMs) : viaRedis;
  if (!allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  return null;
}
