import type { DasAsset } from '@battler/core';

/**
 * The single seam for reading cNFTs. The web/battle services depend only on this
 * interface; swapping the mock for real Helius is "one line" (see
 * createDasProvider). cNFTs are ONLY visible through DAS — standard Solana RPC
 * cannot see them.
 */
export interface DasProvider {
  getAssetsByOwner(owner: string): Promise<DasAsset[]>;
  getAsset(assetId: string): Promise<DasAsset | null>;
  /** Page through a collection's assets (the real marketplace roster). */
  getAssetsByGroup?(collection: string, page?: number, limit?: number): Promise<DasAsset[]>;
}
