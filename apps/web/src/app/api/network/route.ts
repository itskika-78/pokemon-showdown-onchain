import { NextResponse } from 'next/server';
import { clusterForNetwork } from '@battler/server-kit';
import { getEffectiveDasSettings } from '@battler/ingest';
import {
  getNetworkRouteCache,
  NETWORK_ROUTE_CACHE_MS,
  setNetworkRouteCache,
} from '@/lib/server/networkCache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/network — public, unauthenticated view of the active data source.
 */
export async function GET() {
  const now = Date.now();
  const cached = getNetworkRouteCache();
  if (cached && now - cached.at < NETWORK_ROUTE_CACHE_MS) {
    return NextResponse.json(cached.body, {
      headers: { 'Cache-Control': 'public, max-age=10, stale-while-revalidate=30' },
    });
  }

  try {
    const eff = await getEffectiveDasSettings();
    const body = {
      mode: eff.mode,
      cluster: clusterForNetwork(eff.mode),
      onChain: true as const,
    };
    setNetworkRouteCache({ at: now, body });
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'public, max-age=10, stale-while-revalidate=30' },
    });
  } catch {
    return NextResponse.json({ mode: 'devnet', cluster: 'devnet', onChain: true });
  }
}
