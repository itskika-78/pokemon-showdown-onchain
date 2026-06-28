import { NextResponse, type NextRequest } from 'next/server';
import { getEffectiveDasSettings } from '@battler/ingest';
import { requireAuth } from '@/lib/server/session';
import { enforceRateLimit } from '@/lib/server/ratelimit';

export const runtime = 'nodejs';

/**
 * POST /api/market/buy-tx { mint } — disabled; mainnet purchases happen on
 * Magic Eden / Phygitals. Kept for API compatibility with a clear error.
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const limited = await enforceRateLimit(req, 'market-buy-tx', 20, 60_000);
  if (limited) return limited;

  const eff = await getEffectiveDasSettings();
  if (eff.mode === 'mainnet') {
    return NextResponse.json(
      { error: 'In-app purchases are disabled on mainnet. Buy on Magic Eden or Phygitals.', code: 'mainnet_external' },
      { status: 403 },
    );
  }
  return NextResponse.json(
    { error: 'Use the devnet marketplace purchase flow on devnet.', code: 'use_devnet_flow' },
    { status: 403 },
  );
}
