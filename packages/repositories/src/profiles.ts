import type { BattleProfile } from '@battler/core';
import { query } from '@battler/server-kit';

interface ProfileDbRow {
  asset_id: string;
  species_id: string;
  level: number;
  battle_profile: BattleProfile;
  derivation_version: number;
}

export async function getProfile(assetId: string): Promise<BattleProfile | null> {
  const res = await query<ProfileDbRow>('SELECT * FROM battle_profiles WHERE asset_id = $1', [assetId]);
  return res.rows[0]?.battle_profile ?? null;
}

/** A profile is fresh only if it exists AND was derived with the current version. */
export async function profileIsCurrent(assetId: string, version: number): Promise<boolean> {
  const res = await query<{ derivation_version: number }>(
    'SELECT derivation_version FROM battle_profiles WHERE asset_id = $1',
    [assetId],
  );
  return res.rows[0]?.derivation_version === version;
}

export async function upsertProfile(profile: BattleProfile): Promise<void> {
  await query(
    `INSERT INTO battle_profiles (asset_id, species_id, level, battle_profile, derivation_version, derived_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (asset_id) DO UPDATE SET
       species_id = EXCLUDED.species_id,
       level = EXCLUDED.level,
       battle_profile = EXCLUDED.battle_profile,
       derivation_version = EXCLUDED.derivation_version,
       derived_at = NOW()`,
    [profile.assetId, profile.species, profile.level, JSON.stringify(profile), profile.derivationVersion],
  );
}

export async function getProfiles(assetIds: string[]): Promise<BattleProfile[]> {
  if (assetIds.length === 0) return [];
  const res = await query<ProfileDbRow>('SELECT * FROM battle_profiles WHERE asset_id = ANY($1)', [assetIds]);
  const byId = new Map(res.rows.map((r) => [r.asset_id, r.battle_profile]));
  // preserve the requested order
  return assetIds.map((id) => byId.get(id)).filter((p): p is BattleProfile => p != null);
}
