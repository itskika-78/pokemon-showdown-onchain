import { NextResponse, type NextRequest } from 'next/server';
import { resolveBattleWsUrl } from '@/lib/server/battleWsUrl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/config — public runtime config (no secrets). */
export async function GET(req: NextRequest) {
  const host = req.headers.get('host')?.split(':')[0] ?? undefined;
  const wsUrl = resolveBattleWsUrl(host);
  return NextResponse.json({
    wsUrl,
    battleServiceConfigured: !!wsUrl,
  });
}
