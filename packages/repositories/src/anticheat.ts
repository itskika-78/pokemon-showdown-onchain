import { query } from '@battler/server-kit';
import { setSuspended } from './users.js';

export type FlagType =
  | 'double_move'
  | 'ownership_mismatch'
  | 'invalid_choice'
  | 'disconnect_forfeit_pattern';

/** 3+ flags of the same type within this window → auto-suspend. */
export const SUSPEND_THRESHOLD = 3;
export const SUSPEND_WINDOW_HOURS = 24;

export async function addFlag(
  pubkey: string,
  flagType: FlagType,
  matchId: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await query(
    'INSERT INTO anti_cheat_flags (pubkey, flag_type, match_id, detail) VALUES ($1, $2, $3, $4)',
    [pubkey, flagType, matchId, JSON.stringify(detail)],
  );
}

export async function countRecentFlags(pubkey: string, flagType: FlagType): Promise<number> {
  const res = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM anti_cheat_flags
     WHERE pubkey = $1 AND flag_type = $2 AND created_at > NOW() - ($3 || ' hours')::interval`,
    [pubkey, flagType, String(SUSPEND_WINDOW_HOURS)],
  );
  return Number(res.rows[0]?.count ?? 0);
}

/** Flag an account and auto-suspend it once it crosses the threshold. */
export async function flagAndMaybeSuspend(
  pubkey: string,
  flagType: FlagType,
  matchId: string | null,
  detail: Record<string, unknown> = {},
): Promise<{ flags: number; suspended: boolean }> {
  await addFlag(pubkey, flagType, matchId, detail);
  const flags = await countRecentFlags(pubkey, flagType);
  const suspended = flags >= SUSPEND_THRESHOLD;
  if (suspended) await setSuspended(pubkey, true);
  return { flags, suspended };
}
