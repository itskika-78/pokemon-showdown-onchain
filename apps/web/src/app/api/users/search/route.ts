import { NextResponse, type NextRequest } from 'next/server';
import { users } from '@battler/repositories';
import { requireAuth } from '@/lib/server/session';
import { enforceRateLimit } from '@/lib/server/ratelimit';

export const runtime = 'nodejs';

/**
 * GET /api/users/search?q=<name> — find trainers by username so a battle
 * opponent can be picked WITHOUT pasting a base58 address. Excludes self.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const limited = await enforceRateLimit(req, 'user-search', 90, 60_000);
  if (limited) return limited;

  const q = new URL(req.url).searchParams.get('q') ?? '';
  const found = await users.searchByUsername(q, 8);
  return NextResponse.json({ users: found.filter((u) => u.pubkey !== auth.pubkey) });
}
