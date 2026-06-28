import { NextResponse, type NextRequest } from 'next/server';
import { enforceRateLimit } from '@/lib/server/ratelimit';
import { browseCards } from '@/lib/server/tcg';

export const runtime = 'nodejs';

/**
 * GET /api/pokedex?q=&filter=&page=&pageSize= — PUBLIC, paginated TCG card
 * browse for the Pokédex page. No auth (card data is public), but rate-limited
 * to protect the upstream api.pokemontcg.io.
 */
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'pokedex', 60, 60_000);
  if (limited) return limited;

  const sp = new URL(req.url).searchParams;
  const result = await browseCards({
    q: sp.get('q') ?? '',
    filter: sp.get('filter') ?? 'all',
    page: Number(sp.get('page') ?? '1') || 1,
    pageSize: Number(sp.get('pageSize') ?? '24') || 24,
  });
  return NextResponse.json(result);
}
