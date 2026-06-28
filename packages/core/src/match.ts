/**
 * Negotiation, wagering and settlement types. In the MVP all money is fake
 * (Postgres double-entry ledger / devnet faucet). Settlement runs through a
 * SettlementProvider interface — the off-chain ledger now, an on-chain escrow
 * program later (Phase: on-chain escrow) — with no changes to battle code.
 */

export type WagerType = 'none' | 'crypto' | 'card';

export interface WagerTerms {
  type: WagerType;
  /** integer base units (e.g. lamports / fake credits) when type === 'crypto'. */
  amount?: number;
  mint?: string;
  /** staked card asset ID when type === 'card'. */
  assetId?: string;
}

export type NegotiationStatus = 'PENDING' | 'COUNTERED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export interface Negotiation {
  challengeId: string;
  challengerPubkey: string;
  challengeePubkey: string;
  wager: WagerTerms;
  proposedBy: string;
  status: NegotiationStatus;
  challengerAccepted: boolean;
  challengeeAccepted: boolean;
  expiresAt: string;
  createdAt: string;
}

export type MatchStatus = 'negotiating' | 'active' | 'complete' | 'void';

export interface MatchRecord {
  id: string;
  p1Pubkey: string;
  p2Pubkey: string;
  p1TeamAssets: string[];
  p2TeamAssets: string[];
  wager: WagerTerms;
  status: MatchStatus;
  winnerPubkey?: string | null;
  forfeitReason?: string | null;
  battleLog?: string | null;
  battleLogHash?: string | null;
  feeTaken: number;
  createdAt: string;
  completedAt?: string | null;
}

/** Append-only, double-entry ledger row (fake credits in the MVP). */
export interface LedgerEntry {
  id?: number;
  matchId?: string | null;
  userPubkey: string;
  /** signed: positive = credit, negative = debit. */
  delta: number;
  balanceAfter: number;
  reason: 'wager_win' | 'wager_loss' | 'platform_fee' | 'faucet' | 'deposit' | 'refund';
  createdAt?: string;
}

/** What the battle service hands to settlement when a match resolves. */
export interface SettlementResult {
  matchId: string;
  winner: string; // wallet pubkey
  loser: string; // wallet pubkey
  reason?: 'normal' | 'timeout' | 'disconnect' | 'forfeit';
}

export interface SettlementOutcome {
  matchId: string;
  applied: boolean;
  /** true when this match_id was already settled (idempotent no-op). */
  alreadySettled: boolean;
  feeTaken: number;
  ledgerEntries: LedgerEntry[];
  cardTransferred?: { assetId: string; from: string; to: string };
  voidedReason?: string;
}

/**
 * The single seam between the battle service and money movement. Phase "on-chain
 * escrow" swaps the LedgerSettlementService implementation for an escrow client
 * with zero changes to matchmaking/battle code.
 */
export interface SettlementProvider {
  settle(result: SettlementResult): Promise<SettlementOutcome>;
}

export const PLATFORM_FEE_BPS = 250; // 2.5%

/** Pure fee math, shared by ledger + future escrow. */
export function computeFee(amount: number, feeBps = PLATFORM_FEE_BPS): { fee: number; payout: number } {
  const fee = Math.floor((amount * feeBps) / 10_000);
  return { fee, payout: amount - fee };
}
