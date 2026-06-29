'use client';

import type { CollectionCard, UnsupportedAsset } from '@battler/das';
import type { BattleProfile, Negotiation } from '@battler/core';

const TOKEN_KEY = 'battler_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

async function api<T>(path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
  const token = getToken();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      ...init,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = (body as { error?: string }).error;
      if (res.status === 401 && token) {
        clearToken();
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('session-expired'));
        throw new Error('Your session expired — please sign in again.');
      }
      const isLocal =
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const hint =
        res.status === 500 && !err
          ? isLocal
            ? 'Backend offline — start Postgres with `pnpm dev:postgres` (Redis is optional), then refresh.'
            : 'Backend offline — DATABASE_URL must point to hosted Postgres on Vercel (Neon/Supabase). Run db/schema.sql once, redeploy, then refresh.'
          : err ?? `Request failed: ${res.status}`;
      throw new Error(hint);
    }
    return res.json() as Promise<T>;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Request timed out — check that Postgres and Redis are running, then try again.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export interface AssetsResponse {
  cards: CollectionCard[];
  profiles: Record<string, BattleProfile>;
  /** Other wallet assets that can't battle — shown in the Not-supported column. */
  unsupported: UnsupportedAsset[];
}

export type { UnsupportedAsset };

export type DasNetwork = 'devnet' | 'mainnet';

export interface DasSettingsResponse {
  mode: DasNetwork;
  cluster: 'mainnet-beta' | 'devnet';
  rpcConfigured: {
    mainnet: boolean;
    devnet: boolean;
    active: boolean;
  };
  canEditMode: boolean;
  /** Deprecated — always null; network is switchable in Settings. */
  lockedMode?: DasNetwork | null;
  supportedCollections: string[];
}

export interface SetSettingsInput {
  mode: DasNetwork;
}

export interface MockCard {
  assetId: string;
  ownerPubkey: string;
  name: string;
  attributes: { trait_type: string; value: string }[];
  image: string | null;
}


export interface AddCardInput {
  name: string;
  rarity?: string;
  grade?: string;
  gradingCompany?: string;
  year?: string;
  set?: string;
  cardNumber?: string;
  image?: string;
}

export interface TcgCard {
  id: string;
  name: string;
  number: string | null;
  rarity: string | null;
  set: string | null;
  year: string | null;
  image: string;
  thumb: string;
}

/** Marketplace card — devnet catalog or mainnet-owned inventory. */
export interface RosterCard {
  mint: string;
  name: string;
  image: string | null;
  speciesId: string | null;
  owner: string | null;
  spark: number[];
  changePct: number;
  listed: boolean;
  priceSol: number | null;
  buyUrl: string;
  explorerUrl: string;
  listingId?: string;
  stockRemaining?: number | null;
  stockTotal?: number | null;
  canBuyInApp?: boolean;
  phygitalsUrl?: string;
  magicEdenUrl?: string;
}

export interface CollectionStats {
  symbol: string;
  floorSol: number | null;
  listedCount: number | null;
  volumeAllSol: number | null;
  avgPrice24hrSol: number | null;
  floorSpark: number[];
  source: 'magiceden' | 'indicative';
  fetchedAt: number;
}

export const apiClient = {
  nonce: (pubkey: string) =>
    api<{ nonce: string; message: string }>(`/api/auth/nonce?pubkey=${encodeURIComponent(pubkey)}`),
  verify: (body: { pubkey: string; message: string; signature: string }) =>
    api<{ token: string; pubkey: string }>('/api/auth/verify', { method: 'POST', body: JSON.stringify(body) }),
  network: () =>
    api<{ mode: DasNetwork; cluster: 'mainnet-beta' | 'devnet'; onChain: boolean }>('/api/network'),
  assets: (refresh = false) =>
    api<AssetsResponse>(`/api/game/assets${refresh ? '?refresh=1' : ''}`, {}, refresh ? 90_000 : 12_000),
  getTeam: () => api<{ assetIds: string[] }>('/api/game/team'),
  setTeam: (assetIds: string[]) =>
    api<{ assetIds: string[] }>('/api/game/team', { method: 'PUT', body: JSON.stringify({ assetIds }) }),
  faucet: () => api<{ balance: number }>('/api/game/faucet', { method: 'POST' }),
  balance: () => api<{ pubkey: string; balance: number; rating: number }>('/api/game/balance'),
  challenge: (challengeePubkey: string, wager: unknown) =>
    api<{ challengeId: string; negotiation: Negotiation }>('/api/challenge', {
      method: 'POST',
      body: JSON.stringify({ challengeePubkey, wager }),
    }),
  pendingChallenges: () => api<{ challenges: Negotiation[] }>('/api/challenge'),
  getSettings: () => api<DasSettingsResponse>('/api/settings'),
  setSettings: (input: SetSettingsInput) =>
    api<DasSettingsResponse>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  testSettings: (input: { mode: DasNetwork }) =>
    api<{ ok: boolean; latencyMs: number; sampleAssets?: number; error?: string; mode: DasNetwork; endpoint: string }>(
      '/api/settings/test',
      { method: 'POST', body: JSON.stringify(input) },
    ),
  listMockCards: () => api<{ cards: MockCard[] }>('/api/game/mock-card'),
  addMockCard: (input: AddCardInput) =>
    api<{ card: MockCard; playable: boolean; speciesId: string | null; parseFailReason?: string }>(
      '/api/game/mock-card',
      { method: 'POST', body: JSON.stringify(input) },
    ),
  deleteMockCard: (assetId: string) =>
    api<{ ok: boolean }>(`/api/game/mock-card?assetId=${encodeURIComponent(assetId)}`, {
      method: 'DELETE',
    }),
  tcgSearch: (q: string) => api<{ cards: TcgCard[] }>(`/api/tcg/search?q=${encodeURIComponent(q)}`),
  marketList: (page = 1) =>
    api<{ page: number; cluster: string; cards: RosterCard[]; listedCount: number; marketMode: 'devnet' | 'mainnet-owned' }>(
      `/api/market/list?page=${page}`,
    ),
  marketStats: () => api<CollectionStats>('/api/market/stats'),
  devnetBuyTx: (listingId: string) =>
    api<{ txBase64: string; versioned: boolean; priceLamports: number; priceSol: number; listingId: string; listingName: string }>(
      '/api/market/devnet-buy',
      { method: 'POST', body: JSON.stringify({ listingId }) },
    ),
  devnetBuyConfirm: (listingId: string, signature: string) =>
    api<{ assetId: string; name: string; stockRemaining: number }>(
      '/api/market/devnet-confirm',
      { method: 'POST', body: JSON.stringify({ listingId, signature }) },
    ),
  marketBuyTx: (mint: string) =>
    api<{ txBase64: string; versioned: boolean; price: number }>('/api/market/buy-tx', {
      method: 'POST',
      body: JSON.stringify({ mint }),
    }),
  // ---- profile / username / friends ----
  getProfile: () => api<{ pubkey: string; username: string | null; rating: number }>('/api/profile'),
  setUsername: (username: string) =>
    api<{ ok: boolean; username: string }>('/api/profile', { method: 'POST', body: JSON.stringify({ username }) }),
  searchUsers: (q: string) =>
    api<{ users: PublicUser[] }>(`/api/users/search?q=${encodeURIComponent(q)}`),
  listFriends: () => api<{ friends: FriendItem[] }>('/api/friends'),
  addFriend: (input: { pubkey?: string; username?: string }) =>
    api<{ ok: boolean; friend: FriendItem }>('/api/friends', { method: 'POST', body: JSON.stringify(input) }),
  removeFriend: (pubkey: string) =>
    api<{ ok: boolean }>(`/api/friends?pubkey=${encodeURIComponent(pubkey)}`, { method: 'DELETE' }),
};

export interface PublicUser {
  pubkey: string;
  username: string | null;
  rating: number;
}
export interface FriendItem extends PublicUser {
  addedAt?: string;
}
