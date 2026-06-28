import type {
  SettlementOutcome,
  SettlementProvider,
  SettlementResult,
} from '@battler/core';
import { PLATFORM_FEE_BPS } from '@battler/core';
import { computeSettlement } from './compute.js';
import type { LedgerStore } from './store.js';

/**
 * The off-chain ledger settlement provider. This is the SINGLE seam the battle
 * service uses to move money — there are no direct DB writes from battle rooms.
 * Phase "on-chain escrow" swaps this class for an escrow client implementing the
 * same SettlementProvider interface.
 *
 * Idempotent: keyed by match_id. A reconnect/retry that calls settle() twice
 * applies the ledger exactly once.
 */
export class LedgerSettlementService implements SettlementProvider {
  constructor(
    private readonly store: LedgerStore,
    private readonly feeBps: number = PLATFORM_FEE_BPS,
  ) {}

  async settle(result: SettlementResult): Promise<SettlementOutcome> {
    const match = await this.store.getMatch(result.matchId);
    if (!match) {
      return {
        matchId: result.matchId,
        applied: false,
        alreadySettled: false,
        feeTaken: 0,
        ledgerEntries: [],
        voidedReason: 'match_not_found',
      };
    }

    if (await this.store.isSettled(result.matchId)) {
      return {
        matchId: result.matchId,
        applied: false,
        alreadySettled: true,
        feeTaken: 0,
        ledgerEntries: [],
      };
    }

    const plan = computeSettlement(match, result.winner, result.loser, this.feeBps);
    const ledgerEntries = await this.store.applySettlement(plan);

    return {
      matchId: result.matchId,
      applied: true,
      alreadySettled: false,
      feeTaken: plan.fee,
      ledgerEntries,
      cardTransferred: plan.cardTransfer
        ? { assetId: plan.cardTransfer.assetId, from: plan.cardTransfer.from, to: plan.cardTransfer.to }
        : undefined,
    };
  }
}
