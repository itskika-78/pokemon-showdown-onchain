import Prando from 'prando';
import { Teams, TeamValidator, type PokemonSet } from '@pkmn/sim';
import {
  STAT_IDS,
  type BattleProfile,
  type CardAttributes,
  type DerivedAsset,
  type DerivationRationale,
  type NormalizedCard,
  type StatsTable,
} from '@battler/core';
import { Dex } from './data.js';
import { buildMovePool, selectMoves } from './moves.js';
import { computeLevel, NATURES } from './tables.js';

export interface DeriveOptions {
  generation?: number;
  format?: string;
  derivationVersion?: number;
}

export const DERIVATION_DEFAULTS = {
  generation: 9,
  format: 'gen9customgame',
  derivationVersion: 2,
} as const;

/** PSA 10 → IV floor 20; ungraded defaults to grade 5 → floor 10. */
function ivFloorFromGrade(grade: string | null | undefined): number {
  const g = grade ? Number.parseFloat(grade) : 5;
  const safe = Number.isFinite(g) ? g : 5;
  return Math.max(0, Math.min(31, Math.floor((safe / 10) * 20)));
}

function deriveIVs(rng: Prando, floor: number): StatsTable {
  const ivs = {} as StatsTable;
  for (const stat of STAT_IDS) {
    ivs[stat] = Math.min(31, floor + Math.floor(rng.next() * (31 - floor + 1)));
  }
  return ivs;
}

/** Seeded EV spread: 508-budget, multiples of 4, ≤252/stat, ≤508 total (always legal). */
function deriveEVs(rng: Prando): StatsTable {
  const weights = STAT_IDS.map(() => rng.next());
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const evs: StatsTable = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  let remaining = 508;

  STAT_IDS.forEach((stat, i) => {
    const raw = Math.floor(((weights[i]! / sum) * 508) / 4) * 4;
    const val = Math.max(0, Math.min(raw, 252, remaining));
    evs[stat] = val;
    remaining -= val;
  });

  // distribute leftover (multiples of 4) into stats with room
  let idx = 0;
  while (remaining >= 4 && idx < 64) {
    const stat = STAT_IDS[idx % STAT_IDS.length]!;
    if (evs[stat] < 252) {
      const add = Math.min(4, 252 - evs[stat], remaining);
      evs[stat] += add;
      remaining -= add;
    }
    idx++;
  }
  return evs;
}

// ---------------------------------------------------------------------------
// TeamValidator (cached per format).
// ---------------------------------------------------------------------------

const validatorCache = new Map<string, TeamValidator>();
function getValidator(format: string): TeamValidator {
  let v = validatorCache.get(format);
  if (!v) {
    v = new TeamValidator(format);
    validatorCache.set(format, v);
  }
  return v;
}

/** Convert a stored BattleProfile into a sim-importable PokemonSet. */
export function toPokemonSet(p: BattleProfile): PokemonSet {
  return {
    name: p.species,
    species: p.species,
    item: p.item ?? '',
    ability: p.ability,
    moves: p.moves,
    nature: p.nature,
    gender: (p.gender ?? '') as PokemonSet['gender'],
    evs: p.evs,
    ivs: p.ivs,
    level: p.level,
    teraType: p.teraType,
  } as PokemonSet;
}

export function buildTeam(profiles: BattleProfile[]): PokemonSet[] {
  return profiles.slice(0, 6).map(toPokemonSet);
}

/** Returns null if `profile` is a legal team for `format`, else the problems. */
export function validateProfile(profile: BattleProfile, format: string = DERIVATION_DEFAULTS.format): string[] | null {
  const packed = Teams.pack([toPokemonSet(profile)]);
  const unpacked = Teams.unpack(packed);
  if (!unpacked) return ['Failed to pack/unpack team'];
  return getValidator(format).validateTeam(unpacked);
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/**
 * Deterministically derive a sim-legal BattleProfile from a cNFT asset ID.
 * Seeded by the asset ID via Prando — same ID + card always yields the same
 * Pokémon. Validates against TeamValidator and throws if it cannot produce a
 * legal team (after a one-pass repair).
 */
export async function deriveBattleProfile(
  assetId: string,
  card: NormalizedCard,
  attrs: CardAttributes,
  opts: DeriveOptions = {},
): Promise<DerivedAsset> {
  if (!card.playable || !card.speciesId) {
    throw new Error(`Cannot derive a battle profile for an unplayable card: ${card.rawName}`);
  }

  const format = opts.format ?? DERIVATION_DEFAULTS.format;
  const derivationVersion = opts.derivationVersion ?? DERIVATION_DEFAULTS.derivationVersion;

  const species = Dex.species.get(card.speciesId);
  if (!species?.exists) {
    throw new Error(`Species "${card.speciesId}" does not exist in the dex`);
  }

  // Level is fully deterministic from metadata (no RNG).
  const lvl = computeLevel(card.cardTier, attrs, card.ownerPrefix);
  const level = lvl.level;

  // Seeded, fixed draw order: nature → IVs → EVs → ability → moves → gender → tera.
  const rng = new Prando(assetId);

  const nature = NATURES[Math.floor(rng.next() * NATURES.length)]!;
  const ivs = deriveIVs(rng, ivFloorFromGrade(attrs.grade));
  const evs = deriveEVs(rng);

  const abilities = Object.values(species.abilities).filter(
    (a): a is string => typeof a === 'string' && a.length > 0,
  );
  const ability = abilities.length ? abilities[Math.floor(rng.next() * abilities.length)]! : 'No Ability';

  const pool = await buildMovePool(species.id, level);
  const stabTypes = new Set(species.types);
  const moves = selectMoves(pool, stabTypes, rng);

  let gender = '';
  if (species.gender === 'M' || species.gender === 'F' || species.gender === 'N') {
    gender = species.gender;
  } else {
    gender = rng.next() < 0.5 ? 'M' : 'F';
  }
  const teraType = species.types[Math.floor(rng.next() * species.types.length)]!;

  const profile: BattleProfile = {
    assetId,
    species: species.id,
    level,
    ability,
    nature,
    moves,
    evs,
    ivs,
    gender,
    item: '',
    teraType,
    derivationVersion,
  };

  // ALWAYS validate before returning. Repair flagged moves once; if still
  // invalid, fall back to a GUARANTEED-LEGAL set (a single legal move, 31 IVs,
  // 0 EVs, neutral nature) rather than throwing — the card stays playable.
  let problems = validateProfile(profile, format);
  if (problems && problems.length) {
    const flagged = profile.moves.filter((m) => problems!.some((p) => p.includes(m)));
    if (flagged.length) {
      profile.moves = profile.moves.filter((m) => !flagged.includes(m));
      problems = validateProfile(profile, format);
    }
    if (problems && problems.length) {
      const fb = pool.levelUp[0]?.name ?? pool.other[0]?.name;
      profile.moves = fb ? [fb] : profile.moves;
      profile.nature = 'Hardy';
      profile.evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      profile.ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
      problems = validateProfile(profile, format);
      if (problems && problems.length) {
        throw new Error(`Could not produce a legal team for ${species.id}: ${problems.join(', ')}`);
      }
    }
  }

  // Display-only stat block: standard Gen-3+ stat formula from the derived set.
  const nat = Dex.natures.get(profile.nature);
  const finalStats = {} as StatsTable;
  for (const k of STAT_IDS) {
    const base = species.baseStats[k];
    const common = Math.floor(((2 * base + profile.ivs[k] + Math.floor(profile.evs[k] / 4)) * profile.level) / 100);
    if (k === 'hp') {
      finalStats.hp = base === 1 ? 1 : common + profile.level + 10;
    } else {
      const mod = nat?.plus === k ? 1.1 : nat?.minus === k ? 0.9 : 1;
      finalStats[k] = Math.floor((common + 5) * mod);
    }
  }
  profile.baseStats = { ...species.baseStats } as StatsTable;
  profile.stats = finalStats;
  profile.types = [...species.types];

  const bst = STAT_IDS.reduce((s, k) => s + species.baseStats[k], 0);
  const ivAvg = STAT_IDS.reduce((s, k) => s + ivs[k], 0) / (STAT_IDS.length * 31);
  const powerRating = Math.max(
    0,
    Math.min(100, Math.round((level / 100) * 60 + ivAvg * 20 + (bst / 720) * 20)),
  );

  const rationale: DerivationRationale = {
    rarityTier: lvl.rarityLabel,
    baseLevel: lvl.baseLevel,
    gradeBonus: lvl.gradeBonus,
    tierBonus: lvl.tierBonus,
    vintageBonus: lvl.vintageBonus,
    finalLevel: level,
    powerRating,
    notes: [
      `rarity: ${attrs.rarity ?? 'n/a'} (base ${lvl.baseLevel})`,
      `tier: ${card.cardTier} (+${lvl.tierBonus})`,
      attrs.grade ? `grade: ${attrs.gradingCompany ?? ''} ${attrs.grade} (+${lvl.gradeBonus})`.trim() : 'ungraded',
      attrs.year ? `year: ${attrs.year} (+${lvl.vintageBonus})` : 'no year',
      card.ownerPrefix ? `owner: ${card.ownerPrefix} (+${lvl.ownerPrefixBonus})` : 'no owner prefix',
      `nature: ${nature}, ability: ${ability}`,
    ],
  };

  return { assetId, speciesId: species.id, profile, rationale };
}
