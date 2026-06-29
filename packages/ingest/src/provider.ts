import type { DasAsset } from '@battler/core';
import {
  createDasProvider,
  MOCK_COLLECTION_MINT,
  type DasProvider,
} from '@battler/das';
import { getDasSettings, loadServerConfig, type DasNetwork } from '@battler/server-kit';
import { mockCards, type MockCardRow } from '@battler/repositories';

/** Build a DAS asset from a devnet inventory card (purchased or manually added). */
function customToAsset(r: MockCardRow): DasAsset {
  return {
    id: r.assetId,
    interface: 'V1_NFT',
    compression: { compressed: true, tree: 'DevnetTree11111111111111111111111111', leaf_id: 0 },
    content: {
      json_uri: '',
      metadata: { name: r.name, attributes: r.attributes },
      files: r.image ? [{ uri: r.image, cdn_uri: r.image }] : [],
      links: r.image ? { image: r.image } : {},
    },
    grouping: [{ group_key: 'collection', group_value: MOCK_COLLECTION_MINT }],
    ownership: { owner: r.ownerPubkey, frozen: false, delegated: false, delegate: null },
    authorities: [{ address: 'DevnetUpdateAuthority1111111111111111111', scopes: ['full'] }],
    mutable: true,
    burnt: false,
  };
}

/** Devnet provider: real Helius DAS + Postgres devnet inventory cards. */
class DevnetMergedProvider implements DasProvider {
  constructor(private readonly helius: DasProvider) {}

  async getAssetsByOwner(owner: string): Promise<DasAsset[]> {
    const [chain, custom] = await Promise.all([
      this.helius.getAssetsByOwner(owner).catch(() => []),
      mockCards.listByOwner(owner),
    ]);
    const chainIds = new Set(chain.map((a) => a.id));
    const merged = [...chain];
    for (const row of custom) {
      if (!chainIds.has(row.assetId)) merged.push(customToAsset(row));
    }
    return merged;
  }

  async getAsset(assetId: string): Promise<DasAsset | null> {
    if (assetId.startsWith('custom_') || assetId.startsWith('devnet_')) {
      const r = await mockCards.getById(assetId);
      return r ? customToAsset(r) : null;
    }
    return this.helius.getAsset(assetId);
  }

  getAssetsByGroup(collection: string, page?: number, limit?: number): Promise<DasAsset[]> {
    return this.helius.getAssetsByGroup?.(collection, page, limit) ?? Promise.resolve([]);
  }
}

export interface EffectiveDasSettings {
  mode: DasNetwork;
  /** Resolved RPC URL for mainnet (stored override → env default). */
  heliusRpcUrl?: string;
  /** Resolved RPC URL for devnet (stored override → env default). */
  heliusDevnetRpcUrl?: string;
  /** The RPC URL for the *active* network. */
  activeRpcUrl?: string;
  source: 'redis' | 'env';
}

let settingsCache: { at: number; value: EffectiveDasSettings } | undefined;
const SETTINGS_CACHE_MS = 5_000;

/** Current effective DAS config: mode from Redis, RPC URLs from env only. */
export async function getEffectiveDasSettings(): Promise<EffectiveDasSettings> {
  const now = Date.now();
  if (settingsCache && now - settingsCache.at < SETTINGS_CACHE_MS) {
    return settingsCache.value;
  }

  const cfg = loadServerConfig();
  const redisMode = await getDasSettings();
  /** Redis override from Settings; falls back to DAS_MODE env default. */
  const mode: DasNetwork = redisMode ?? cfg.dasMode;
  const heliusRpcUrl = cfg.heliusRpcUrl;
  const heliusDevnetRpcUrl = cfg.heliusDevnetRpcUrl;
  const activeRpcUrl = mode === 'mainnet' ? heliusRpcUrl : heliusDevnetRpcUrl;
  const value: EffectiveDasSettings = {
    mode,
    heliusRpcUrl,
    heliusDevnetRpcUrl,
    activeRpcUrl,
    source: redisMode ? 'redis' : 'env',
  };
  settingsCache = { at: now, value };
  return value;
}

let cache: { sig: string; provider: DasProvider } | undefined;

/**
 * Resolve the DAS provider from current runtime settings:
 * devnet → Helius + devnet inventory merge; mainnet → Helius only.
 */
export async function getConfiguredProvider(): Promise<DasProvider> {
  const eff = await getEffectiveDasSettings();
  const sig = `${eff.mode}|${eff.activeRpcUrl ?? ''}`;
  if (cache?.sig === sig) return cache.provider;

  if (!eff.activeRpcUrl) {
    throw new Error(`No Helius RPC URL configured for ${eff.mode}. Set HELIUS_${eff.mode === 'mainnet' ? 'RPC' : 'DEVNET_RPC'}_URL.`);
  }

  const helius = createDasProvider({ useMock: false, rpcUrl: eff.activeRpcUrl });
  const provider = eff.mode === 'devnet' ? new DevnetMergedProvider(helius) : helius;
  cache = { sig, provider };
  return provider;
}

/** Clear provider cache (e.g. after settings change). */
export function resetProviderCache(): void {
  cache = undefined;
  settingsCache = undefined;
}
