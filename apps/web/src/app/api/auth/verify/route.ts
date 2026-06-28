import { NextResponse, type NextRequest } from 'next/server';
import { authFailures, getRedis, loadServerConfig, signSession, verifySiws } from '@battler/server-kit';
import { users } from '@battler/repositories';
import { enforceRateLimit } from '@/lib/server/ratelimit';
import { isValidPubkey } from '@/lib/server/sanitize';
import { setSessionCookie } from '@/lib/server/session';

export const runtime = 'nodejs';

/** POST /api/auth/verify { pubkey, message, signature } — verify SIWS → JWT. */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'auth', 10, 60_000);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as
    | { pubkey?: string; message?: string; signature?: string }
    | null;
  if (!body || !isValidPubkey(body.pubkey) || !body.message || !body.signature) {
    authFailures.inc();
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  // The signature is over the EXACT message bytes the wallet signed — never
  // mutate it (e.g. stripping the message's newlines would break verification).
  // Guard length instead; structure (nonce/domain/pubkey) is checked in verifySiws.
  if (body.message.length > 1000) {
    authFailures.inc();
    return NextResponse.json({ error: 'message too long' }, { status: 400 });
  }

  const cfg = loadServerConfig();
  const redis = getRedis();
  const nonceKey = `siws:nonce:${body.pubkey}`;
  const expectedNonce = await redis.get(nonceKey);
  if (!expectedNonce) {
    authFailures.inc();
    return NextResponse.json({ error: 'nonce expired' }, { status: 401 });
  }

  const ok = verifySiws({
    message: body.message,
    signatureB58: body.signature,
    pubkeyB58: body.pubkey,
    expectedNonce,
    expectedDomain: cfg.siws.domain,
  });
  if (!ok) {
    authFailures.inc();
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  await redis.del(nonceKey); // single-use → replay prevention
  await users.ensureUser(body.pubkey);

  const token = signSession(body.pubkey);
  const res = NextResponse.json({ token, pubkey: body.pubkey });
  setSessionCookie(res, token);
  return res;
}
