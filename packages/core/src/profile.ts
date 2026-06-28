/**
 * A BattleProfile is a fully-specified, sim-importable Pokémon derived
 * deterministically from a card's asset ID. "Same asset ID in → same profile
 * out, always" — across server restarts and deployments. The simulator
 * (@pkmn/sim) consumes a packed team built from these directly.
 */

export type StatID = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export type StatsTable = Record<StatID, number>;

export const STAT_IDS: StatID[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

export interface BattleProfile {
  /** The cNFT asset ID this profile was derived from (the seed). */
  assetId: string;
  /** Showdown species id, e.g. "charizard". */
  species: string;
  level: number;
  ability: string;
  nature: string;
  moves: string[]; // 1–4 legal moves (canonical names)
  evs: StatsTable;
  ivs: StatsTable;
  gender?: string;
  item?: string;
  teraType?: string;
  shiny?: boolean;
  /** Display-only: the species' base stats. */
  baseStats?: StatsTable;
  /** Display-only: final in-battle stats (base + IV/EV/level/nature). */
  stats?: StatsTable;
  /** Display-only: the species' types, e.g. ["Fire","Flying"]. */
  types?: string[];
  /** Bump to force re-derivation of all profiles. */
  derivationVersion: number;
}

/** Human-readable breakdown of how the level/power numbers were reached. */
export interface DerivationRationale {
  rarityTier: string;
  baseLevel: number;
  gradeBonus: number;
  tierBonus: number;
  vintageBonus: number;
  finalLevel: number;
  /** 0..100 power score used for matchmaking brackets. */
  powerRating: number;
  notes: string[];
}

export interface DerivedAsset {
  assetId: string;
  speciesId: string;
  profile: BattleProfile;
  rationale: DerivationRationale;
}
