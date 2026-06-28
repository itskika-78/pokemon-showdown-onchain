import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { bearerFromHeader, loadServerConfig, verifySession } from '@battler/server-kit';

export const SESSION_COOKIE = 'battler_session';

/** Resolve the authenticated wallet pubkey from cookie or Authorization header. */
export function getPubkey(req: NextRequest): string | null {
  const cookieToken = req.cookies.get(SESSION_COOKIE)?.value;
  const headerToken = bearerFromHeader(req.headers.get('authorization'));
  return verifySession(cookieToken ?? headerToken)?.pubkey ?? null;
}

/** Use at the top of protected /api/game/* handlers. */
export function requireAuth(req: NextRequest): { pubkey: string } | NextResponse {
  const pubkey = getPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return { pubkey };
}

/** Set the HttpOnly session cookie on a response. */
export function setSessionCookie(res: NextResponse, token: string): void {
  const cfg = loadServerConfig();
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cfg.isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: cfg.sessionTtlSeconds,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
