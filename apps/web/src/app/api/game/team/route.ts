import { NextResponse, type NextRequest } from 'next/server';
import { assets as assetRepo, profiles as profileRepo, teams as teamRepo } from '@battler/repositories';
import { requireAuth } from '@/lib/server/session';
import { isValidAssetId } from '@/lib/server/sanitize';

export const runtime = 'nodejs';

/** GET /api/game/team — current team asset IDs. */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ assetIds: await teamRepo.getTeam(auth.pubkey) });
}

/**
 * PUT /api/game/team { assetIds } — validate server-side (≤6, no dupes, owned,
 * playable, has a battle profile) then persist.
 */
export async function PUT(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => null)) as { assetIds?: unknown } | null;
  const raw = Array.isArray(body?.assetIds) ? body!.assetIds : null;
  if (!raw) return NextResponse.json({ error: 'assetIds required' }, { status: 400 });

  const assetIds = [...new Set(raw.filter(isValidAssetId))];
  if (assetIds.length !== raw.length) {
    return NextResponse.json({ error: 'invalid or duplicate asset ids' }, { status: 400 });
  }
  if (assetIds.length > 6) {
    return NextResponse.json({ error: 'a team has at most 6 cards' }, { status: 400 });
  }

  for (const id of assetIds) {
    const asset = await assetRepo.getAsset(id);
    if (!asset || asset.ownerPubkey !== auth.pubkey) {
      return NextResponse.json({ error: `not your card: ${id}` }, { status: 403 });
    }
    if (!asset.playable) {
      return NextResponse.json({ error: `unplayable card: ${id}` }, { status: 400 });
    }
    if (!(await profileRepo.getProfile(id))) {
      return NextResponse.json({ error: `no battle profile yet: ${id}` }, { status: 409 });
    }
  }

  await teamRepo.setTeam(auth.pubkey, assetIds);
  return NextResponse.json({ assetIds });
}
