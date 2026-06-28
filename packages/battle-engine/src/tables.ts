/**
 * The power-mapping tables — "the algorithm". Level is fully deterministic from
 * the card's metadata (no RNG):
 *   level = base(rarity) + gradeBonus + tierBonus + vintageBonus + ownerPrefixBonus
 * Tuning these constants IS the central balance lever (pay-to-win vs cosmetics).
 */

import type { CardAttributes, CardTier } from '@battler/core';

/** Exact base level by published rarity string (Phygitals/TCG categories). */
export const RARITY_BASE: Record<string, number> = {
  Common: 50,
  Uncommon: 55,
  Rare: 62,
  'Rare Holo': 65,
  'Rare Holo V': 67,
  'Illustration Rare': 73,
  'Ultra Rare': 70,
  'Secret Rare': 75,
  'Hyper Rare': 77,
  'Special Illustration Rare': 78,
  'Rainbow Rare': 79,
  'Gold Rare': 80,
  'Radiant Rare': 66,
  'Double Rare': 64,
};

/** Base level for a rarity string: exact match, else a fuzzy bucket, else 50. */
export function baseLevelForRarity(rarity: string | null | undefined): number {
  if (!rarity) return 50;
  if (RARITY_BASE[rarity] != null) return RARITY_BASE[rarity]!;
  const r = rarity.toLowerCase();
  if (/secret|rainbow|\bgold\b|hyper|special illustration/.test(r)) return 77;
  if (/ultra|illustration|full art|alt(ernate)? art/.test(r)) return 71;
  if (/holo|radiant|shining|double rare|\brare\b/.test(r)) return 63;
  if (/uncommon/.test(r)) return 55;
  if (/common/.test(r)) return 50;
  return 50;
}

export const TIER_BONUS: Record<string, number> = {
  VMAX: 10,
  VGMAX: 10,
  VSTAR: 9,
  GX: 8,
  EX: 7,
  ex: 7,
  'LV.X': 6,
  V: 5,
  BREAK: 4,
  Prime: 3,
  base: 0,
};

export function tierBonus(tier: CardTier): number {
  return TIER_BONUS[tier] ?? 0;
}

/** PSA 10 → +8; floor((grade/10)*8). Ungraded defaults to grade 5 → +4. */
export function gradeBonus(grade: string | null | undefined): number {
  const g = grade != null && grade !== '' ? Number.parseFloat(grade) : 5;
  if (!Number.isFinite(g) || g <= 0) return 0;
  return Math.floor((g / 10) * 8);
}

/** Older cards are more desirable. */
export function vintageBonus(year: string | null | undefined): number {
  const y = year ? Number.parseInt(year, 10) : NaN;
  if (!Number.isFinite(y)) return 0;
  if (y < 2000) return 6;
  if (y < 2003) return 3;
  return 0;
}

/** Character-owned cards (Misty's, Team Rocket's, Dark …) get a small bump. */
export function ownerPrefixBonus(ownerPrefix: string | null | undefined): number {
  return ownerPrefix ? 2 : 0;
}

export function clampLevel(n: number): number {
  return Math.max(1, Math.min(100, Math.round(n)));
}

export interface LevelBreakdown {
  baseLevel: number;
  gradeBonus: number;
  tierBonus: number;
  vintageBonus: number;
  ownerPrefixBonus: number;
  level: number;
  rarityLabel: string;
}

/** Full, deterministic level computation used by derivation + UI previews. */
export function computeLevel(
  tier: CardTier,
  attrs: CardAttributes,
  ownerPrefix?: string | null,
): LevelBreakdown {
  const baseLevel = baseLevelForRarity(attrs.rarity);
  const gB = gradeBonus(attrs.grade);
  const tB = tierBonus(tier);
  const vB = vintageBonus(attrs.year);
  const oB = ownerPrefixBonus(ownerPrefix);
  return {
    baseLevel,
    gradeBonus: gB,
    tierBonus: tB,
    vintageBonus: vB,
    ownerPrefixBonus: oB,
    level: clampLevel(baseLevel + gB + tB + vB + oB),
    rarityLabel: attrs.rarity ?? 'Common',
  };
}

export const NATURES = [
  'Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty',
  'Bold', 'Docile', 'Relaxed', 'Impish', 'Lax',
  'Timid', 'Hasty', 'Serious', 'Jolly', 'Naive',
  'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash',
  'Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky',
] as const;
