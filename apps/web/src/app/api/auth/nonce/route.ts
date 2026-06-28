import { NextResponse, type NextRequest } from 'next/server';
import { v4 as uuid } from 'uuid';
import { buildSiwsMessage, getRedis, loadServerConfig } from '@battler/server-kit';
import { enforceRateLimit } from '@/lib/server/ratelimit';
import { isValidPubkey } from '@/lib/server/sanitize';

export const runtime = 'nodejs';

/** GET /api/auth/nonce?pubkey=X — issue a single-use SIWS nonce (5min TTL). */
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'auth', 10, 60_000);
  if (limited) return limited;

  const pubkey = req.nextUrl.searchParams.get('pubkey');
  if (!isValidPubkey(pubkey)) {
    return NextResponse.json({ error: 'invalid pubkey' }, { status: 400 });
  }

  const cfg = loadServerConfig();
  const nonce = uuid();
  try {
    await getRedis().set(`siws:nonce:${pubkey}`, nonce, 'EX', 300);
  } catch {
    return NextResponse.json({ error: 'auth_store_unavailable' }, { status: 503 });
  }

  const message = buildSiwsMessage({
    domain: cfg.siws.domain,
    address: pubkey,
    statement: cfg.siws.statement,
    uri: cfg.siws.uri,
    version: cfg.siws.version,
    chainId: cfg.siws.chainId,
    nonce,
    issuedAt: new Date().toISOString(),
  });

  return NextResponse.json({ nonce, message });
}
