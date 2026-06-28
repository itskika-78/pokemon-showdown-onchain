import jwt from 'jsonwebtoken';
import { loadServerConfig } from './config.js';

export interface SessionClaims {
  pubkey: string;
}

/** Issue a short-lived HS256 session JWT bound to a wallet pubkey. */
export function signSession(pubkey: string): string {
  const cfg = loadServerConfig();
  return jwt.sign({ pubkey }, cfg.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: cfg.sessionTtlSeconds,
  });
}

/** Verify a session JWT; returns the claims or null if invalid/expired. */
export function verifySession(token: string | undefined | null): SessionClaims | null {
  if (!token) return null;
  try {
    // Pin the algorithm — never let a token dictate it (blocks alg=none / alg confusion).
    const decoded = jwt.verify(token, loadServerConfig().jwtSecret, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
    if (decoded && typeof decoded.pubkey === 'string') return { pubkey: decoded.pubkey };
    return null;
  } catch {
    return null;
  }
}

/** Pull a bearer token out of an Authorization header. */
export function bearerFromHeader(header: string | undefined | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1]!.trim() : null;
}
