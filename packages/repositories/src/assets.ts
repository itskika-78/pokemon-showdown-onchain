import type { CardAttributes, DasAsset } from '@battler/core';
import { query } from '@battler/server-kit';

export interface AssetRecord {
  assetId: string;
  ownerPubkey: string;
  collectionMint: string | null;
  cardName: string | null;
  rawMetadata: DasAsset | null;
  parsedAttributes: CardAttributes | null;
  playable: boolean;
  lastMetadataFetch: string | null;
  ownerNeedsReverify: boolean;
}

interface AssetDbRow {
  asset_id: string;
  owner_pubkey: string;
  collection_mint: string | null;
  card_name: string | null;
  raw_metadata: DasAsset | null;
  parsed_attributes: CardAttributes | null;
  playable: boolean;
  last_metadata_fetch: string | null;
  owner_needs_reverify: boolean;
}

function map(r: AssetDbRow): AssetRecord {
  return {
    assetId: r.asset_id,
    ownerPubkey: r.owner_pubkey,
    collectionMint: r.collection_mint,
    cardName: r.card_name,
    rawMetadata: r.raw_metadata,
    parsedAttributes: r.parsed_attributes,
    playable: r.playable,
    lastMetadataFetch: r.last_metadata_fetch,
    ownerNeedsReverify: r.owner_needs_reverify,
  };
}

export async function getAsset(assetId: string): Promise<AssetRecord | null> {
  const res = await query<AssetDbRow>('SELECT * FROM assets WHERE asset_id = $1', [assetId]);
  return res.rows[0] ? map(res.rows[0]) : null;
}

export async function listAssetsByOwner(owner: string): Promise<AssetRecord[]> {
  const res = await query<AssetDbRow>('SELECT * FROM assets WHERE owner_pubkey = $1 ORDER BY asset_id', [owner]);
  return res.rows.map(map);
}

export interface UpsertAssetInput {
  assetId: string;
  ownerPubkey: string;
  collectionMint: string | null;
  cardName: string | null;
  rawMetadata: DasAsset;
  parsedAttributes: CardAttributes;
  playable: boolean;
  /** When true, refresh the cached off-chain metadata timestamp. */
  refreshedMetadata: boolean;
}

export async function upsertAsset(a: UpsertAssetInput): Promise<void> {
  await query(
    `INSERT INTO assets
       (asset_id, owner_pubkey, collection_mint, card_name, raw_metadata, parsed_attributes,
        last_metadata_fetch, last_verified_at, owner_needs_reverify, playable)
     VALUES ($1,$2,$3,$4,$5,$6, $7, NOW(), FALSE, $8)
     ON CONFLICT (asset_id) DO UPDATE SET
       owner_pubkey = EXCLUDED.owner_pubkey,
       collection_mint = EXCLUDED.collection_mint,
       card_name = EXCLUDED.card_name,
       raw_metadata = CASE WHEN $9 THEN EXCLUDED.raw_metadata ELSE assets.raw_metadata END,
       parsed_attributes = CASE WHEN $9 THEN EXCLUDED.parsed_attributes ELSE assets.parsed_attributes END,
       last_metadata_fetch = CASE WHEN $9 THEN NOW() ELSE assets.last_metadata_fetch END,
       last_verified_at = NOW(),
       owner_needs_reverify = FALSE,
       playable = EXCLUDED.playable`,
    [
      a.assetId,
      a.ownerPubkey,
      a.collectionMint,
      a.cardName,
      JSON.stringify(a.rawMetadata),
      JSON.stringify(a.parsedAttributes),
      a.refreshedMetadata ? new Date().toISOString() : null,
      a.playable,
      a.refreshedMetadata,
    ],
  );
}

/** Metadata is effectively immutable; only refetch if never fetched or >24h old. */
export function metadataIsStale(lastFetchIso: string | null): boolean {
  if (!lastFetchIso) return true;
  return Date.now() - new Date(lastFetchIso).getTime() > 24 * 60 * 60 * 1000;
}

export async function updateOwner(assetId: string, owner: string): Promise<void> {
  await query(
    'UPDATE assets SET owner_pubkey = $2, last_verified_at = NOW(), owner_needs_reverify = FALSE WHERE asset_id = $1',
    [assetId, owner],
  );
}

export async function flagForReverify(assetId: string): Promise<void> {
  await query('UPDATE assets SET owner_needs_reverify = TRUE WHERE asset_id = $1', [assetId]);
}

export async function needsReverify(assetId: string): Promise<boolean> {
  const res = await query<{ owner_needs_reverify: boolean }>(
    'SELECT owner_needs_reverify FROM assets WHERE asset_id = $1',
    [assetId],
  );
  return res.rows[0]?.owner_needs_reverify ?? false;
}
