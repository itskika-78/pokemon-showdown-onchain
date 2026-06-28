import { NextResponse } from 'next/server';
import { getRedisMode, pingPostgres, pingRedis } from '@battler/server-kit';

export const runtime = 'nodejs';

const HEALTH_TIMEOUT_MS = 2_000;

/** GET /api/health — lightweight dependency check for the dev banner. */
export async function GET() {
  const [postgres, redis] = await Promise.all([
    pingPostgres(HEALTH_TIMEOUT_MS),
    pingRedis(HEALTH_TIMEOUT_MS),
  ]);
  const redisMode = getRedisMode();
  const redisOk = redis || redisMode === 'memory';
  const ok = postgres && redisOk;
  return NextResponse.json(
    { ok, postgres, redis: redisOk, redisMode },
    { status: ok ? 200 : 503 },
  );
}
