/**
 * Marketplace data — mode-aware:
 *  - devnet: limited-stock trending catalog (devnet SOL purchases)
 *  - mainnet: user's owned cNFTs only, external buy links (Phygitals / Magic Eden)
 */
import { getRedis, clusterForNetwork } from '@battler/server-kit';
import { getEffectiveDasSettings } from '@battler/ingest';
import { devnetMarket } from '@battler/repositories';
import { loadOwnerCollectionFromDb } from './collectionFast';
import { changePct, getCollectionStats, trendSeries, type CollectionStats } from './marketStats';

export type { CollectionStats };
export { getCollectionStats, changePct, trendSeries };

const LAMPORTS_PER_SOL = 1_000_000_000;
const ROSTER_CACHE_TTL = 120;
const rosterMem = new Map<string, { at: number; data: string }>();

async function getRosterCache(key: string): Promise<{ cards: RosterCard[]; cluster: string; listedCount: number; marketMode: 'devnet' | 'mainnet-owned' } | null> {
  const m = rosterMem.get(key);
  if (m && Date.now() - m.at < ROSTER_CACHE_TTL * 1000) {
    return JSON.parse(m.data) as ReturnType<typeof getMarketRoster> extends Promise<infer R> ? R : never;
  }
  try {
    const raw = await getRedis().get(key);
    if (raw) {
      rosterMem.set(key, { at: Date.now(), data: raw });
      return JSON.parse(raw) as { cards: RosterCard[]; cluster: string; listedCount: number; marketMode: 'devnet' | 'mainnet-owned' };
    }
  } catch { /* optional */ }
  return null;
}

async function setRosterCache(key: string, data: unknown): Promise<void> {
  const json = JSON.stringify(data);
  rosterMem.set(key, { at: Date.now(), data: json });
  try {
    await getRedis().set(key, json, 'EX', ROSTER_CACHE_TTL);
  } catch { /* optional */ }
}

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
  /** Devnet catalog listing id (for in-app purchase). */
  listingId?: string;
  /** Remaining stock (devnet catalog only). */
  stockRemaining?: number | null;
  stockTotal?: number | null;
  /** Whether the app can build a buy transaction. */
  canBuyInApp: boolean;
  phygitalsUrl?: string;
  magicEdenUrl?: string;
}

const lamToSol = (l: number) => Math.round((l / LAMPORTS_PER_SOL) * 1000) / 1000;

/** Devnet marketplace — limited stock, devnet SOL. */
async function getDevnetMarketRoster(): Promise<{ cards: RosterCard[]; cluster: string; listedCount: number }> {
  const eff = await getEffectiveDasSettings();
  const cluster = clusterForNetwork(eff.mode);
  const floor = await getCollectionStats().then((s) => s.floorSol ?? 0.15).catch(() => 0.15);
  const catalog = await devnetMarket.listCatalog();

  const cards: RosterCard[] = catalog.map((item) => {
    const priceSol = lamToSol(item.priceLamports);
    const spark = trendSeries(`devnet:${item.listingId}`, priceSol, 30, 0.14);
    return {
      mint: item.listingId,
      listingId: item.listingId,
      name: item.name,
      image: item.image,
      speciesId: item.speciesId,
      owner: null,
      spark,
      changePct: changePct(spark),
      listed: item.stockRemaining > 0,
      priceSol,
      stockRemaining: item.stockRemaining,
      stockTotal: item.stockTotal,
      canBuyInApp: item.stockRemaining > 0,
      buyUrl: '',
      explorerUrl: '',
      phygitalsUrl: item.phygitalsUrl ?? 'https://phygitals.com/marketplace',
      magicEdenUrl: item.magicEdenUrl ?? 'https://magiceden.io/marketplace/phygitals',
    };
  });

  cards.sort((a, b) => Number(b.listed) - Number(a.listed));
  return { cards, cluster, listedCount: cards.filter((c) => c.listed).length };
}

/** Mainnet — owned cards from Postgres cache (no Helius on list). */
async function getMainnetOwnedRoster(
  ownerPubkey: string,
  limit = 24,
): Promise<{ cards: RosterCard[]; cluster: string; listedCount: number }> {
  const eff = await getEffectiveDasSettings();
  const cluster = clusterForNetwork(eff.mode);
  const floor = await getCollectionStats().then((s) => s.floorSol ?? 1.5).catch(() => 1.5);

  const { cards: dbCards } = await loadOwnerCollectionFromDb(ownerPubkey);
  const pokemon = dbCards.filter((c) => c.playable).slice(0, limit);

  const cards: RosterCard[] = pokemon.map((c) => {
    const spark = trendSeries(`owned:${c.assetId}`, floor, 30, 0.12);
    const meUrl = `https://magiceden.io/item-details/${c.assetId}`;
    return {
      mint: c.assetId,
      name: c.cardName,
      image: c.cardImageUrl,
      speciesId: c.speciesId,
      owner: ownerPubkey,
      spark,
      changePct: changePct(spark),
      listed: false,
      priceSol: null,
      canBuyInApp: false,
      buyUrl: meUrl,
      explorerUrl: `https://explorer.solana.com/address/${c.assetId}`,
      phygitalsUrl: 'https://phygitals.com/marketplace',
      magicEdenUrl: meUrl,
    };
  });

  return { cards, cluster, listedCount: 0 };
}

export async function getMarketRoster(
  ownerPubkey: string,
  page = 1,
  limit = 24,
): Promise<{ cards: RosterCard[]; cluster: string; listedCount: number; marketMode: 'devnet' | 'mainnet-owned' }> {
  const eff = await getEffectiveDasSettings();
  const cacheKey = eff.mode === 'devnet' ? 'market:roster:devnet' : `market:roster:${ownerPubkey}`;
  const hit = await getRosterCache(cacheKey);
  if (hit) return hit;

  let result: { cards: RosterCard[]; cluster: string; listedCount: number; marketMode: 'devnet' | 'mainnet-owned' };
  if (eff.mode === 'devnet') {
    const r = await getDevnetMarketRoster();
    result = { ...r, marketMode: 'devnet' };
  } else {
    const r = await getMainnetOwnedRoster(ownerPubkey, limit);
    result = { ...r, marketMode: 'mainnet-owned' };
  }
  void setRosterCache(cacheKey, result);
  return result;
}
