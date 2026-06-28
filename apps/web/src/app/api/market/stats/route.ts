import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/session';
import { enforceRateLimit } from '@/lib/server/ratelimit';
import { getCollectionStats } from '@/lib/server/marketStats';

export const runtime = 'nodejs';

/**
 * GET /api/market/stats — live collection market overview (floor / listed /
 * volume + floor trend) from Magic Eden, cached ~60s. Polled by the marketplace
 * overview strip for a real-time feel.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const limited = await enforceRateLimit(req, 'market-stats', 30, 60_000); // protect Magic Eden
  if (limited) return limited;
  try {
    return NextResponse.json(await getCollectionStats());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'stats unavailable' },
      { status: 502 },
    );
  }
}
