import { NextResponse, type NextRequest } from 'next/server';
import {
  clusterForNetwork,
  isDasNetwork,
  loadServerConfig,
  setDasSettingsMode,
  type DasNetwork,
} from '@battler/server-kit';
import { getEffectiveDasSettings, resetProviderCache, type EffectiveDasSettings } from '@battler/ingest';
import { requireAuth } from '@/lib/server/session';
import { enforceRateLimit } from '@/lib/server/ratelimit';

export const runtime = 'nodejs';

function snapshot(eff: EffectiveDasSettings) {
  const cfg = loadServerConfig();
  return {
    mode: eff.mode,
    cluster: clusterForNetwork(eff.mode),
    /** Whether server env has Helius configured (no URLs or keys exposed). */
    rpcConfigured: {
      mainnet: !!cfg.heliusRpcUrl,
      devnet: !!cfg.heliusDevnetRpcUrl,
      active: !!eff.activeRpcUrl,
    },
    canEditMode: !cfg.isProd,
    supportedCollections: [...cfg.supportedCollections],
  };
}

/** GET /api/settings — network mode only; RPC secrets never leave the server. */
export async function GET(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const limited = await enforceRateLimit(req, 'settings-get', 30, 60_000);
  if (limited) return limited;
  return NextResponse.json(snapshot(await getEffectiveDasSettings()));
}

/**
 * PUT /api/settings { mode } — switch devnet/mainnet only.
 * Helius RPC URLs and API keys are server env vars and cannot be changed via API.
 */
export async function PUT(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const limited = await enforceRateLimit(req, 'settings-put', 10, 60_000);
  if (limited) return limited;
  const cfg = loadServerConfig();
  if (cfg.isProd) {
    return NextResponse.json({ error: 'Network mode is locked in production' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    mode?: string;
    heliusRpcUrl?: unknown;
    heliusDevnetRpcUrl?: unknown;
  } | null;

  if (body?.heliusRpcUrl !== undefined || body?.heliusDevnetRpcUrl !== undefined) {
    return NextResponse.json(
      { error: 'RPC URLs cannot be changed via the API. Set HELIUS_API_KEY in server environment.' },
      { status: 400 },
    );
  }

  const mode = body?.mode;
  if (!isDasNetwork(mode)) {
    return NextResponse.json({ error: 'mode must be "devnet" or "mainnet"' }, { status: 400 });
  }

  if (mode === 'mainnet' && !cfg.heliusRpcUrl) {
    return NextResponse.json({ error: 'mainnet requires HELIUS_API_KEY or HELIUS_RPC_URL on the server' }, { status: 503 });
  }
  if (mode === 'devnet' && !cfg.heliusDevnetRpcUrl) {
    return NextResponse.json({ error: 'devnet requires HELIUS_API_KEY or HELIUS_DEVNET_RPC_URL on the server' }, { status: 503 });
  }

  await setDasSettingsMode(mode as DasNetwork);
  resetProviderCache();
  return NextResponse.json(snapshot(await getEffectiveDasSettings()));
}
