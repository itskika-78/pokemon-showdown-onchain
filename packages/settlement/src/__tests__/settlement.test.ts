import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryLedgerStore,
  LedgerSettlementService,
  PLATFORM_TREASURY,
  computeSettlement,
  type MatchRow,
} from '../index.js';

const FEE_BPS = 250; // 2.5%

function cryptoMatch(amount: number): MatchRow {
  return {
    id: 'match-1',
    status: 'active',
    wagerType: 'crypto',
    wagerAmount: amount,
    wagerAssetId: null,
    p1: 'alice',
    p2: 'bob',
  };
}

describe('computeSettlement — double-entry math', () => {
  it('crypto: loser debited full stake, winner credited stake−fee, treasury gets fee', () => {
    const plan = computeSettlement(cryptoMatch(1000), 'alice', 'bob', FEE_BPS);
    expect(plan.fee).toBe(25);
    const sum = plan.credits.reduce((s, c) => s + c.delta, 0);
    expect(sum).toBe(0); // double-entry balances to zero
    expect(plan.credits).toContainEqual({ user: 'bob', delta: -1000, reason: 'wager_loss' });
    expect(plan.credits).toContainEqual({ user: 'alice', delta: 975, reason: 'wager_win' });
    expect(plan.credits).toContainEqual({ user: PLATFORM_TREASURY, delta: 25, reason: 'platform_fee' });
  });

  it('card: plans an ownership transfer loser → winner', () => {
    const m: MatchRow = { ...cryptoMatch(0), wagerType: 'card', wagerAmount: null, wagerAssetId: 'asset-x' };
    const plan = computeSettlement(m, 'alice', 'bob', FEE_BPS);
    expect(plan.credits).toEqual([]);
    expect(plan.cardTransfer).toEqual({ assetId: 'asset-x', from: 'bob', to: 'alice' });
  });
});

describe('LedgerSettlementService — applies + idempotent', () => {
  let store: InMemoryLedgerStore;
  let service: LedgerSettlementService;

  beforeEach(() => {
    store = new InMemoryLedgerStore();
    service = new LedgerSettlementService(store, FEE_BPS);
    store.seedMatch(cryptoMatch(1000));
    store.setBalance('alice', 5000);
    store.setBalance('bob', 5000);
    store.setBalance(PLATFORM_TREASURY, 0);
  });

  it('settles a crypto wager with correct balances + ledger entries', async () => {
    const out = await service.settle({ matchId: 'match-1', winner: 'alice', loser: 'bob' });
    expect(out.applied).toBe(true);
    expect(out.feeTaken).toBe(25);
    expect(store.getBalance('bob')).toBe(4000);
    expect(store.getBalance('alice')).toBe(5975);
    expect(store.getBalance(PLATFORM_TREASURY)).toBe(25);
    expect(out.ledgerEntries).toHaveLength(3);
    // every entry carries the running balance
    const aliceEntry = out.ledgerEntries.find((e) => e.userPubkey === 'alice')!;
    expect(aliceEntry.balanceAfter).toBe(5975);
  });

  it('is idempotent: a second settle() does not double-apply', async () => {
    await service.settle({ matchId: 'match-1', winner: 'alice', loser: 'bob' });
    const second = await service.settle({ matchId: 'match-1', winner: 'alice', loser: 'bob' });
    expect(second.applied).toBe(false);
    expect(second.alreadySettled).toBe(true);
    expect(store.getBalance('alice')).toBe(5975); // unchanged
    expect(store.getBalance('bob')).toBe(4000);
  });

  it('transfers a staked card to the winner', async () => {
    store.seedMatch({
      id: 'match-2',
      status: 'active',
      wagerType: 'card',
      wagerAmount: null,
      wagerAssetId: 'grail-asset',
      p1: 'alice',
      p2: 'bob',
    });
    store.setAssetOwner('grail-asset', 'bob');
    const out = await service.settle({ matchId: 'match-2', winner: 'alice', loser: 'bob' });
    expect(out.applied).toBe(true);
    expect(out.cardTransferred).toEqual({ assetId: 'grail-asset', from: 'bob', to: 'alice' });
    expect(store.getAssetOwner('grail-asset')).toBe('alice');
  });

  it('returns match_not_found for an unknown match', async () => {
    const out = await service.settle({ matchId: 'nope', winner: 'alice', loser: 'bob' });
    expect(out.applied).toBe(false);
    expect(out.voidedReason).toBe('match_not_found');
  });
});
