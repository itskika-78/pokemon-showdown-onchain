import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/session';
import { enforceRateLimit } from '@/lib/server/ratelimit';
import { searchCards } from '@/lib/server/tcg';

export const runtime = 'nodejs';

/** GET /api/tcg/search?q=char — real Pokémon TCG cards for the Add Card picker. */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const limited = await enforceRateLimit(req, 'tcg-search', 30, 60_000); // protect the upstream TCG API
  if (limited) return limited;
  const q = new URL(req.url).searchParams.get('q') ?? '';
  if (q.trim().length < 2) return NextResponse.json({ cards: [] });
  return NextResponse.json({ cards: await searchCards(q, 24) });
}
