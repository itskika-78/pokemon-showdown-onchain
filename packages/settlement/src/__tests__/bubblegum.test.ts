import { describe, it, expect } from 'vitest';
import { Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  anchorDiscriminator,
  buildBubblegumTransferIx,
  deriveTreeAuthority,
  getAssetWithProof,
  BUBBLEGUM_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  TRANSFER_DISCRIMINATOR,
  type CnftTransferData,
} from '../bubblegum.js';
import { OnChainSettlementService, InMemoryEscrowStore, InMemoryCardEscrowStore } from '../onchain.js';

const b58 = () => Keypair.generate().publicKey.toBase58();

function fixture(over: Partial<CnftTransferData> = {}): CnftTransferData {
  return {
    assetId: b58(),
    merkleTree: b58(),
    root: b58(),
    dataHash: b58(),
    creatorHash: b58(),
    leafId: 42,
    owner: b58(),
    delegate: null,
    proof: [b58(), b58(), b58()],
    ...over,
  };
}

describe('anchorDiscriminator + transfer constant', () => {
  it('matches the canonical Bubblegum `transfer` sighash', () => {
    expect(Array.from(TRANSFER_DISCRIMINATOR)).toEqual([163, 52, 200, 231, 140, 3, 69, 186]);
    expect(Array.from(anchorDiscriminator('transfer'))).toEqual(Array.from(TRANSFER_DISCRIMINATOR));
  });
});

describe('deriveTreeAuthority', () => {
  it('is the deterministic [merkleTree]-seeded PDA of the Bubblegum program', () => {
    const tree = Keypair.generate().publicKey;
    const expected = PublicKey.findProgramAddressSync([tree.toBuffer()], BUBBLEGUM_PROGRAM_ID)[0];
    expect(deriveTreeAuthority(tree).toBase58()).toBe(expected.toBase58());
  });
});

describe('buildBubblegumTransferIx — account + data layout', () => {
  it('emits the 8 fixed accounts + proof path, owner as signer, correct data', () => {
    const d = fixture();
    const newOwner = b58();
    const ix = buildBubblegumTransferIx(d, newOwner);

    expect(ix.programId.equals(BUBBLEGUM_PROGRAM_ID)).toBe(true);
    expect(ix.keys.length).toBe(8 + d.proof.length);

    // Fixed accounts.
    expect(ix.keys[0]!.pubkey.toBase58()).toBe(deriveTreeAuthority(new PublicKey(d.merkleTree)).toBase58());
    expect(ix.keys[1]!.pubkey.toBase58()).toBe(d.owner);
    expect(ix.keys[1]!.isSigner).toBe(true); // owner signs (no delegate)
    expect(ix.keys[2]!.isSigner).toBe(false);
    expect(ix.keys[3]!.pubkey.toBase58()).toBe(newOwner);
    expect(ix.keys[4]!.pubkey.toBase58()).toBe(d.merkleTree);
    expect(ix.keys[4]!.isWritable).toBe(true);
    expect(ix.keys[5]!.pubkey.equals(SPL_NOOP_PROGRAM_ID)).toBe(true);
    expect(ix.keys[6]!.pubkey.equals(SPL_ACCOUNT_COMPRESSION_PROGRAM_ID)).toBe(true);
    expect(ix.keys[7]!.pubkey.equals(SystemProgram.programId)).toBe(true);

    // Proof accounts (read-only, non-signer).
    const proofKeys = ix.keys.slice(8);
    expect(proofKeys.map((k) => k.pubkey.toBase58())).toEqual(d.proof);
    expect(proofKeys.every((k) => !k.isSigner && !k.isWritable)).toBe(true);

    // Data: disc(8) + root(32) + dataHash(32) + creatorHash(32) + nonce(8) + index(4) = 116.
    expect(ix.data.length).toBe(116);
    expect(Array.from(ix.data.subarray(0, 8))).toEqual(Array.from(TRANSFER_DISCRIMINATOR));
    expect(Number(ix.data.readBigUInt64LE(104))).toBe(42); // nonce
    expect(ix.data.readUInt32LE(112)).toBe(42); // index
  });

  it('makes the delegate the signer when one is set', () => {
    const delegate = b58();
    const ix = buildBubblegumTransferIx(fixture({ delegate }), b58());
    expect(ix.keys[1]!.isSigner).toBe(false); // owner
    expect(ix.keys[2]!.pubkey.toBase58()).toBe(delegate);
    expect(ix.keys[2]!.isSigner).toBe(true); // delegate
  });

  it('truncates the proof by the canopy depth', () => {
    const d = fixture();
    const ix = buildBubblegumTransferIx(d, b58(), 1);
    expect(ix.keys.length).toBe(8 + d.proof.length - 1);
  });
});

describe('getAssetWithProof — assembles getAsset + getAssetProof', () => {
  const tree = b58();
  const owner = b58();
  const root = b58();
  const dataHash = b58();
  const creatorHash = b58();
  const proof = [b58(), b58()];

  function fakeFetch(compressed = true): typeof fetch {
    return (async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { method: string };
      const result =
        body.method === 'getAsset'
          ? {
              id: 'asset1',
              compression: { compressed, data_hash: dataHash, creator_hash: creatorHash, leaf_id: 7, tree },
              ownership: { owner, delegate: null },
            }
          : { root, proof };
      return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', result }) };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
  }

  it('returns a complete CnftTransferData for a compressed asset', async () => {
    const d = await getAssetWithProof('http://rpc', 'asset1', fakeFetch());
    expect(d).toEqual({
      assetId: 'asset1',
      merkleTree: tree,
      root,
      dataHash,
      creatorHash,
      leafId: 7,
      owner,
      delegate: null,
      proof,
    });
  });

  it('rejects a non-compressed asset', async () => {
    await expect(getAssetWithProof('http://rpc', 'asset1', fakeFetch(false))).rejects.toThrow(/not a compressed NFT/);
  });
});

/** Fake Connection capturing serialized txs (same shape as the SOL escrow test). */
function fakeConnection() {
  const sent: Transaction[] = [];
  const connection = {
    getLatestBlockhash: async () => ({ blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1000 }),
    sendRawTransaction: async (raw: Buffer | Uint8Array) => {
      sent.push(Transaction.from(raw));
      return 'CnftSig1111111111111111111111111111111111111';
    },
    confirmTransaction: async () => ({ value: { err: null } }),
  };
  return { connection, sent };
}

describe('OnChainSettlementService — card (cNFT) escrow → winner', () => {
  it('transfers the staked cNFT from escrow to the winner, once', async () => {
    const escrow = Keypair.generate();
    const treasury = new PublicKey('21vUy4XiTRGhrRF7EwaagRHspvk6zQzzfWahuPXpTwEo');
    const winner = b58();
    const loser = b58();
    const assetId = b58();
    const { connection, sent } = fakeConnection();

    // DAS shows the escrow currently holds the staked card.
    const fetchImpl = (async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { method: string };
      const result =
        body.method === 'getAsset'
          ? {
              id: assetId,
              compression: { compressed: true, data_hash: b58(), creator_hash: b58(), leaf_id: 3, tree: b58() },
              ownership: { owner: escrow.publicKey.toBase58(), delegate: null },
            }
          : { root: b58(), proof: [b58(), b58()] };
      return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', result }) };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    const cardStore = new InMemoryCardEscrowStore();
    cardStore.seedCard('m1', { assetId, staker: loser });

    const svc = new OnChainSettlementService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { connection: connection as any, escrow, treasury, feeBps: 250 },
      new InMemoryEscrowStore(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { cnft: { connection: connection as any, escrow, rpcUrl: 'http://rpc', fetchImpl }, store: cardStore },
    );

    const out = await svc.settle({ matchId: 'm1', winner, loser, reason: 'normal' });
    expect(out.applied).toBe(true);
    expect(out.cardTransferred).toEqual({ assetId, from: escrow.publicKey.toBase58(), to: winner });
    expect(sent.length).toBe(1); // exactly one on-chain cNFT transfer
    expect(sent[0]!.instructions[0]!.programId.equals(BUBBLEGUM_PROGRAM_ID)).toBe(true);

    // Re-settle is a no-op — no second transfer.
    const again = await svc.settle({ matchId: 'm1', winner, loser, reason: 'normal' });
    expect(again.alreadySettled).toBe(true);
    expect(sent.length).toBe(1);
  });

  it('settles SOL pot and card together when both are staked', async () => {
    const escrow = Keypair.generate();
    const treasury = new PublicKey('21vUy4XiTRGhrRF7EwaagRHspvk6zQzzfWahuPXpTwEo');
    const winner = b58();
    const loser = b58();
    const assetId = b58();
    const { connection, sent } = fakeConnection();

    const fetchImpl = (async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { method: string };
      const result =
        body.method === 'getAsset'
          ? {
              id: assetId,
              compression: { compressed: true, data_hash: b58(), creator_hash: b58(), leaf_id: 1, tree: b58() },
              ownership: { owner: escrow.publicKey.toBase58(), delegate: null },
            }
          : { root: b58(), proof: [b58()] };
      return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', result }) };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    const solStore = new InMemoryEscrowStore();
    await solStore.recordDeposit({ matchId: 'm2', pubkey: winner, signature: 'a', lamports: 0.5 * LAMPORTS_PER_SOL });
    await solStore.recordDeposit({ matchId: 'm2', pubkey: loser, signature: 'b', lamports: 0.5 * LAMPORTS_PER_SOL });
    const cardStore = new InMemoryCardEscrowStore();
    cardStore.seedCard('m2', { assetId, staker: loser });

    const svc = new OnChainSettlementService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { connection: connection as any, escrow, treasury, feeBps: 250 },
      solStore,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { cnft: { connection: connection as any, escrow, rpcUrl: 'http://rpc', fetchImpl }, store: cardStore },
    );

    const out = await svc.settle({ matchId: 'm2', winner, loser, reason: 'normal' });
    expect(out.feeTaken).toBe(25_000_000); // 2.5% of 1 SOL pot
    expect(out.cardTransferred?.assetId).toBe(assetId);
    expect(sent.length).toBe(2); // cNFT transfer + SOL payout
  });
});
