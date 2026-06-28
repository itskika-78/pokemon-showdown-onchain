import type { MatchStatus, WagerTerms } from '@battler/core';
import { query, withTransaction } from '@battler/server-kit';

export interface MatchRecord {
  id: string;
  p1Pubkey: string;
  p2Pubkey: string;
  p1TeamAssets: string[];
  p2TeamAssets: string[];
  wager: WagerTerms;
  status: MatchStatus;
  winnerPubkey: string | null;
  battleLogHash: string | null;
  feeTaken: number;
}

interface MatchDbRow {
  id: string;
  p1_pubkey: string;
  p2_pubkey: string;
  p1_team_assets: string[];
  p2_team_assets: string[];
  wager_type: WagerTerms['type'];
  wager_amount: string | null;
  wager_asset_id: string | null;
  status: MatchStatus;
  winner_pubkey: string | null;
  battle_log_hash: string | null;
  fee_taken: string;
}

function map(r: MatchDbRow): MatchRecord {
  return {
    id: r.id,
    p1Pubkey: r.p1_pubkey,
    p2Pubkey: r.p2_pubkey,
    p1TeamAssets: r.p1_team_assets,
    p2TeamAssets: r.p2_team_assets,
    wager: {
      type: r.wager_type,
      amount: r.wager_amount == null ? undefined : Number(r.wager_amount),
      assetId: r.wager_asset_id ?? undefined,
    },
    status: r.status,
    winnerPubkey: r.winner_pubkey,
    battleLogHash: r.battle_log_hash,
    feeTaken: Number(r.fee_taken),
  };
}

export interface CreateMatchInput {
  p1: string;
  p2: string;
  p1TeamAssets: string[];
  p2TeamAssets: string[];
  wager: WagerTerms;
}

/** Create an active match, staking the wagered card (app-level lock) if any. */
export async function createMatch(input: CreateMatchInput): Promise<string> {
  return withTransaction(async (client) => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO matches
         (p1_pubkey, p2_pubkey, p1_team_assets, p2_team_assets, wager_type, wager_amount, wager_asset_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active') RETURNING id`,
      [
        input.p1,
        input.p2,
        input.p1TeamAssets,
        input.p2TeamAssets,
        input.wager.type,
        input.wager.amount ?? null,
        input.wager.assetId ?? null,
      ],
    );
    const matchId = res.rows[0]!.id;

    if (input.wager.type === 'card' && input.wager.assetId) {
      const ownerRes = await client.query<{ owner_pubkey: string }>(
        'SELECT owner_pubkey FROM assets WHERE asset_id = $1',
        [input.wager.assetId],
      );
      const owner = ownerRes.rows[0]?.owner_pubkey ?? input.p1;
      await client.query(
        `INSERT INTO staked_cards (match_id, asset_id, original_owner, status)
         VALUES ($1,$2,$3,'locked') ON CONFLICT (match_id, asset_id) DO NOTHING`,
        [matchId, input.wager.assetId, owner],
      );
    }
    return matchId;
  });
}

export async function getMatch(id: string): Promise<MatchRecord | null> {
  const res = await query<MatchDbRow>('SELECT * FROM matches WHERE id = $1', [id]);
  return res.rows[0] ? map(res.rows[0]) : null;
}

export async function saveBattleLog(id: string, log: string, logHash: string): Promise<void> {
  await query('UPDATE matches SET battle_log = $2, battle_log_hash = $3 WHERE id = $1', [id, log, logHash]);
}

export async function voidMatch(id: string, reason: string): Promise<void> {
  await query("UPDATE matches SET status = 'void', forfeit_reason = $2 WHERE id = $1", [id, reason]);
}

export interface MatchVerification {
  battleLog: string | null;
  battleLogHash: string | null;
}

export async function getMatchVerification(id: string): Promise<MatchVerification | null> {
  const res = await query<{ battle_log: string | null; battle_log_hash: string | null }>(
    'SELECT battle_log, battle_log_hash FROM matches WHERE id = $1',
    [id],
  );
  const r = res.rows[0];
  if (!r) return null;
  return { battleLog: r.battle_log, battleLogHash: r.battle_log_hash };
}
