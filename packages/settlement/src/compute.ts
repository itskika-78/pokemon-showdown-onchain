import { computeFee, type LedgerEntry } from '@battler/core';

/** The platform treasury "user" that receives the rake. Seeded in schema.sql. */
export const PLATFORM_TREASURY = 'PLATFORM_TREASURY';

export interface MatchRow {
  id: string;
  status: string; // 'negotiating' | 'active' | 'complete' | 'void'
  wagerType: 'none' | 'crypto' | 'card';
  wagerAmount: number | null;
  wagerAssetId: string | null;
  p1: string;
  p2: string;
}

export interface CreditMove {
  user: string;
  delta: number;
  reason: LedgerEntry['reason'];
}

export interface SettlementPlan {
  matchId: string;
  winner: string;
  loser: string;
  fee: number;
  credits: CreditMove[];
  cardTransfer?: { assetId: string; from: string; to: string };
}

/**
 * Pure settlement math (double-entry). Crypto: loser is debited the full stake,
 * winner credited the stake minus the platform fee, the treasury credited the
 * fee — sums to zero. Card: ownership transfers loser → winner (app-level in the
 * MVP; a real cNFT transfer in the on-chain escrow phase).
 */
export function computeSettlement(
  match: MatchRow,
  winner: string,
  loser: string,
  feeBps: number,
): SettlementPlan {
  const plan: SettlementPlan = { matchId: match.id, winner, loser, fee: 0, credits: [] };

  if (match.wagerType === 'crypto' && (match.wagerAmount ?? 0) > 0) {
    const amount = match.wagerAmount!;
    const { fee, payout } = computeFee(amount, feeBps);
    plan.fee = fee;
    plan.credits = [
      { user: loser, delta: -amount, reason: 'wager_loss' },
      { user: winner, delta: payout, reason: 'wager_win' },
      { user: PLATFORM_TREASURY, delta: fee, reason: 'platform_fee' },
    ];
  } else if (match.wagerType === 'card' && match.wagerAssetId) {
    plan.cardTransfer = { assetId: match.wagerAssetId, from: loser, to: winner };
  }

  return plan;
}
