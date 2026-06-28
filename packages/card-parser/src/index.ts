import { Dex } from '@pkmn/dex';
import Fuse from 'fuse.js';
import type { CardTier, NormalizedCard } from '@battler/core';
import { speciesKey, tidy, toID, transliterate } from './util.js';
import { ALIAS_TABLE, NON_POKEMON_TOKENS } from './aliases.js';

export { toID, speciesKey, transliterate, tidy } from './util.js';
export { ALIAS_TABLE, NON_POKEMON_TOKENS } from './aliases.js';

// ---------------------------------------------------------------------------
// Fuzzy index over base species (built once).
// ---------------------------------------------------------------------------

interface SpeciesLite {
  id: string;
  name: string;
}

function buildFuse(): Fuse<SpeciesLite> {
  const list: SpeciesLite[] = [];
  for (const sp of Dex.species.all()) {
    if (!sp.exists || sp.num <= 0) continue;
    if (sp.isNonstandard === 'CAP' || sp.isNonstandard === 'Custom') continue;
    const isBase = !sp.forme || /Alola|Galar|Hisui|Paldea/.test(sp.forme);
    if (isBase) list.push({ id: sp.id, name: sp.name });
  }
  return new Fuse(list, {
    keys: ['name'],
    includeScore: true,
    threshold: 0.3,
    distance: 50,
    ignoreLocation: true,
    minMatchCharLength: 3,
  });
}

const fuse = buildFuse();

// ---------------------------------------------------------------------------
// Token tables.
// ---------------------------------------------------------------------------

const GRADE_RE = /\b(PSA|BGS|CGC|SGC|GAI|HGA|TAG|ACE)\s*\.?\s*\d{1,2}(?:\.\d)?\b/gi;
const SET_NUMBER_RE = /#?\s*[a-z]{0,3}\d{1,3}\s*\/\s*[a-z]{0,3}\d{1,3}[a-z]?/gi;
const BARE_NUMBER_RE = /#\s*[a-z]{0,3}\d{1,4}[a-z]?\b/gi;
const YEAR_RE = /\b(?:19|20)\d{2}\b/g;

/** TCG tiers in priority order (first match wins for `cardTier`). All are stripped. */
const TIER_PATTERNS: { tag: CardTier; re: RegExp }[] = [
  { tag: 'VMAX', re: /\bVMAX\b/i },
  { tag: 'VSTAR', re: /\bVSTAR\b/i },
  { tag: 'VGMAX', re: /\bVGMAX\b/i },
  { tag: 'GX', re: /\bGX\b/i },
  { tag: 'EX', re: /\bEX\b/ }, // uppercase EX (older era)
  { tag: 'ex', re: /\bex\b/ }, // lowercase ex (Scarlet/Violet era)
  { tag: 'V', re: /\bV\b/ }, // standalone V (after VMAX/VSTAR removed)
  { tag: 'BREAK', re: /\bBREAK\b/i },
  { tag: 'Prime', re: /\bPrime\b/i },
  { tag: 'LV.X', re: /\bLV\.?\s*X\b/i },
];

const OWNER_WORD_RE = /^\s*(Dark|Light)\b/i;
const RARITY_WORD_RE = /^\s*(Radiant|Shining|Delta\s*Species|δ)\b/i;
const POSSESSIVE_RE = /^\s*(.+?'s)\s+/;

const REGION_PREFIXES: { word: RegExp; suffix: string }[] = [
  { word: /^\s*alolan?\b/i, suffix: 'alola' },
  { word: /^\s*galarian?\b/i, suffix: 'galar' },
  { word: /^\s*hisuian?\b/i, suffix: 'hisui' },
  { word: /^\s*paldean?\b/i, suffix: 'paldea' },
];

const MEGA_RE = /^\s*(mega|m)\s+/i;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function resolve(id: string): SpeciesLite | null {
  const sp = Dex.species.get(id);
  return sp?.exists ? { id: sp.id, name: sp.name } : null;
}

/**
 * Normalize a raw TCG card name into a Showdown species + preserved power
 * signals. Pure and synchronous — same input always yields the same output.
 */
export function normalizeCardName(rawName: string): NormalizedCard {
  const out: NormalizedCard = {
    rawName,
    cleanedName: '',
    speciesId: null,
    cardTier: 'base',
    ownerPrefix: null,
    rarityPrefix: null,
    playable: false,
    matchedBy: 'none',
  };

  // 0. tag-team / dual cards ("Charizard & Braixen-GX") → keep the first species
  let s = ` ${rawName} `;
  if (s.includes('&')) s = ` ${s.split('&')[0]!.trim()} `;

  // 1–3. strip grading, set numbers, years
  s = s.replace(GRADE_RE, ' ').replace(SET_NUMBER_RE, ' ').replace(BARE_NUMBER_RE, ' ').replace(YEAR_RE, ' ');

  // 4. TCG tier — record the highest-priority one, strip them all
  for (const { tag, re } of TIER_PATTERNS) {
    if (re.test(s)) {
      if (out.cardTier === 'base') out.cardTier = tag;
      s = s.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'), ' ');
    }
  }

  // 5. prefixes — owner (possessive / Dark / Light) and rarity (Radiant / Shining)
  s = ' ' + s.trim() + ' ';
  const poss = s.match(POSSESSIVE_RE);
  if (poss) {
    out.ownerPrefix = poss[1]!.trim();
    s = ' ' + s.replace(POSSESSIVE_RE, '').trim() + ' ';
  }
  const ownerWord = s.match(OWNER_WORD_RE);
  if (ownerWord) {
    out.ownerPrefix ??= ownerWord[1]!.trim();
    s = ' ' + s.replace(OWNER_WORD_RE, '').trim() + ' ';
  }
  const rarityWord = s.match(RARITY_WORD_RE);
  if (rarityWord) {
    out.rarityPrefix = rarityWord[1]!.replace(/\s+/g, ' ').trim();
    s = ' ' + s.replace(RARITY_WORD_RE, '').trim() + ' ';
  }

  // 6. regional special forms
  let regionSuffix: string | null = null;
  for (const { word, suffix } of REGION_PREFIXES) {
    if (word.test(s)) {
      regionSuffix = suffix;
      s = ' ' + s.replace(word, '').trim() + ' ';
      break;
    }
  }

  // 7. mega / primal → base species (keeps gen9 legality; tier already recorded)
  if (MEGA_RE.test(s)) {
    s = ' ' + s.replace(MEGA_RE, '').replace(/\b([XY])\b\s*$/i, '').trim() + ' ';
  }

  // 8. tidy
  const cleaned = tidy(transliterate(s));
  out.cleanedName = cleaned;
  const key = speciesKey(cleaned);

  if (!key) {
    out.parseFailReason = 'empty_after_strip';
    return out;
  }

  // 9. generic whole-set cards ("2024 Pokemon Japanese SV Terasta") — unplayable.
  //    No real card is named "Pokemon …"; the brand word marks a set-level token.
  if (/\bpokemon\b/.test(cleaned.toLowerCase())) {
    out.parseFailReason = 'generic_set_card';
    return out;
  }

  // 10. Prefix-shrinking exact/alias match. Phygitals names are
  //     "{Pokemon} {Set} #{num}" (species first), so try the longest leading
  //     word-run first and shrink — "Camerupt Obsidian Flames" → "Camerupt",
  //     while multi-word species ("Iron Treads", "Tapu Koko") still match first.
  const words = cleaned.split(/\s+/).filter(Boolean);
  for (let n = words.length; n >= 1; n--) {
    const candidate = words.slice(0, n).join(' ');
    const ck = speciesKey(candidate);
    if (!ck) continue;

    const aliasId = ALIAS_TABLE[ck];
    if (aliasId) {
      const r = resolve(aliasId);
      if (r) return finish(out, r, 'alias');
    }
    if (regionSuffix && n === words.length) {
      const r = resolve(ck + regionSuffix);
      if (r) return finish(out, r, 'regional');
    }
    const exact = resolve(ck);
    if (exact) return finish(out, exact, 'exact');
  }

  // 11. non-Pokémon (Trainer / Energy / Item) → unplayable, skip fuzzy
  if (NON_POKEMON_TOKENS.some((t) => key.includes(t))) {
    out.parseFailReason = 'non_pokemon';
    return out;
  }

  // 12. fuzzy fallback (full cleaned remainder)
  const hit = fuse.search(cleaned, { limit: 1 })[0];
  if (hit && hit.score != null && hit.score <= 0.3) {
    return finish(out, hit.item, 'fuzzy');
  }

  // 13. give up → manual-review queue
  out.parseFailReason = 'no_species_match';
  return out;
}

function finish(
  out: NormalizedCard,
  sp: SpeciesLite,
  matchedBy: NonNullable<NormalizedCard['matchedBy']>,
): NormalizedCard {
  out.speciesId = sp.id;
  out.playable = true;
  out.matchedBy = matchedBy;
  return out;
}

export function normalizeCardNames(names: string[]): NormalizedCard[] {
  return names.map(normalizeCardName);
}
