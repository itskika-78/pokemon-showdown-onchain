import { NextResponse, type NextRequest } from 'next/server';
import { loadServerConfig } from '@battler/server-kit';
import { users } from '@battler/repositories';
import { requireAuth } from '@/lib/server/session';
import { enforceRateLimit } from '@/lib/server/ratelimit';

export const runtime = 'nodejs';

/** POST /api/game/faucet — dev-only: top up fake credits for wager testing. */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (loadServerConfig().isProd) {
    return NextResponse.json({ error: 'faucet disabled in production' }, { status: 403 });
  }
  const limited = await enforceRateLimit(req, 'faucet', 10, 60_000); // no credit-farming by spamming
  if (limited) return limited;
  const balance = await users.faucet(auth.pubkey, 100_000);
  return NextResponse.json({ balance });
}
