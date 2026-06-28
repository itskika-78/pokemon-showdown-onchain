/**
 * Fast collection read — Postgres + devnet inventory only (no Helius round-trip).
 * Used for instant UI; chain sync runs only on explicit ?refresh=1.
 */
import type { DasAsset } from '@battler/core';
import { MOCK_COLLECTION_MINT, summarizeAsset, summarizeUnsupported, type CollectionCard, type UnsupportedAsset } from '@battler/das';
import { assets as assetRepo, mockCards, type MockCardRow } from '@battler/repositories';

function mockRowToAsset(r: MockCardRow): DasAsset {
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

export async function loadOwnerCollectionFromDb(owner: string): Promise<{
  cards: CollectionCard[];
  unsupported: UnsupportedAsset[];
}> {
  const cards: CollectionCard[] = [];
  const unsupported: UnsupportedAsset[] = [];
  const seen = new Set<string>();

  for (const row of await assetRepo.listAssetsByOwner(owner)) {
    if (!row.rawMetadata) continue;
    seen.add(row.assetId);
    const summarized = summarizeAsset(row.rawMetadata);
    if (summarized.playable) {
      cards.push(summarized);
    } else {
      unsupported.push(summarizeUnsupported(row.rawMetadata, 'not_a_pokemon'));
    }
  }

  for (const row of await mockCards.listByOwner(owner)) {
    if (seen.has(row.assetId)) continue;
    const asset = mockRowToAsset(row);
    cards.push(summarizeAsset(asset));
  }

  return { cards, unsupported };
}
