/**
 * Solana DAS (Digital Asset Standard) types — the shape Helius `getAssetsByOwner`
 * and `getAsset` return. cNFTs (compressed NFTs, Bubblegum/Merkle-tree) are only
 * visible through DAS; standard Solana RPC cannot see them.
 *
 * This is intentionally permissive: real platforms (Phygitals, Collector Crypt,
 * Courtyard) carry slightly different attribute schemas, so the parser
 * (@battler/parser) is built against the observed `content.metadata` rather than
 * assuming a fixed set of trait keys. See docs/PHYGITALS-DISCOVERY.md.
 */

export interface DasAttribute {
  trait_type?: string;
  value?: string | number | boolean | null;
}

export interface DasFile {
  uri?: string;
  cdn_uri?: string;
  mime?: string;
}

export interface DasContent {
  $schema?: string;
  json_uri?: string;
  files?: DasFile[];
  metadata?: {
    name?: string;
    symbol?: string;
    description?: string;
    attributes?: DasAttribute[];
    token_standard?: string;
  };
  links?: {
    image?: string;
    external_url?: string;
  };
}

export interface DasGrouping {
  group_key: string; // usually "collection"
  group_value: string; // collection mint address
}

export interface DasAuthority {
  address: string;
  scopes?: string[];
}

export interface DasCompression {
  compressed: boolean;
  eligible?: boolean;
  data_hash?: string;
  creator_hash?: string;
  asset_hash?: string;
  tree?: string;
  seq?: number;
  leaf_id?: number;
}

/**
 * Ownership / security flags. At battle start we MUST re-verify
 * `ownership.owner === playerWallet` and ideally `frozen === false`, because the
 * user may have sold or moved the card seconds before the match.
 */
export interface DasOwnership {
  owner: string;
  frozen: boolean;
  delegated: boolean;
  delegate?: string | null;
  ownership_model?: string;
}

export type DasInterface =
  | 'V1_NFT' // standard + compressed NFTs
  | 'ProgrammableNFT' // pNFTs (e.g. Collector Crypt)
  | 'V1_PRINT'
  | 'LEGACY_NFT'
  | 'FungibleToken'
  | 'FungibleAsset'
  | 'Custom'
  | 'Identity'
  | 'Executable'
  | (string & {});

export interface DasAsset {
  id: string; // unique per cNFT — our primary key for everything
  interface: DasInterface;
  content?: DasContent;
  authorities?: DasAuthority[];
  compression?: DasCompression;
  grouping?: DasGrouping[];
  ownership: DasOwnership;
  mutable?: boolean;
  burnt?: boolean;
}

export interface GetAssetsByOwnerResult {
  total: number;
  limit: number;
  page?: number;
  cursor?: string;
  items: DasAsset[];
}

/** Convenience accessor: the collection mint of an asset, if grouped. */
export function collectionOf(asset: DasAsset): string | undefined {
  return asset.grouping?.find((g) => g.group_key === 'collection')?.group_value;
}

/** Convenience accessor: the display name pulled from on/off-chain metadata. */
export function nameOf(asset: DasAsset): string {
  return asset.content?.metadata?.name?.trim() ?? '';
}

/** Convenience accessor: the best available image URL (prefer CDN mirror). */
export function imageOf(asset: DasAsset): string | undefined {
  const files = asset.content?.files ?? [];
  const withCdn = files.find((f) => f.cdn_uri);
  if (withCdn?.cdn_uri) return withCdn.cdn_uri;
  const img = asset.content?.links?.image;
  if (img) return img;
  return files.find((f) => f.uri)?.uri;
}
