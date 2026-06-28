import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/session';
import { enforceRateLimit } from '@/lib/server/ratelimit';
import { getMarketRoster } from '@/lib/server/marketData';

export const runtime = 'nodejs';

/**
 * GET /api/market/list?page= — the REAL marketplace roster: live on-chain cards
 * in the supported collection (via DAS), each linking to where it actually
 * trades. No more static TCG-API listings.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const limited = await enforceRateLimit(req, 'market-list', 40, 60_000);
  if (limited) return limited;

  const pageParam = Number(new URL(req.url).searchParams.get('page') ?? '1');
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const { cards, cluster, listedCount, marketMode } = await getMarketRoster(auth.pubkey, page, 24);
  return NextResponse.json({ page, cluster, cards, listedCount, marketMode });
}
