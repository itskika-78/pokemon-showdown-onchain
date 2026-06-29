let cached: { at: number; body: { mode: string; cluster: string; onChain: boolean } } | undefined;

export function getNetworkRouteCache():
  | { at: number; body: { mode: string; cluster: string; onChain: boolean } }
  | undefined {
  return cached;
}

export function setNetworkRouteCache(entry: {
  at: number;
  body: { mode: string; cluster: string; onChain: boolean };
}): void {
  cached = entry;
}

/** Clear after Settings save so the next /api/network read is fresh. */
export function resetNetworkRouteCache(): void {
  cached = undefined;
}

export const NETWORK_ROUTE_CACHE_MS = 10_000;
