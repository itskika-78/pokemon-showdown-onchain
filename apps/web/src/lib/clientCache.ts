'use client';

import type { AssetsResponse, DasSettingsResponse } from './api';

const KEYS = {
  assets: 'battler_assets_v1',
  team: 'battler_team_v1',
  settings: 'battler_settings_v1',
  market: 'battler_market_v1',
} as const;

function read<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, data: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* quota */
  }
}

export const clientCache = {
  getAssets: () => read<AssetsResponse>(KEYS.assets),
  setAssets: (d: AssetsResponse) => write(KEYS.assets, d),
  getTeam: () => read<{ assetIds: string[] }>(KEYS.team),
  setTeam: (d: { assetIds: string[] }) => write(KEYS.team, d),
  getSettings: () => read<DasSettingsResponse>(KEYS.settings),
  setSettings: (d: DasSettingsResponse) => write(KEYS.settings, d),
  getMarket: () => read<{ cards: unknown[]; marketMode: string }>(KEYS.market),
  setMarket: (d: { cards: unknown[]; marketMode: string }) => write(KEYS.market, d),
  clearAll: () => {
    for (const k of Object.values(KEYS)) sessionStorage.removeItem(k);
  },
};

const inflight = new Map<string, Promise<unknown>>();

/** Dedupe concurrent identical API calls (tab switches often mount multiple hooks). */
export function dedupeFetch<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = inflight.get(key);
  if (hit) return hit as Promise<T>;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Warm fast endpoints after sign-in (assets handled by AppDataProvider). */
export async function warmSessionCaches(): Promise<void> {
  const { apiClient } = await import('./api');
  await Promise.allSettled([
    dedupeFetch('team', () => apiClient.getTeam().then((d) => { clientCache.setTeam(d); return d; })),
    dedupeFetch('settings', () => apiClient.getSettings().then((d) => { clientCache.setSettings(d); return d; })),
  ]);
}

/** Prefetch route data on nav hover/focus. */
export function prefetchRouteData(href: string, signedIn: boolean): void {
  if (!signedIn || typeof window === 'undefined') return;
  void import('./api').then(({ apiClient }) => {
    if (href === '/collection' || href === '/team' || href === '/battle') {
      if (!clientCache.getAssets()) {
        void dedupeFetch('assets', () =>
          apiClient.assets().then((d) => { clientCache.setAssets(d); return d; }),
        );
      }
    }
    if (href === '/team' || href === '/battle') {
      if (!clientCache.getTeam()) {
        void dedupeFetch('team', () =>
          apiClient.getTeam().then((d) => { clientCache.setTeam(d); return d; }),
        );
      }
    }
    if (href === '/settings') {
      if (!clientCache.getSettings()) {
        void dedupeFetch('settings', () =>
          apiClient.getSettings().then((d) => { clientCache.setSettings(d); return d; }),
        );
      }
    }
    if (href === '/market') {
      void dedupeFetch('market', () =>
        apiClient.marketList(1).then((r) => {
          clientCache.setMarket({ cards: r.cards, marketMode: r.marketMode });
          return r;
        }),
      );
    }
  });
}
