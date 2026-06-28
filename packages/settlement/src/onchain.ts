/**
 * Custodial on-chain escrow settlement. A server-held hot wallet ("escrow")
 * receives both players' SOL stakes before the battle; at settlement the escrow
 * pays the winner `pot − fee` and sends `fee` to the treasury — a real on-chain
 * transfer. This is the deployable-today alternative to a trustless Anchor PDA
 * program: it moves real SOL, but it is *custodial* (the operator holds funds
 * mid-match). Idempotent by match id so a replayed settle never double-pays.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { computeFee, type SettlementProvider, type SettlementResult, type SettlementOutcome } from '@battler/core';
import { type CnftEscrowConfig, transferCnftFromEscrow } from './bubblegum.js';

export { LAMPORTS_PER_SOL };

/** A card staked into escrow for a match (the on-chain card-wager record). */
export interface StakedCardRef {
  assetId: string;
  /** Original owner — used to refund the cNFT on a void. */
  staker: string;
}

/**
 * Tracks which cNFT (if any) is escrowed for a match, plus idempotent settlement
 * of that card. Postgres-backed in prod; in-memory for tests/dev.
 */
export interface CardEscrowStore {
  cardFor(matchId: string): Promise<StakedCardRef | null>;
  /** Atomically claim the card settlement for a match; false if already done. */
  claimCardSettlement(matchId: string): Promise<boolean>;
  recordCardOutcome(input: {
    matchId: string;
    assetId: string;
    to: string;
    signature: string | null;
    voided: boolean;
  }): Promise<void>;
}

export class InMemoryCardEscrowStore implements CardEscrowStore {
  private cards = new Map<string, StakedCardRef>();
  private settled = new Set<string>();
  seedCard(matchId: string, ref: StakedCardRef): void {
    this.cards.set(matchId, ref);
  }
  async cardFor(matchId: string): Promise<StakedCardRef | null> {
    return this.cards.get(matchId) ?? null;
  }
  async claimCardSettlement(matchId: string): Promise<boolean> {
    if (this.settled.has(matchId)) return false;
    this.settled.add(matchId);
    return true;
  }
  async recordCardOutcome(): Promise<void> {}
}

/** Parse an escrow secret key from env: base58 string OR JSON byte array. */
export function keypairFromSecret(secret: string): Keypair {
  const s = secret.trim();
  if (s.startsWith('[')) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(s) as number[]));
  return Keypair.fromSecretKey(bs58.decode(s));
}

export interface VerifyTransferResult {
  ok: boolean;
  lamports: number;
  reason?: string;
}

/**
 * Confirm `signature` is a settled SOL transfer of at least `minLamports` from
 * `from` into `to`. Same guarantees as the deposit-verify pattern: confirmed,
 * correct signer (fee payer), correct recipient, real lamports received.
 */
export async function verifySolTransfer(
  connection: Connection,
  opts: { signature: string; from: string; to: string; minLamports: number },
): Promise<VerifyTransferResult> {
  let tx;
  try {
    tx = await connection.getTransaction(opts.signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
  } catch (e) {
    return { ok: false, lamports: 0, reason: e instanceof Error ? e.message : 'RPC error' };
  }
  if (!tx) return { ok: false, lamports: 0, reason: 'Transaction not found or not confirmed' };
  if (tx.meta?.err) return { ok: false, lamports: 0, reason: 'Transaction failed on-chain' };

  const keys = tx.transaction.message.getAccountKeys();
  const idxOf = (pk: string): number => {
    for (let i = 0; i < keys.length; i++) if (keys.get(i)?.toBase58() === pk) return i;
    return -1;
  };
  if (keys.get(0)?.toBase58() !== opts.from) {
    return { ok: false, lamports: 0, reason: 'Deposit not signed by the expected wallet' };
  }
  const toIdx = idxOf(opts.to);
  if (toIdx === -1) return { ok: false, lamports: 0, reason: 'Escrow was not a recipient' };

  const pre = tx.meta?.preBalances ?? [];
  const post = tx.meta?.postBalances ?? [];
  const received = (post[toIdx] ?? 0) - (pre[toIdx] ?? 0);
  if (received < opts.minLamports) {
    return { ok: false, lamports: received, reason: `Under-funded: received ${received} < ${opts.minLamports}` };
  }
  return { ok: true, lamports: received };
}

export interface EscrowDeposit {
  pubkey: string;
  lamports: number;
}

/**
 * Idempotency + deposit ledger the on-chain settler needs. Implemented over
 * Postgres in prod (PgEscrowStore); an in-memory impl backs tests.
 */
export interface EscrowStore {
  /** Record a verified deposit; returns false if the signature was already recorded. */
  recordDeposit(input: { matchId: string; pubkey: string; signature: string; lamports: number }): Promise<boolean>;
  depositsFor(matchId: string): Promise<EscrowDeposit[]>;
  /** Atomically claim the settlement for a match; false if already settled. */
  claimSettlement(matchId: string): Promise<boolean>;
  recordSettlement(input: { matchId: string; payoutSig: string | null; winner: string; payout: number; fee: number; voided: boolean }): Promise<void>;
}

export class InMemoryEscrowStore implements EscrowStore {
  private deposits = new Map<string, EscrowDeposit[]>();
  private sigs = new Set<string>();
  private settled = new Set<string>();
  async recordDeposit(i: { matchId: string; pubkey: string; signature: string; lamports: number }): Promise<boolean> {
    if (this.sigs.has(i.signature)) return false;
    this.sigs.add(i.signature);
    const arr = this.deposits.get(i.matchId) ?? [];
    arr.push({ pubkey: i.pubkey, lamports: i.lamports });
    this.deposits.set(i.matchId, arr);
    return true;
  }
  async depositsFor(matchId: string): Promise<EscrowDeposit[]> {
    return this.deposits.get(matchId) ?? [];
  }
  async claimSettlement(matchId: string): Promise<boolean> {
    if (this.settled.has(matchId)) return false;
    this.settled.add(matchId);
    return true;
  }
  async recordSettlement(): Promise<void> {}
}

export interface OnChainEscrowConfig {
  connection: Connection;
  escrow: Keypair;
  treasury: PublicKey;
  feeBps: number;
}

/**
 * Pays the winner from escrow. Builds ONE transaction: escrow → winner (pot−fee)
 * and escrow → treasury (fee). The escrow signs + pays the network fee from its
 * own buffer. Returns the confirmed signature.
 */
export async function payoutFromEscrow(
  cfg: OnChainEscrowConfig,
  winner: string,
  pot: number,
): Promise<{ signature: string; payout: number; fee: number }> {
  const { fee, payout } = computeFee(pot, cfg.feeBps);
  const tx = new Transaction();
  tx.add(
    SystemProgram.transfer({ fromPubkey: cfg.escrow.publicKey, toPubkey: new PublicKey(winner), lamports: payout }),
  );
  if (fee > 0) {
    tx.add(
      SystemProgram.transfer({ fromPubkey: cfg.escrow.publicKey, toPubkey: cfg.treasury, lamports: fee }),
    );
  }
  const { blockhash, lastValidBlockHeight } = await cfg.connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = cfg.escrow.publicKey;
  tx.sign(cfg.escrow);
  const signature = await cfg.connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await cfg.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  return { signature, payout, fee };
}

/** Refund each deposit back to its depositor (void / tie / no-show). */
export async function refundFromEscrow(cfg: OnChainEscrowConfig, deposits: EscrowDeposit[]): Promise<string | null> {
  if (deposits.length === 0) return null;
  const tx = new Transaction();
  for (const d of deposits) {
    tx.add(SystemProgram.transfer({ fromPubkey: cfg.escrow.publicKey, toPubkey: new PublicKey(d.pubkey), lamports: d.lamports }));
  }
  const { blockhash, lastValidBlockHeight } = await cfg.connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = cfg.escrow.publicKey;
  tx.sign(cfg.escrow);
  const signature = await cfg.connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await cfg.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  return signature;
}

/** Refund an escrowed cNFT back to its original staker (void / tie / no-show). */
export async function refundCnftFromEscrow(
  cnft: CnftEscrowConfig,
  assetId: string,
  staker: string,
): Promise<string> {
  return transferCnftFromEscrow(cnft, assetId, staker);
}

/** Optional on-chain card-escrow wiring for {@link OnChainSettlementService}. */
export interface OnChainCardEscrow {
  cnft: CnftEscrowConfig;
  store: CardEscrowStore;
}

/**
 * SettlementProvider that settles real SOL from the escrow hot wallet. Drops
 * into the same seam as the off-chain ledger. Pot is the sum of verified
 * deposits for the match (never client-asserted).
 *
 * When a card escrow is wired in, a staked cNFT is additionally transferred
 * from escrow → winner on-chain (Bubblegum), idempotently per match.
 */
export class OnChainSettlementService implements SettlementProvider {
  constructor(
    private readonly cfg: OnChainEscrowConfig,
    private readonly store: EscrowStore,
    private readonly card?: OnChainCardEscrow,
  ) {}

  /** Transfer a staked cNFT escrow → winner, idempotently. Returns the move, if any. */
  private async settleCard(
    matchId: string,
    winner: string,
  ): Promise<{ assetId: string; from: string; to: string } | undefined> {
    if (!this.card) return undefined;
    const staked = await this.card.store.cardFor(matchId);
    if (!staked) return undefined;
    if (!(await this.card.store.claimCardSettlement(matchId))) return undefined;
    const signature = await transferCnftFromEscrow(this.card.cnft, staked.assetId, winner);
    await this.card.store.recordCardOutcome({ matchId, assetId: staked.assetId, to: winner, signature, voided: false });
    return { assetId: staked.assetId, from: this.card.cnft.escrow.publicKey.toBase58(), to: winner };
  }

  async settle(result: SettlementResult): Promise<SettlementOutcome> {
    const claimed = await this.store.claimSettlement(result.matchId);
    if (!claimed) {
      return { matchId: result.matchId, applied: false, alreadySettled: true, feeTaken: 0, ledgerEntries: [] };
    }
    const cardTransferred = await this.settleCard(result.matchId, result.winner);
    const deposits = await this.store.depositsFor(result.matchId);
    const pot = deposits.reduce((s, d) => s + d.lamports, 0);
    if (pot <= 0) {
      // No SOL escrowed (card-only or no-stake match) — nothing to move on the SOL side.
      await this.store.recordSettlement({ matchId: result.matchId, payoutSig: null, winner: result.winner, payout: 0, fee: 0, voided: false });
      return { matchId: result.matchId, applied: true, alreadySettled: false, feeTaken: 0, ledgerEntries: [], cardTransferred };
    }
    const { signature, payout, fee } = await payoutFromEscrow(this.cfg, result.winner, pot);
    await this.store.recordSettlement({ matchId: result.matchId, payoutSig: signature, winner: result.winner, payout, fee, voided: false });
    return {
      matchId: result.matchId,
      applied: true,
      alreadySettled: false,
      feeTaken: fee,
      ledgerEntries: [],
      cardTransferred,
    };
  }
}
