import { query } from '@battler/server-kit';

export async function getTeam(pubkey: string): Promise<string[]> {
  const res = await query<{ asset_ids: string[] }>('SELECT asset_ids FROM teams WHERE pubkey = $1', [pubkey]);
  return res.rows[0]?.asset_ids ?? [];
}

export async function setTeam(pubkey: string, assetIds: string[]): Promise<void> {
  await query(
    `INSERT INTO teams (pubkey, asset_ids, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (pubkey) DO UPDATE SET asset_ids = EXCLUDED.asset_ids, updated_at = NOW()`,
    [pubkey, assetIds],
  );
}
