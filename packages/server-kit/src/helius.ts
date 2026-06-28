/**
 * Resolve Helius RPC URLs server-side only. Prefer HELIUS_API_KEY (never sent
 * to the client); fall back to full URL env vars for local overrides.
 */
export function resolveHeliusRpcUrls(input: {
  apiKey?: string;
  mainnetUrl?: string;
  devnetUrl?: string;
}): { mainnet?: string; devnet?: string } {
  const key = input.apiKey?.trim();
  const mainnet = input.mainnetUrl?.trim() || (key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : undefined);
  const devnet = input.devnetUrl?.trim() || (key ? `https://devnet.helius-rpc.com/?api-key=${key}` : undefined);
  return { mainnet, devnet };
}

/** Strip api-key from a URL for safe logging / client responses. */
export function maskHeliusUrl(raw: string): string {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (u.searchParams.has('api-key')) u.searchParams.set('api-key', '••••');
    return `${u.protocol}//${u.host}${u.pathname}${u.search}`;
  } catch {
    return raw.replace(/api-key=[^&]+/gi, 'api-key=••••');
  }
}
