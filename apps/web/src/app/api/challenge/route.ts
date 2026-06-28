import { NextResponse, type NextRequest } from 'next/server';
import type { WagerTerms } from '@battler/core';
import { challenges, users } from '@battler/repositories';
import { requireAuth } from '@/lib/server/session';
import { isValidAssetId, isValidPubkey } from '@/lib/server/sanitize';

export const runtime = 'nodejs';

/** 1M SOL in lamports — a sane upper bound mirrored by the battle-service. */
const MAX_WAGER_BASE_UNITS = 1_000_000_000_000_000;

function parseWager(raw: unknown): WagerTerms | null {
  if (!raw || typeof raw !== 'object') return null;
  const w = raw as { type?: string; amount?: number; assetId?: string };
  if (w.type === 'none') return null; // friendly stakes disabled — wagers only
  if (
    w.type === 'crypto' &&
    typeof w.amount === 'number' &&
    Number.isFinite(w.amount) &&
    w.amount > 0 &&
    w.amount <= MAX_WAGER_BASE_UNITS
  ) {
    return { type: 'crypto', amount: Math.floor(w.amount) };
  }
  if (w.type === 'card' && isValidAssetId(w.assetId)) {
    return { type: 'card', assetId: w.assetId };
  }
  return null;
}

/** POST /api/challenge { challengeePubkey, wager } — open a negotiation (5min TTL). */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => null)) as
    | { challengeePubkey?: string; wager?: unknown }
    | null;
  if (!body || !isValidPubkey(body.challengeePubkey)) {
    return NextResponse.json({ error: 'invalid challengee' }, { status: 400 });
  }
  if (body.challengeePubkey === auth.pubkey) {
    return NextResponse.json({ error: 'cannot challenge yourself' }, { status: 400 });
  }
  const wager = parseWager(body.wager);
  if (!wager) return NextResponse.json({ error: 'invalid wager' }, { status: 400 });

  await users.ensureUser(body.challengeePubkey);
  const negotiation = await challenges.createChallenge({
    challenger: auth.pubkey,
    challengee: body.challengeePubkey,
    wager,
    ttlSeconds: 300,
  });
  return NextResponse.json({ challengeId: negotiation.challengeId, negotiation });
}

/** GET /api/challenge — list active negotiations for the signed-in user. */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  await challenges.expireStaleChallenges();
  const list = await challenges.listActiveForUser(auth.pubkey);
  return NextResponse.json({ challenges: list });
}
