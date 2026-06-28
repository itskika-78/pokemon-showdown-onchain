/**
 * Metaplex Bubblegum compressed-NFT (cNFT) transfer.
 *
 * This is the on-chain primitive behind *card* wagers: a staked Phygitals card
 * is a Bubblegum cNFT, so settling a card stake means transferring that leaf
 * from the escrow wallet to the winner (or back to the staker on a void). We
 * build the `transfer` instruction by hand against the well-known program IDs —
 * no umi/metaplex dependency — so it stays pure, offline-buildable, and fully
 * unit-testable. The Merkle proof + leaf hashes come from Helius DAS
 * (`getAsset` + `getAssetProof`), assembled here as `getAssetWithProof`.
 *
 * Custodial model (mirrors the SOL escrow): the staker first transfers the cNFT
 * to the escrow wallet (deposit), the escrow holds it during the battle, then
 * the escrow signs the payout transfer to the winner at settlement.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { createHash } from 'node:crypto';

// Well-known program IDs (stable across mainnet + devnet).
export const BUBBLEGUM_PROGRAM_ID = new PublicKey('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
export const SPL_NOOP_PROGRAM_ID = new PublicKey('noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV');
export const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK');

/** 8-byte Anchor instruction discriminator: sha256("global:<name>")[0..8]. */
export function anchorDiscriminator(name: string): Buffer {
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}

/** Discriminator for Bubblegum's `transfer` instruction. */
export const TRANSFER_DISCRIMINATOR = anchorDiscriminator('transfer');

/** Bubblegum tree-authority PDA = findPDA([merkleTree], bubblegum). */
export function deriveTreeAuthority(merkleTree: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([merkleTree.toBuffer()], BUBBLEGUM_PROGRAM_ID)[0];
}

/**
 * Everything needed to build a Bubblegum transfer, sourced from DAS. All hashes
 * are base58 as DAS returns them; `proof` is the root-excluded sibling path.
 */
export interface CnftTransferData {
  assetId: string;
  merkleTree: string;
  /** Current Merkle root (base58) — from getAssetProof. */
  root: string;
  /** Leaf data hash (base58) — from getAsset.compression. */
  dataHash: string;
  /** Leaf creator hash (base58) — from getAsset.compression. */
  creatorHash: string;
  /** Leaf id; serves as both the Bubblegum `nonce` (u64) and `index` (u32). */
  leafId: number;
  /** Current leaf owner (base58). */
  owner: string;
  /** Current leaf delegate (base58); defaults to the owner when unset. */
  delegate?: string | null;
  /** Sibling proof path (base58 node pubkeys), root excluded. */
  proof: string[];
}

function u64le(n: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}
function u32le(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
}
function hash32(b58: string, label: string): Buffer {
  const buf = Buffer.from(bs58.decode(b58));
  if (buf.length !== 32) throw new Error(`${label} must decode to 32 bytes, got ${buf.length}`);
  return buf;
}

/**
 * Build the Bubblegum `transfer` instruction moving the leaf from its current
 * owner to `newOwner`. The signer is the current owner (or delegate, if one is
 * set and differs) — for the escrow payout that's the escrow keypair.
 *
 * `canopyDepth` truncates the proof by the tree's on-chain canopy so large trees
 * still fit in one transaction; default 0 sends the full proof.
 */
export function buildBubblegumTransferIx(
  d: CnftTransferData,
  newOwner: string,
  canopyDepth = 0,
): TransactionInstruction {
  const merkleTree = new PublicKey(d.merkleTree);
  const leafOwner = new PublicKey(d.owner);
  const leafDelegate = new PublicKey(d.delegate ?? d.owner);
  const newLeafOwner = new PublicKey(newOwner);
  const treeAuthority = deriveTreeAuthority(merkleTree);

  // When a distinct delegate is set, the delegate is the authorized signer;
  // otherwise the owner signs. Exactly one of the two is a signer.
  const delegateSigns = leafDelegate.toBase58() !== leafOwner.toBase58();

  const proofPath = d.proof.slice(0, Math.max(0, d.proof.length - canopyDepth));
  const proofAccounts = proofPath.map((p) => ({
    pubkey: new PublicKey(p),
    isSigner: false,
    isWritable: false,
  }));

  const keys = [
    { pubkey: treeAuthority, isSigner: false, isWritable: false },
    { pubkey: leafOwner, isSigner: !delegateSigns, isWritable: false },
    { pubkey: leafDelegate, isSigner: delegateSigns, isWritable: false },
    { pubkey: newLeafOwner, isSigner: false, isWritable: false },
    { pubkey: merkleTree, isSigner: false, isWritable: true },
    { pubkey: SPL_NOOP_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ...proofAccounts,
  ];

  const data = Buffer.concat([
    TRANSFER_DISCRIMINATOR,
    hash32(d.root, 'root'),
    hash32(d.dataHash, 'dataHash'),
    hash32(d.creatorHash, 'creatorHash'),
    u64le(d.leafId), // nonce
    u32le(d.leafId), // index
  ]);

  return new TransactionInstruction({ programId: BUBBLEGUM_PROGRAM_ID, keys, data });
}

type FetchLike = typeof fetch;

async function dasRpc<T>(rpcUrl: string, method: string, params: unknown, fetchImpl: FetchLike): Promise<T> {
  const res = await fetchImpl(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'cnft', method, params }),
  });
  if (!res.ok) throw new Error(`DAS ${method} HTTP ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(`DAS ${method} error: ${json.error.message ?? 'unknown'}`);
  if (json.result == null) throw new Error(`DAS ${method} returned no result`);
  return json.result;
}

interface DasAssetCompression {
  compressed?: boolean;
  data_hash?: string;
  creator_hash?: string;
  leaf_id?: number;
  tree?: string;
}
interface DasGetAsset {
  id: string;
  compression?: DasAssetCompression;
  ownership?: { owner?: string; delegate?: string | null };
}
interface DasGetAssetProof {
  root: string;
  proof: string[];
  node_index?: number;
  leaf?: string;
  tree_id?: string;
}

/**
 * Assemble the full transfer payload for a cNFT from Helius DAS: one `getAsset`
 * (leaf hashes, owner, tree) + one `getAssetProof` (root + sibling path). Throws
 * if the asset is not a compressed NFT (cNFT transfers only).
 */
export async function getAssetWithProof(
  rpcUrl: string,
  assetId: string,
  fetchImpl: FetchLike = fetch,
): Promise<CnftTransferData> {
  const [asset, proof] = await Promise.all([
    dasRpc<DasGetAsset>(rpcUrl, 'getAsset', { id: assetId }, fetchImpl),
    dasRpc<DasGetAssetProof>(rpcUrl, 'getAssetProof', { id: assetId }, fetchImpl),
  ]);

  const c = asset.compression;
  if (!c?.compressed) throw new Error(`Asset ${assetId} is not a compressed NFT`);
  if (!c.tree || c.data_hash == null || c.creator_hash == null || c.leaf_id == null) {
    throw new Error(`Asset ${assetId} is missing compression fields`);
  }
  const owner = asset.ownership?.owner;
  if (!owner) throw new Error(`Asset ${assetId} has no owner`);

  return {
    assetId,
    merkleTree: c.tree,
    root: proof.root,
    dataHash: c.data_hash,
    creatorHash: c.creator_hash,
    leafId: c.leaf_id,
    owner,
    delegate: asset.ownership?.delegate ?? null,
    proof: proof.proof,
  };
}

/**
 * Confirm via DAS that `assetId` is now owned by `expectedOwner` — the reliable
 * way to verify a cNFT deposit landed in escrow (DAS reflects the post-transfer
 * leaf owner once the Bubblegum transfer confirms). Mirrors `verifySolTransfer`
 * for the SOL escrow. Returns false on any RPC error or owner mismatch.
 */
export async function confirmCnftOwner(
  rpcUrl: string,
  assetId: string,
  expectedOwner: string,
  fetchImpl: FetchLike = fetch,
): Promise<boolean> {
  try {
    const asset = await dasRpc<DasGetAsset>(rpcUrl, 'getAsset', { id: assetId }, fetchImpl);
    return asset.ownership?.owner === expectedOwner;
  } catch {
    return false;
  }
}

/**
 * Build an UNSIGNED deposit transaction transferring the staked cNFT from its
 * owner (the staker) into the escrow wallet. The web client sets the staker as
 * fee payer and has the wallet sign it. `feePayer` defaults to the current owner.
 */
export function buildCnftDepositTx(
  data: CnftTransferData,
  escrowPubkey: string,
  recentBlockhash: string,
  opts: { canopyDepth?: number; feePayer?: string } = {},
): Transaction {
  const tx = new Transaction();
  tx.add(buildBubblegumTransferIx(data, escrowPubkey, opts.canopyDepth ?? 0));
  tx.recentBlockhash = recentBlockhash;
  tx.feePayer = new PublicKey(opts.feePayer ?? data.owner);
  return tx;
}

export interface CnftEscrowConfig {
  connection: Connection;
  escrow: Keypair;
  rpcUrl: string;
  canopyDepth?: number;
  /** Override fetch (tests / custom agents); defaults to global fetch. */
  fetchImpl?: FetchLike;
}

/**
 * Transfer a cNFT the escrow currently holds to `newOwner`, signed + paid by the
 * escrow. Re-fetches a fresh proof at call time so the leaf state is current
 * (owner = escrow). Returns the confirmed signature.
 */
export async function transferCnftFromEscrow(
  cfg: CnftEscrowConfig,
  assetId: string,
  newOwner: string,
  fetchImpl?: FetchLike,
): Promise<string> {
  const f = fetchImpl ?? cfg.fetchImpl ?? fetch;
  const data = await getAssetWithProof(cfg.rpcUrl, assetId, f);
  const escrowKey = cfg.escrow.publicKey.toBase58();
  if (data.owner !== escrowKey) {
    throw new Error(`Escrow does not hold ${assetId} (owner=${data.owner}) — cannot transfer`);
  }
  const ix = buildBubblegumTransferIx(data, newOwner, cfg.canopyDepth ?? 0);
  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await cfg.connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = cfg.escrow.publicKey;
  tx.sign(cfg.escrow);
  const signature = await cfg.connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await cfg.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  return signature;
}
