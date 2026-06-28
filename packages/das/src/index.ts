import type { DasAsset } from '@battler/core';
import { collectionOf, imageOf, nameOf } from '@battler/core';
import { normalizeCardName } from '@battler/card-parser';
import { extractAttributes } from './attributes.js';
import { HeliusDasProvider } from './helius.js';
import { MockDasProvider } from './mock.js';
import type { DasProvider } from './provider.js';

export { extractAttributes } from './attributes.js';
export { HeliusDasProvider, type DasProbeResult } from './helius.js';
export { MockDasProvider, MOCK_COLLECTION_MINT } from './mock.js';
export type { DasProvider } from './provider.js';

/** Probe a Helius DAS endpoint for connectivity + latency (Settings test button). */
export async function probeDasEndpoint(rpcUrl: string): Promise<import('./helius.js').DasProbeResult> {
  if (!rpcUrl) return { ok: false, latencyMs: 0, error: 'No RPC URL configured' };
  return new HeliusDasProvider(rpcUrl, fetch, 8_000, 1).probe();
}

/** The denormalized card row the client/collection screen consumes. */
export interface CollectionCard {
  assetId: string;
  cardName: string;
  cardImageUrl: string | null;
  collectionMint: string | null;
  grade: string | null;
  gradingCompany: string | null;
  set: string | null;
  cardNumber: string | null;
  rarity: string | null;
  year: string | null;
  speciesId: string | null;
  playable: boolean;
}

/** Why a wallet asset is not usable as a battle Pokémon. */
export type UnsupportedReason =
  | 'wrong_collection' // a cNFT, but not in a supported Pokémon-card collection
  | 'not_compressed' // a regular (non-compressed) NFT — not a Phygitals cNFT
  | 'not_a_pokemon'; // in a supported collection but the name isn't a battle species (energy/trainer)

/**
 * A wallet asset that can't enter battle — shown in the collection's
 * "Not supported" column so users see *everything* the wallet holds, not a
 * silently-filtered subset. (The goal: fetch all cNFTs, split Pokémon vs others.)
 */
export interface UnsupportedAsset {
  assetId: string;
  name: string;
  image: string | null;
  collectionMint: string | null;
  interface: string;
  compressed: boolean;
  reason: UnsupportedReason;
}

/** Build the "Not supported" row shown in the collection's other-assets column. */
export function summarizeUnsupported(asset: DasAsset, reason: UnsupportedReason): UnsupportedAsset {
  return {
    assetId: asset.id,
    name: nameOf(asset) || '(unnamed asset)',
    image: imageOf(asset) ?? null,
    collectionMint: collectionOf(asset) ?? null,
    interface: asset.interface,
    compressed: asset.compression?.compressed === true,
    reason,
  };
}

/** Fungible interfaces are tokens, not collectible cards — never shown as assets. */
const FUNGIBLE_INTERFACES = new Set(['FungibleToken', 'FungibleAsset']);

/**
 * Split a wallet's raw DAS assets into the Pokémon-card cNFTs we support and the
 * "everything else" the wallet holds (other cNFTs, regular NFTs). Burnt assets
 * and fungible tokens are dropped entirely. An empty `supported` set treats any
 * collection as supported (dev convenience).
 */
export function partitionWalletAssets(
  assets: DasAsset[],
  supported: ReadonlySet<string>,
): { supported: DasAsset[]; unsupported: { asset: DasAsset; reason: UnsupportedReason }[] } {
  const inCollection: DasAsset[] = [];
  const others: { asset: DasAsset; reason: UnsupportedReason }[] = [];
  for (const a of assets) {
    if (a.burnt === true) continue;
    if (FUNGIBLE_INTERFACES.has(a.interface)) continue;
    const compressed = a.compression?.compressed === true;
    const collectionOk =
      supported.size === 0 ||
      (a.grouping?.some((g) => g.group_key === 'collection' && supported.has(g.group_value)) ?? false);
    if (compressed && collectionOk) {
      inCollection.push(a);
    } else {
      others.push({ asset: a, reason: compressed ? 'wrong_collection' : 'not_compressed' });
    }
  }
  return { supported: inCollection, unsupported: others };
}

/** Combine DAS metadata + card-name parsing into a client-facing card row. */
export function summarizeAsset(asset: DasAsset): CollectionCard {
  const attrs = extractAttributes(asset);
  const normalized = normalizeCardName(nameOf(asset));
  return {
    assetId: asset.id,
    cardName: nameOf(asset),
    cardImageUrl: imageOf(asset) ?? null,
    collectionMint: collectionOf(asset) ?? null,
    grade: attrs.grade,
    gradingCompany: attrs.gradingCompany,
    set: attrs.set,
    cardNumber: attrs.cardNumber,
    rarity: attrs.rarity,
    year: attrs.year,
    speciesId: normalized.speciesId,
    playable: normalized.playable,
  };
}

/**
 * Filter a wallet's assets to playable Phygitals cards: must be a non-burnt cNFT
 * (compressed) in a supported collection. An empty `supported` set accepts any
 * collection (dev convenience; in prod populate PHYGITALS_COLLECTION_MINTS with
 * BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM).
 */
export function filterSupportedCollections(
  assets: DasAsset[],
  supported: ReadonlySet<string>,
): DasAsset[] {
  return assets.filter((a) => {
    if (a.compression?.compressed !== true) return false; // must be a cNFT
    if (a.burnt === true) return false;
    if (supported.size === 0) return true;
    return a.grouping?.some((g) => g.group_key === 'collection' && supported.has(g.group_value)) ?? false;
  });
}

/** One-line swap between mock (dev) and real Helius (prod). */
export function createDasProvider(opts: { useMock?: boolean; rpcUrl?: string }): DasProvider {
  if (opts.useMock || !opts.rpcUrl) return new MockDasProvider();
  return new HeliusDasProvider(opts.rpcUrl);
}
