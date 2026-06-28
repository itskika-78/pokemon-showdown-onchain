import { query, withTransaction } from '@battler/server-kit';
import type { EscrowStore, EscrowDeposit, CardEscrowStore, StakedCardRef } from '@battler/settlement';

/**
 * Postgres-backed escrow ledger for on-chain SOL wagers. Deposits are unique by
 * signature; settlement is claimed atomically per match so concurrent settle
 * calls can't double-pay.
 */
export class PgEscrowStore implements EscrowStore {
  constructor(private readonly cluster: string) {}

  async recordDeposit(input: { matchId: string; pubkey: string; signature: string; lamports: number }): Promise<boolean> {
    const res = await query(
      `INSERT INTO escrow_deposits (signature, match_id, pubkey, lamports, cluster)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (signature) DO NOTHING`,
      [input.signature, input.matchId, input.pubkey, input.lamports, this.cluster],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async depositsFor(matchId: string): Promise<EscrowDeposit[]> {
    const res = await query<{ pubkey: string; lamports: string }>(
      'SELECT pubkey, lamports FROM escrow_deposits WHERE match_id = $1',
      [matchId],
    );
    return res.rows.map((r) => ({ pubkey: r.pubkey, lamports: Number(r.lamports) }));
  }

  async claimSettlement(matchId: string): Promise<boolean> {
    return withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO escrow_settlements (match_id, winner) VALUES ($1, '') ON CONFLICT (match_id) DO NOTHING`,
        [matchId],
      );
      return (ins.rowCount ?? 0) > 0;
    });
  }

  async recordSettlement(input: { matchId: string; payoutSig: string | null; winner: string; payout: number; fee: number; voided: boolean }): Promise<void> {
    await query(
      `UPDATE escrow_settlements SET payout_sig = $2, winner = $3, payout = $4, fee = $5, voided = $6 WHERE match_id = $1`,
      [input.matchId, input.payoutSig, input.winner, input.payout, input.fee, input.voided],
    );
  }
}

/**
 * Postgres-backed escrow ledger for on-chain card (cNFT) wagers. A row is
 * written when the staker deposits the card to escrow (deposit_sig); settlement
 * is claimed atomically per match so the Bubblegum transfer escrow→winner runs
 * exactly once.
 */
export class PgCardEscrowStore implements CardEscrowStore {
  constructor(private readonly cluster: string) {}

  async cardFor(matchId: string): Promise<StakedCardRef | null> {
    const res = await query<{ asset_id: string; staker: string }>(
      'SELECT asset_id, staker FROM escrow_cards WHERE match_id = $1 AND deposit_sig IS NOT NULL LIMIT 1',
      [matchId],
    );
    const r = res.rows[0];
    return r ? { assetId: r.asset_id, staker: r.staker } : null;
  }

  async claimCardSettlement(matchId: string): Promise<boolean> {
    return withTransaction(async (client) => {
      const upd = await client.query(
        'UPDATE escrow_cards SET settled = TRUE WHERE match_id = $1 AND settled = FALSE',
        [matchId],
      );
      return (upd.rowCount ?? 0) > 0;
    });
  }

  async recordCardOutcome(input: { matchId: string; assetId: string; to: string; signature: string | null; voided: boolean }): Promise<void> {
    await query(
      `UPDATE escrow_cards SET settle_sig = $2, settled_to = $3, voided = $4, settled = TRUE
       WHERE match_id = $1 AND asset_id = $5`,
      [input.matchId, input.signature, input.to, input.voided, input.assetId],
    );
  }

  /** Record a verified card deposit to escrow (the staker → escrow Bubblegum transfer). */
  async recordDeposit(input: { matchId: string; assetId: string; staker: string; depositSig: string }): Promise<void> {
    await query(
      `INSERT INTO escrow_cards (match_id, asset_id, staker, cluster, deposit_sig)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (match_id, asset_id) DO UPDATE SET deposit_sig = EXCLUDED.deposit_sig`,
      [input.matchId, input.assetId, input.staker, this.cluster, input.depositSig],
    );
  }
}
