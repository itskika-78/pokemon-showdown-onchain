import type { DasAsset, GetAssetsByOwnerResult } from '@battler/core';
import type { DasProvider } from './provider.js';

type FetchLike = typeof fetch;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Result of probing a Helius DAS endpoint (used by the Settings "Test connection"). */
export interface DasProbeResult {
  ok: boolean;
  /** Round-trip latency of the probe RPC call, ms. */
  latencyMs: number;
  /** Number of assets returned for the probe wallet (sanity signal). */
  sampleAssets?: number;
  error?: string;
}

/**
 * Real Helius DAS provider. `getAssetsByOwner` is page-based: per the Helius
 * docs you page "until the results for page are less than 1000 (the max limit
 * per request)". Compressed and uncompressed assets come through the same
 * endpoint, so this transparently returns cNFTs.
 *
 * Transient failures (HTTP 429/5xx, network blips, timeouts) are retried with
 * exponential backoff + jitter so a momentarily rate-limited RPC doesn't blow up
 * a wallet sync or matchmaking ownership re-verify.
 */
export class HeliusDasProvider implements DasProvider {
  constructor(
    private readonly rpcUrl: string,
    private readonly fetchImpl: FetchLike = fetch,
    /** Per-request timeout so a hung/rate-limited RPC can't block matchmaking. */
    private readonly timeoutMs = 12_000,
    /** Max attempts (1 = no retry) for transient errors. */
    private readonly maxAttempts = 3,
  ) {
    if (!rpcUrl) throw new Error('HeliusDasProvider requires an RPC URL');
  }

  /** A single RPC call with an AbortController timeout. Throws a tagged error. */
  private async rpcOnce<T>(method: string, params: unknown): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'battler', method, params }),
        signal: ctrl.signal,
      });
    } catch (e) {
      const reason = e instanceof Error && e.name === 'AbortError' ? 'timed out' : 'network error';
      const err = new Error(`Helius ${method} ${reason}`);
      (err as { transient?: boolean }).transient = true;
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const err = new Error(`Helius ${method} HTTP ${res.status}`);
      // 429 (rate limit) and 5xx (upstream) are worth retrying; 4xx (bad key/req) are not.
      (err as { transient?: boolean }).transient = res.status === 429 || res.status >= 500;
      throw err;
    }
    const json = (await res.json()) as { result?: T; error?: { message?: string } | unknown };
    if (json.error) {
      const msg = typeof json.error === 'object' && json.error && 'message' in json.error
        ? String((json.error as { message?: unknown }).message)
        : JSON.stringify(json.error);
      throw new Error(`Helius ${method} error: ${msg}`);
    }
    return json.result as T;
  }

  /** Retry wrapper: backoff + jitter on transient errors only. */
  private async rpc<T>(method: string, params: unknown): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await this.rpcOnce<T>(method, params);
      } catch (e) {
        lastErr = e;
        const transient = (e as { transient?: boolean }).transient === true;
        if (!transient || attempt === this.maxAttempts) throw e;
        const backoff = Math.min(2000, 250 * 2 ** (attempt - 1));
        await sleep(backoff + Math.floor(Math.random() * 150));
      }
    }
    throw lastErr;
  }

  async getAssetsByOwner(owner: string): Promise<DasAsset[]> {
    const limit = 1000;
    const all: DasAsset[] = [];
    for (let page = 1; page <= 100; page++) {
      const result = await this.rpc<GetAssetsByOwnerResult>('getAssetsByOwner', {
        ownerAddress: owner,
        page,
        limit,
        displayOptions: { showCollectionMetadata: true },
      });
      const items = result?.items ?? [];
      all.push(...items);
      if (items.length < limit) break; // last page
    }
    return all;
  }

  async getAsset(assetId: string): Promise<DasAsset | null> {
    const result = await this.rpc<DasAsset | null>('getAsset', { id: assetId });
    return result ?? null;
  }

  /** A page of a collection's real on-chain assets (the marketplace roster). */
  async getAssetsByGroup(collection: string, page = 1, limit = 24): Promise<DasAsset[]> {
    const result = await this.rpc<GetAssetsByOwnerResult>('getAssetsByGroup', {
      groupKey: 'collection',
      groupValue: collection,
      page,
      limit,
    });
    return result?.items ?? [];
  }

  /**
   * Lightweight DAS connectivity probe for the Settings "Test connection" button:
   * issues one `getAssetsByOwner` (limit 1) against a known active wallet and
   * reports latency. A method-not-found / 4xx surfaces a clear, non-retried error
   * (bad key, DAS not enabled, wrong host) instead of silently failing later.
   */
  async probe(probeWallet = 'GjwcWFQYzemBtpUoN5fMAP2FZviTtMRWCmrppGuTthJS'): Promise<DasProbeResult> {
    const started = Date.now();
    try {
      const result = await this.rpcOnce<GetAssetsByOwnerResult>('getAssetsByOwner', {
        ownerAddress: probeWallet,
        page: 1,
        limit: 1,
      });
      return { ok: true, latencyMs: Date.now() - started, sampleAssets: result?.items?.length ?? 0 };
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
