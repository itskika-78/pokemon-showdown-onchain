import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/session';
import { enforceRateLimit } from '@/lib/server/ratelimit';
import { confirmDevnetPurchase } from '@/lib/server/devnetMarket';
import { invalidateOwnerAssets } from '@/lib/server/assetsCache';

export const runtime = 'nodejs';

/** POST /api/market/devnet-confirm { listingId, signature } — verify payment & grant card. */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const limited = await enforceRateLimit(req, 'market-devnet-confirm', 20, 60_000);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    listingId?: unknown;
    signature?: unknown;
  } | null;
  const listingId = typeof body?.listingId === 'string' ? body.listingId.trim() : '';
  const signature = typeof body?.signature === 'string' ? body.signature.trim() : '';
  if (!listingId || !signature) {
    return NextResponse.json({ error: 'listingId and signature are required' }, { status: 400 });
  }

  try {
    const result = await confirmDevnetPurchase({
      listingId,
      buyer: auth.pubkey,
      signature,
    });
    await invalidateOwnerAssets(auth.pubkey);
    return NextResponse.json(result);
  } catch (e) {
    const code = (e as { code?: string }).code;
    const msg = e instanceof Error ? e.message : 'Confirmation failed';
    const status =
      code === 'sold_out' || code === 'duplicate' ? 409 :
      code === 'bad_payment' ? 402 :
      code === 'wrong_mode' ? 403 : 502;
    return NextResponse.json({ error: msg, code }, { status });
  }
}
