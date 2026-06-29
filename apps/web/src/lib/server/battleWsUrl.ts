/**
 * Public battle-service WebSocket URL for the browser.
 * Prefer BATTLE_WS_PUBLIC_URL (server-only, no rebuild) over NEXT_PUBLIC_WS_URL.
 */
export function resolveBattleWsUrl(requestHost?: string): string | null {
  const raw =
    process.env.BATTLE_WS_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_WS_URL?.trim() ||
    '';

  if (!raw) return null;

  const isLocalRequest =
    requestHost === 'localhost' ||
    requestHost === '127.0.0.1' ||
    requestHost?.endsWith('.localhost');

  if (!isLocalRequest && (raw.includes('localhost') || raw.includes('127.0.0.1'))) {
    return null;
  }

  return raw.replace(/\/$/, '');
}
