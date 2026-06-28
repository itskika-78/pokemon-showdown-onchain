import { NextResponse, type NextRequest } from 'next/server';
import { friends, users } from '@battler/repositories';
import { requireAuth } from '@/lib/server/session';
import { enforceRateLimit } from '@/lib/server/ratelimit';
import { isValidPubkey } from '@/lib/server/sanitize';

export const runtime = 'nodejs';

/** GET /api/friends — the signed-in user's friends, with usernames + ratings. */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ friends: await friends.listFriends(auth.pubkey) });
}

/**
 * POST /api/friends { pubkey?, username? } — add a friend. Adding needs a wallet
 * address (base58); a username is also accepted and resolved to its address.
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const limited = await enforceRateLimit(req, 'add-friend', 30, 60_000);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { pubkey?: string; username?: string } | null;
  let target = body?.pubkey?.trim() ?? '';
  if (!target && body?.username) {
    const u = await users.getByUsername(body.username.trim());
    if (!u) return NextResponse.json({ error: 'No trainer with that username.' }, { status: 404 });
    target = u.pubkey;
  }
  if (!isValidPubkey(target)) {
    return NextResponse.json({ error: 'Enter a valid Solana wallet address.' }, { status: 400 });
  }
  if (target === auth.pubkey) {
    return NextResponse.json({ error: "You can't add yourself." }, { status: 400 });
  }
  await friends.addFriend(auth.pubkey, target);
  const [info] = await users.getPublicUsers([target]);
  return NextResponse.json({ ok: true, friend: { pubkey: target, username: info?.username ?? null, rating: info?.rating ?? 1000 } });
}

/** DELETE /api/friends?pubkey=<addr> — remove a friend. */
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const pubkey = new URL(req.url).searchParams.get('pubkey') ?? '';
  if (!isValidPubkey(pubkey)) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  await friends.removeFriend(auth.pubkey, pubkey);
  return NextResponse.json({ ok: true });
}
