import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/session';
import { enforceRateLimit } from '@/lib/server/ratelimit';
import { buildDevnetBuyTx } from '@/lib/server/devnetMarket';

export const runtime = 'nodejs';

/** POST /api/market/devnet-buy { listingId } — build devnet SOL payment tx. */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const limited = await enforceRateLimit(req, 'market-devnet-buy', 20, 60_000);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { listingId?: unknown } | null;
  const listingId = typeof body?.listingId === 'string' ? body.listingId.trim() : '';
  if (!listingId) {
    return NextResponse.json({ error: 'listingId is required' }, { status: 400 });
  }

  try {
    const result = await buildDevnetBuyTx(listingId, auth.pubkey);
    return NextResponse.json(result);
  } catch (e) {
    const code = (e as { code?: string }).code;
    const msg = e instanceof Error ? e.message : 'Buy failed';
    const status =
      code === 'sold_out' ? 409 :
      code === 'wrong_mode' ? 403 :
      code === 'no_treasury' || code === 'no_rpc' ? 501 : 502;
    return NextResponse.json({ error: msg, code }, { status });
  }
}
