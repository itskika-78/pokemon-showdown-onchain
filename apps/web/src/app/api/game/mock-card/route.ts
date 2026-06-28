import { NextResponse, type NextRequest } from 'next/server';
import { loadServerConfig } from '@battler/server-kit';
import { mockCards } from '@battler/repositories';
import { getEffectiveDasSettings } from '@battler/ingest';
import { normalizeCardName } from '@battler/card-parser';
import { requireAuth } from '@/lib/server/session';
import { sanitizeText } from '@/lib/server/sanitize';
import { isAllowedCardImage } from '@/lib/server/tcg';
import { invalidateOwnerAssets } from '@/lib/server/assetsCache';

export const runtime = 'nodejs';

/** GET /api/game/mock-card — list the user's added cards. */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ cards: await mockCards.listByOwner(auth.pubkey) });
}

/** POST /api/game/mock-card — add a devnet inventory card (devnet mode, dev only). */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const cfg = loadServerConfig();
  if (cfg.isProd) return NextResponse.json({ error: 'disabled in production' }, { status: 403 });
  if ((await getEffectiveDasSettings()).mode !== 'devnet') {
    return NextResponse.json({ error: 'Adding cards only works in devnet mode' }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = sanitizeText(body?.name, 80);
  if (!name) return NextResponse.json({ error: 'card name required' }, { status: 400 });

  const attrs: { trait_type: string; value: string }[] = [];
  const push = (t: string, v: unknown) => {
    const s = sanitizeText(v, 40);
    if (s) attrs.push({ trait_type: t, value: s });
  };
  push('Rarity', body?.rarity);
  push('Grade', body?.grade);
  push('Grading Company', body?.gradingCompany);
  push('Year', body?.year);
  push('Set', body?.set);
  push('Card Number', body?.cardNumber);

  // Only persist an image if it's a genuine TCG scan from the official CDN.
  const image = isAllowedCardImage(body?.image) ? body.image : null;

  const normalized = normalizeCardName(name);
  const card = await mockCards.add({ ownerPubkey: auth.pubkey, name, attributes: attrs, image });
  await invalidateOwnerAssets(auth.pubkey);
  return NextResponse.json({
    card,
    playable: normalized.playable,
    speciesId: normalized.speciesId,
    parseFailReason: normalized.parseFailReason,
  });
}

/** DELETE /api/game/mock-card?assetId=… — remove a custom card. */
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const assetId = new URL(req.url).searchParams.get('assetId');
  if (!assetId) return NextResponse.json({ error: 'assetId required' }, { status: 400 });
  await mockCards.remove(assetId, auth.pubkey);
  await invalidateOwnerAssets(auth.pubkey);
  return NextResponse.json({ ok: true });
}
