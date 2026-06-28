/**
 * Output of the card-name parser (@battler/card-parser). Card names are noisy:
 * "Dark Charizard #4/82 PSA 9", "Radiant Greninja", "Team Rocket's Meowth",
 * "Mr. Mime", "Charizard & Braixen-GX". The parser strips the noise to a base
 * Showdown species while PRESERVING the power-signal tokens (tier, prefixes) the
 * derivation step consumes.
 */

/** The highest TCG tier found on the card (used by the power formula). */
export type CardTier =
  | 'VMAX'
  | 'VSTAR'
  | 'VGMAX'
  | 'GX'
  | 'EX'
  | 'ex'
  | 'V'
  | 'BREAK'
  | 'Prime'
  | 'LV.X'
  | 'base'
  | (string & {});

export interface NormalizedCard {
  rawName: string;
  cleanedName: string;
  /** Showdown toID-format species, e.g. "charizard", "raichualola". Null = unmatched. */
  speciesId: string | null;
  cardTier: CardTier;
  /** "Dark", "Team Rocket's", "Misty's", "Lt. Surge's" … */
  ownerPrefix: string | null;
  /** "Radiant", "Shining", "Delta Species" … */
  rarityPrefix: string | null;
  playable: boolean;
  /** Why parsing failed (for the manual-review queue). */
  parseFailReason?: 'no_species_match' | 'empty_after_strip' | 'non_pokemon' | 'generic_set_card';
  /** Which matcher produced the species (debugging / review). */
  matchedBy?: 'exact' | 'alias' | 'regional' | 'fuzzy' | 'none';
}

/**
 * The standard Phygitals-style attribute set, extracted from a DAS asset's
 * `content.metadata.attributes`. Strings (as they arrive on-chain); the
 * derivation step parses the numerics it needs.
 */
export interface CardAttributes {
  grade: string | null; // "10", "9.5" (raw; derivation parses to number)
  gradingCompany: string | null; // "PSA", "BGS", "CGC", "SGC"
  set: string | null; // "Obsidian Flames"
  cardNumber: string | null; // "148/197"
  rarity: string | null; // "Uncommon", "Secret Rare", "Common"
  year: string | null; // "2023"
  language: string | null; // "English", "Japanese"
  certNumber: string | null; // grading certification number
}

export function emptyAttributes(): CardAttributes {
  return {
    grade: null,
    gradingCompany: null,
    set: null,
    cardNumber: null,
    rarity: null,
    year: null,
    language: null,
    certNumber: null,
  };
}
