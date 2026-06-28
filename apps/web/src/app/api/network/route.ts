import { NextResponse } from 'next/server';
import { clusterForNetwork } from '@battler/server-kit';
import { getEffectiveDasSettings } from '@battler/ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let cached: { at: number; body: { mode: string; cluster: string; onChain: boolean } } | undefined;
const CACHE_MS = 10_000;

/**
 * GET /api/network — public, unauthenticated view of the active data source.
 */
export async function GET() {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) {
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
    cached = { at: now, body };
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'public, max-age=10, stale-while-revalidate=30' },
    });
  } catch {
    return NextResponse.json({ mode: 'devnet', cluster: 'devnet', onChain: true });
  }
}
