import type { LedgerEntry } from '@battler/core';
import { withTransaction } from '@battler/server-kit';
import type { MatchRow, SettlementPlan } from './compute.js';

/**
 * Storage seam for settlement. The service depends only on this interface, so
 * the off-chain ledger (Postgres / in-memory) can later be swapped for an
 * on-chain escrow client with no changes to battle/matchmaking code.
 */
export interface LedgerStore {
  getMatch(matchId: string): Promise<MatchRow | null>;
  isSettled(matchId: string): Promise<boolean>;
  /** Atomically apply a plan, returning the persisted ledger entries. */
  applySettlement(plan: SettlementPlan): Promise<LedgerEntry[]>;
}

// ---------------------------------------------------------------------------
// In-memory store — used by unit tests and the vs-bot/dev path.
// ---------------------------------------------------------------------------

export class InMemoryLedgerStore implements LedgerStore {
  private readonly matches = new Map<string, MatchRow>();
  private readonly balances = new Map<string, number>();
  private readonly assetOwners = new Map<string, string>();
  private readonly settled = new Set<string>();
  readonly entries: LedgerEntry[] = [];

  seedMatch(m: MatchRow): void {
    this.matches.set(m.id, m);
  }
  setBalance(user: string, amount: number): void {
    this.balances.set(user, amount);
  }
  getBalance(user: string): number {
    return this.balances.get(user) ?? 0;
  }
  setAssetOwner(assetId: string, owner: string): void {
    this.assetOwners.set(assetId, owner);
  }
  getAssetOwner(assetId: string): string | undefined {
    return this.assetOwners.get(assetId);
  }

  async getMatch(matchId: string): Promise<MatchRow | null> {
    return this.matches.get(matchId) ?? null;
  }

  async isSettled(matchId: string): Promise<boolean> {
    return this.settled.has(matchId) || this.matches.get(matchId)?.status === 'complete';
  }

  async applySettlement(plan: SettlementPlan): Promise<LedgerEntry[]> {
    const written: LedgerEntry[] = [];
    for (const c of plan.credits) {
      const balanceAfter = this.getBalance(c.user) + c.delta;
      this.balances.set(c.user, balanceAfter);
      const entry: LedgerEntry = {
        matchId: plan.matchId,
        userPubkey: c.user,
        delta: c.delta,
        balanceAfter,
        reason: c.reason,
        createdAt: new Date().toISOString(),
      };
      written.push(entry);
      this.entries.push(entry);
    }
    if (plan.cardTransfer) {
      this.assetOwners.set(plan.cardTransfer.assetId, plan.cardTransfer.to);
    }
    const m = this.matches.get(plan.matchId);
    if (m) m.status = 'complete';
    this.settled.add(plan.matchId);
    return written;
  }
}

// ---------------------------------------------------------------------------
// Postgres store — production. All writes inside one transaction.
// ---------------------------------------------------------------------------

interface DbMatch {
  id: string;
  status: string;
  wager_type: 'none' | 'crypto' | 'card';
  wager_amount: string | null;
  wager_asset_id: string | null;
  p1_pubkey: string;
  p2_pubkey: string;
  fee_taken: string | null;
}

export class PgLedgerStore implements LedgerStore {
  async getMatch(matchId: string): Promise<MatchRow | null> {
    const { query } = await import('@battler/server-kit');
    const res = await query<DbMatch>('SELECT * FROM matches WHERE id = $1', [matchId]);
    const m = res.rows[0];
    if (!m) return null;
    return {
      id: m.id,
      status: m.status,
      wagerType: m.wager_type,
      wagerAmount: m.wager_amount == null ? null : Number(m.wager_amount),
      wagerAssetId: m.wager_asset_id,
      p1: m.p1_pubkey,
      p2: m.p2_pubkey,
    };
  }

  async isSettled(matchId: string): Promise<boolean> {
    const { query } = await import('@battler/server-kit');
    const res = await query<{ status: string }>('SELECT status FROM matches WHERE id = $1', [matchId]);
    return res.rows[0]?.status === 'complete';
  }

  async applySettlement(plan: SettlementPlan): Promise<LedgerEntry[]> {
    return withTransaction(async (client) => {
      // Lock + idempotency re-check inside the transaction.
      const locked = await client.query<{ status: string }>(
        'SELECT status FROM matches WHERE id = $1 FOR UPDATE',
        [plan.matchId],
      );
      if (locked.rows[0]?.status === 'complete') return [];

      const written: LedgerEntry[] = [];
      for (const c of plan.credits) {
        const upd = await client.query<{ ledger_balance: string }>(
          'UPDATE users SET ledger_balance = ledger_balance + $1 WHERE pubkey = $2 RETURNING ledger_balance',
          [c.delta, c.user],
        );
        const balanceAfter = Number(upd.rows[0]?.ledger_balance ?? 0);
        await client.query(
          `INSERT INTO ledger_entries (match_id, user_pubkey, delta, balance_after, reason)
           VALUES ($1, $2, $3, $4, $5)`,
          [plan.matchId, c.user, c.delta, balanceAfter, c.reason],
        );
        written.push({
          matchId: plan.matchId,
          userPubkey: c.user,
          delta: c.delta,
          balanceAfter,
          reason: c.reason,
        });
      }

      if (plan.cardTransfer) {
        await client.query('UPDATE assets SET owner_pubkey = $1 WHERE asset_id = $2', [
          plan.cardTransfer.to,
          plan.cardTransfer.assetId,
        ]);
        await client.query(
          "UPDATE staked_cards SET status = 'transferred' WHERE match_id = $1 AND asset_id = $2",
          [plan.matchId, plan.cardTransfer.assetId],
        );
      }

      await client.query(
        "UPDATE matches SET status = 'complete', winner_pubkey = $1, fee_taken = $2, completed_at = NOW() WHERE id = $3",
        [plan.winner, plan.fee, plan.matchId],
      );
      return written;
    });
  }
}
