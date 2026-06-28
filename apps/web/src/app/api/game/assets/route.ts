import { NextResponse, type NextRequest } from 'next/server';
import type { BattleProfile } from '@battler/core';
import type { CollectionCard } from '@battler/das';
import { profiles as profileRepo } from '@battler/repositories';
import { syncOwnerCollection } from '@battler/ingest';
import { getDasProvider } from '@/lib/server/dasProvider';
import { requireAuth } from '@/lib/server/session';
import { resolveCardImage } from '@/lib/server/tcg';
import { getCachedAssets, setCachedAssets } from '@/lib/server/assetsCache';
import { loadOwnerCollectionFromDb } from '@/lib/server/collectionFast';

export const runtime = 'nodejs';

const CACHE_HEADERS = { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' };

const needsRealImage = (url: string | null): boolean =>
  !url || url.includes('cdn.phygitals.com') || url.trim() === '';

async function attachProfiles(cards: CollectionCard[], unsupported: unknown[]) {
  await Promise.all(
    cards.map(async (c) => {
      if (!needsRealImage(c.cardImageUrl ?? null)) return;
      const key = c.speciesId ?? c.cardName;
      if (!key) return;
      const img = await resolveCardImage(key).catch(() => null);
      if (img) c.cardImageUrl = img;
    }),
  );

  const playableIds = cards.filter((c) => c.playable).map((c) => c.assetId);
  const list = await profileRepo.getProfiles(playableIds);
  const byId: Record<string, BattleProfile> = {};
  for (const p of list) byId[p.assetId] = p;
  return { cards, profiles: byId, unsupported };
}

/**
 * GET /api/game/assets — fast Postgres read by default; ?refresh=1 runs Helius sync.
 */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const refresh = req.nextUrl.searchParams.get('refresh') === '1';

  if (!refresh) {
    const cached = await getCachedAssets(auth.pubkey);
    if (cached) {
      return NextResponse.json(JSON.parse(cached), { headers: CACHE_HEADERS });
    }

    try {
      const fromDb = await loadOwnerCollectionFromDb(auth.pubkey);
      if (fromDb.cards.length > 0 || fromDb.unsupported.length > 0) {
        const payload = await attachProfiles(fromDb.cards, fromDb.unsupported);
        void setCachedAssets(auth.pubkey, JSON.stringify(payload));
        return NextResponse.json(payload, { headers: CACHE_HEADERS });
      }
    } catch (err) {
      console.warn('[assets] fast path failed:', err instanceof Error ? err.message : err);
    }
  }

  const { cards, unsupported } = await syncOwnerCollection(await getDasProvider(), auth.pubkey);
  const payload = await attachProfiles(cards, unsupported);
  void setCachedAssets(auth.pubkey, JSON.stringify(payload));
  return NextResponse.json(payload);
}
