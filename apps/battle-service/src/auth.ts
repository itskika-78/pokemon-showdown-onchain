import type { Socket } from 'socket.io';
import { bearerFromHeader, verifySession, authFailures } from '@battler/server-kit';

/**
 * Socket.IO auth middleware. The client passes its session JWT in
 * `socket.handshake.auth.token` (or an Authorization header). We verify it and
 * pin the wallet pubkey onto socket.data — the client never asserts its own id.
 */
export function socketAuth(socket: Socket, next: (err?: Error) => void): void {
  const fromAuth = (socket.handshake.auth as { token?: string } | undefined)?.token;
  const token = fromAuth ?? bearerFromHeader(socket.handshake.headers.authorization);
  const claims = verifySession(token);
  if (!claims) {
    authFailures.inc();
    next(new Error('unauthorized'));
    return;
  }
  socket.data.pubkey = claims.pubkey;
  next();
}
