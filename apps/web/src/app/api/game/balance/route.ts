import { NextResponse, type NextRequest } from 'next/server';
import { users } from '@battler/repositories';
import { requireAuth } from '@/lib/server/session';

export const runtime = 'nodejs';

/** GET /api/game/balance — the signed-in wallet's fake-credit ledger balance. */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  await users.ensureUser(auth.pubkey);
  const user = await users.getUser(auth.pubkey);
  return NextResponse.json({
    pubkey: auth.pubkey,
    balance: user?.ledgerBalance ?? 0,
    rating: user?.rating ?? 1000,
  });
}
