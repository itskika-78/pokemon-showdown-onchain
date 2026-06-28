import { collectionOf, nameOf, type DasAsset } from '@battler/core';
import { normalizeCardName } from '@battler/card-parser';
import { deriveBattleProfile, buildTeam, type PokemonSet } from '@battler/battle-engine';
import {
  extractAttributes,
  partitionWalletAssets,
  summarizeAsset,
  summarizeUnsupported,
  type CollectionCard,
  type UnsupportedAsset,
  type DasProvider,
} from '@battler/das';
import { assets, profiles, users } from '@battler/repositories';
import { loadServerConfig } from '@battler/server-kit';

/** The full picture of a wallet: battle-ready Pokémon + everything else it holds. */
export interface OwnerCollection {
  /** Playable Pokémon-card cNFTs in a supported collection (the battle roster). */
  cards: CollectionCard[];
  /** Non-battle assets: foreign NFTs, other cNFTs, energy/trainer cards. */
  unsupported: UnsupportedAsset[];
}

/**
 * Phase 1c + 3 pipeline: read *every* cNFT a wallet holds via DAS, split it into
 * the Pokémon cards we support (cached + derived into battle profiles) and the
 * "everything else" the wallet holds (shown in the collection's Not-supported
 * column — the goal: fetch all cNFTs, filter Pokémon vs others). Metadata is only
 * re-fetched when stale (>24h); ownership is always refreshed.
 */
export async function syncOwnerCollection(provider: DasProvider, owner: string): Promise<OwnerCollection> {
  const cfg = loadServerConfig();
  await users.ensureUser(owner); // satisfy assets.owner_pubkey FK

  const raw = await provider.getAssetsByOwner(owner);
  const { supported, unsupported } = partitionWalletAssets(raw, cfg.supportedCollections);

  const cards: CollectionCard[] = [];
  const others: UnsupportedAsset[] = unsupported.map(({ asset, reason }) =>
    summarizeUnsupported(asset, reason),
  );

  const processOne = async (asset: DasAsset): Promise<void> => {
    try {
      const existing = await assets.getAsset(asset.id);
      const refreshed = !existing || assets.metadataIsStale(existing.lastMetadataFetch);
      const attrs = extractAttributes(asset);
      const normalized = normalizeCardName(nameOf(asset));

      await assets.upsertAsset({
        assetId: asset.id,
        ownerPubkey: owner,
        collectionMint: collectionOf(asset) ?? null,
        cardName: nameOf(asset),
        rawMetadata: asset,
        parsedAttributes: attrs,
        playable: normalized.playable,
        refreshedMetadata: refreshed,
      });

      if (normalized.playable && normalized.speciesId) {
        const current = await profiles.profileIsCurrent(asset.id, cfg.derivationVersion);
        if (!current) {
          try {
            const derived = await deriveBattleProfile(asset.id, normalized, attrs, {
              derivationVersion: cfg.derivationVersion,
              format: cfg.battleFormat,
            });
            await profiles.upsertProfile(derived.profile);
          } catch {
            // species not derivable in this format — leave it as a parsed-but-unprofiled card
          }
        }

        cards.push(summarizeAsset(asset));
      } else {
        others.push(summarizeUnsupported(asset, 'not_a_pokemon'));
      }
    } catch (err) {
      console.error(`[ingest] failed to process asset ${asset.id}:`, err instanceof Error ? err.message : err);
      others.push(summarizeUnsupported(asset, 'wrong_collection'));
    }
  };

  await Promise.all(supported.map((asset) => processOne(asset)));
  return { cards, unsupported: others };
}

/**
 * Back-compat shim: the battle-ready card rows only. Prefer `syncOwnerCollection`
 * when you also need the wallet's other (non-supported) assets.
 */
export async function syncOwnerAssets(provider: DasProvider, owner: string): Promise<CollectionCard[]> {
  return (await syncOwnerCollection(provider, owner)).cards;
}

export interface ReverifyResult {
  ok: boolean;
  owner: string | null;
  frozen: boolean;
  reason?: 'not_found' | 'owner_changed' | 'frozen';
}

/**
 * Re-verify a single card's on-chain ownership (the plans: "re-verify at battle
 * start / settlement — the user may have sold the card 30 seconds ago"). Updates
 * the cached owner and returns whether it still belongs to `expectedOwner` and
 * is not frozen.
 */
export async function reverifyOwnership(
  provider: DasProvider,
  assetId: string,
  expectedOwner: string,
): Promise<ReverifyResult> {
  const asset = await provider.getAsset(assetId);
  if (!asset) return { ok: false, owner: null, frozen: false, reason: 'not_found' };

  const owner = asset.ownership.owner;
  if (owner !== expectedOwner) {
    await assets.updateOwner(assetId, owner);
    return { ok: false, owner, frozen: asset.ownership.frozen, reason: 'owner_changed' };
  }
  if (asset.ownership.frozen) {
    return { ok: false, owner, frozen: true, reason: 'frozen' };
  }
  await assets.updateOwner(assetId, owner);
  return { ok: true, owner, frozen: false };
}

/** Re-verify every card in a team; returns the first failure (or ok). */
export async function reverifyTeam(
  provider: DasProvider,
  assetIds: string[],
  expectedOwner: string,
): Promise<{ ok: boolean; failure?: { assetId: string } & ReverifyResult }> {
  for (const assetId of assetIds) {
    const r = await reverifyOwnership(provider, assetId, expectedOwner);
    if (!r.ok) return { ok: false, failure: { assetId, ...r } };
  }
  return { ok: true };
}

/** Build a packed, sim-ready team from a list of (already-derived) asset IDs. */
export async function buildPackedTeam(assetIds: string[]): Promise<PokemonSet[]> {
  const list = await profiles.getProfiles(assetIds);
  return buildTeam(list);
}

export * from './provider.js';
export type { CollectionCard, UnsupportedAsset, DasProvider, DasAsset };
