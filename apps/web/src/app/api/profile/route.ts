import { NextResponse, type NextRequest } from 'next/server';
import { users } from '@battler/repositories';
import { requireAuth } from '@/lib/server/session';
import { enforceRateLimit } from '@/lib/server/ratelimit';

export const runtime = 'nodejs';

/** GET /api/profile — the signed-in user's profile (username + rating). */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  await users.ensureUser(auth.pubkey);
  const u = await users.getUser(auth.pubkey);
  return NextResponse.json({
    pubkey: auth.pubkey,
    username: u?.username ?? null,
    rating: u?.rating ?? 1000,
  });
}

/** POST /api/profile { username } — claim/change a unique username. */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const limited = await enforceRateLimit(req, 'set-username', 10, 60_000);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { username?: string } | null;
  const username = (body?.username ?? '').trim();
  if (!users.isValidUsername(username)) {
    return NextResponse.json(
      { error: 'Username must be 3–20 characters, start with a letter, and use only letters, numbers or _.' },
      { status: 400 },
    );
  }
  const res = await users.setUsername(auth.pubkey, username);
  if (!res.ok) {
    return NextResponse.json(
      { error: res.reason === 'taken' ? 'That username is already taken.' : 'Invalid username.' },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, username });
}
