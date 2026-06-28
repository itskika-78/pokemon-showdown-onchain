import { describe, it, expect } from 'vitest';
import { Keypair, PublicKey, Transaction, SystemInstruction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  payoutFromEscrow,
  OnChainSettlementService,
  InMemoryEscrowStore,
  keypairFromSecret,
} from '../onchain.js';

/** A fake Connection that captures the serialized payout tx for inspection. */
function fakeConnection() {
  const sent: Transaction[] = [];
  const connection = {
    getLatestBlockhash: async () => ({ blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1000 }),
    sendRawTransaction: async (raw: Buffer | Uint8Array) => {
      sent.push(Transaction.from(raw));
      return 'FaKeSiGnAtuRe1111111111111111111111111111111';
    },
    confirmTransaction: async () => ({ value: { err: null } }),
  };
  return { connection, sent };
}

const treasury = new PublicKey('21vUy4XiTRGhrRF7EwaagRHspvk6zQzzfWahuPXpTwEo');

describe('payoutFromEscrow — escrow → winner (pot−fee) + treasury (fee)', () => {
  it('splits the pot with the 2.5% fee and builds correct on-chain transfers', async () => {
    const escrow = Keypair.generate();
    const winner = Keypair.generate().publicKey.toBase58();
    const { connection, sent } = fakeConnection();
    const pot = 1 * LAMPORTS_PER_SOL;

    const res = await payoutFromEscrow(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { connection: connection as any, escrow, treasury, feeBps: 250 },
      winner,
      pot,
    );

    expect(res.fee).toBe(25_000_000); // 2.5% of 1 SOL
    expect(res.payout).toBe(975_000_000);

    // Decode the actual instructions the escrow signed.
    const tx = sent[0]!;
    const transfers = tx.instructions.map((ix) => SystemInstruction.decodeTransfer(ix));
    const toWinner = transfers.find((t) => t.toPubkey.toBase58() === winner)!;
    const toTreasury = transfers.find((t) => t.toPubkey.toBase58() === treasury.toBase58())!;
    expect(Number(toWinner.lamports)).toBe(975_000_000);
    expect(Number(toTreasury.lamports)).toBe(25_000_000);
    expect(toWinner.fromPubkey.toBase58()).toBe(escrow.publicKey.toBase58());
  });
});

describe('OnChainSettlementService — pot from verified deposits, idempotent', () => {
  it('pays the winner the summed pot minus fee, and only once', async () => {
    const escrow = Keypair.generate();
    const winner = Keypair.generate().publicKey.toBase58();
    const loser = Keypair.generate().publicKey.toBase58();
    const { connection, sent } = fakeConnection();
    const store = new InMemoryEscrowStore();
    await store.recordDeposit({ matchId: 'm1', pubkey: winner, signature: 'sigA', lamports: 0.5 * LAMPORTS_PER_SOL });
    await store.recordDeposit({ matchId: 'm1', pubkey: loser, signature: 'sigB', lamports: 0.5 * LAMPORTS_PER_SOL });

    const svc = new OnChainSettlementService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { connection: connection as any, escrow, treasury, feeBps: 250 },
      store,
    );

    const out = await svc.settle({ matchId: 'm1', winner, loser, reason: 'normal' });
    expect(out.applied).toBe(true);
    expect(out.alreadySettled).toBe(false);
    expect(out.feeTaken).toBe(25_000_000); // 2.5% of the 1 SOL pot
    expect(sent.length).toBe(1);

    // Re-settle must be a no-op (no double-pay).
    const again = await svc.settle({ matchId: 'm1', winner, loser, reason: 'normal' });
    expect(again.alreadySettled).toBe(true);
    expect(sent.length).toBe(1);
  });

  it('rejects a duplicate deposit signature', async () => {
    const store = new InMemoryEscrowStore();
    expect(await store.recordDeposit({ matchId: 'm', pubkey: 'p', signature: 'dup', lamports: 1 })).toBe(true);
    expect(await store.recordDeposit({ matchId: 'm', pubkey: 'p', signature: 'dup', lamports: 1 })).toBe(false);
  });
});

describe('keypairFromSecret — accepts base58 and JSON array', () => {
  it('round-trips a generated keypair via JSON byte array', () => {
    const kp = Keypair.generate();
    const fromJson = keypairFromSecret(JSON.stringify(Array.from(kp.secretKey)));
    expect(fromJson.publicKey.toBase58()).toBe(kp.publicKey.toBase58());
  });
});
