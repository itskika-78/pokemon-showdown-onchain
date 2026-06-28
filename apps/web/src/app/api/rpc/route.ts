import { NextResponse, type NextRequest } from 'next/server';
import { loadServerConfig } from '@battler/server-kit';
import { enforceRateLimit } from '@/lib/server/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Same-origin Solana JSON-RPC proxy.
 *
 * The browser wallet (ConnectionProvider) points at `/api/rpc?cluster=…` instead
 * of a Helius URL, so the paid Helius API key NEVER ships to the client — it lives
 * only in the server-side `HELIUS_RPC_URL` / `HELIUS_DEVNET_RPC_URL` env vars and
 * is injected here, server-side. To stop this from becoming a free public gateway
 * that drains the Helius quota, requests are rate-limited per IP and restricted to
 * the JSON-RPC methods the wallet/app actually needs.
 */

const PUBLIC_FALLBACK: Record<'mainnet' | 'devnet', string> = {
  mainnet: 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
};

// Read + transaction methods the client legitimately calls. Anything else → 403.
const ALLOWED = new Set([
  'getbalance', 'getaccountinfo', 'getparsedaccountinfo', 'getmultipleaccounts',
  'gettokenaccountsbyowner', 'getparsedtokenaccountsbyowner', 'gettokenaccountbalance',
  'gettokensupply', 'gettokenlargestaccounts', 'getlatestblockhash', 'getrecentblockhash',
  'isblockhashvalid', 'getfeeformessage', 'getsignaturestatuses', 'getsignaturesforaddress',
  'sendtransaction', 'simulatetransaction', 'getslot', 'getblockheight', 'getblocktime',
  'getepochinfo', 'getminimumbalanceforrentexemption', 'gethealth', 'getversion',
  'getgenesishash', 'gettransaction', 'getparsedtransaction', 'requestairdrop',
  'getprogramaccounts', 'getinflationreward',
]);

function clusterFrom(req: NextRequest): 'mainnet' | 'devnet' {
  return req.nextUrl.searchParams.get('cluster') === 'devnet' ? 'devnet' : 'mainnet';
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'rpc-proxy', 240, 60_000);
  if (limited) return limited;

  const cluster = clusterFrom(req);
  const raw = await req.text();

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const calls = Array.isArray(body) ? body : [body];
  if (calls.length === 0 || calls.length > 20) {
    return NextResponse.json({ error: 'bad batch size' }, { status: 400 });
  }
  for (const c of calls) {
    const method = typeof (c as { method?: unknown })?.method === 'string' ? (c as { method: string }).method.toLowerCase() : '';
    if (!ALLOWED.has(method)) {
      return NextResponse.json({ error: `method not allowed: ${(c as { method?: string })?.method ?? '?'}` }, { status: 403 });
    }
  }

  const cfg = loadServerConfig();
  const url = (cluster === 'devnet' ? cfg.heliusDevnetRpcUrl : cfg.heliusRpcUrl) || PUBLIC_FALLBACK[cluster];

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw,
    });
  } catch {
    return NextResponse.json({ error: 'upstream RPC unreachable' }, { status: 502 });
  }

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** Health probe — never reveals the upstream URL or key. */
export function GET() {
  return NextResponse.json({ ok: true, proxy: 'rpc' });
}
