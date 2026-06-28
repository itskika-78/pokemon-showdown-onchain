import { NextResponse, type NextRequest } from 'next/server';
import { isDasNetwork, loadServerConfig } from '@battler/server-kit';
import { getEffectiveDasSettings } from '@battler/ingest';
import { probeDasEndpoint } from '@battler/das';
import { requireAuth } from '@/lib/server/session';
import { enforceRateLimit } from '@/lib/server/ratelimit';

export const runtime = 'nodejs';

/**
 * POST /api/settings/test { mode } — probe the server-configured Helius endpoint.
 * Client cannot supply an RPC URL (prevents SSRF and key exfiltration).
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const limited = await enforceRateLimit(req, 'settings-test', 12, 60_000);
  if (limited) return limited;
  const cfg = loadServerConfig();
  if (cfg.isProd) return NextResponse.json({ error: 'Connection test disabled in production' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { mode?: string; rpcUrl?: string } | null;

  if (body?.rpcUrl) {
    return NextResponse.json({ error: 'Custom RPC URLs are not allowed' }, { status: 400 });
  }

  const mode = body?.mode;
  if (!isDasNetwork(mode)) {
    return NextResponse.json({ error: 'test requires mode "devnet" or "mainnet"' }, { status: 400 });
  }

  const eff = await getEffectiveDasSettings();
  const url = mode === 'mainnet' ? eff.heliusRpcUrl : eff.heliusDevnetRpcUrl;
  if (!url) {
    return NextResponse.json(
      { error: `No ${mode} RPC configured on the server — set HELIUS_API_KEY in environment.` },
      { status: 503 },
    );
  }

  const result = await probeDasEndpoint(url);
  return NextResponse.json({
    ok: result.ok,
    latencyMs: result.latencyMs,
    sampleAssets: result.sampleAssets,
    error: result.error,
    mode,
    endpoint: 'server-configured',
  });
}
