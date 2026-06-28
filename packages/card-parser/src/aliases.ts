/**
 * Hand-curated hard overrides for names the strip+fuzzy pipeline gets wrong on
 * its own. Keys are the cleaned remainder run through speciesKey() (lowercase,
 * alphanumeric, accents transliterated). Values are canonical Showdown ids.
 *
 * This table converges fast: anything that hits the manual-review queue
 * (parseFailReason set) becomes a row here.
 */
export const ALIAS_TABLE: Record<string, string> = {
  // gender-default / ambiguous
  nidoran: 'nidoranf',
  nidoranfemale: 'nidoranf',
  nidoranmale: 'nidoranm',

  // punctuation-heavy names (most also resolve via exact, pinned for safety)
  mrmime: 'mrmime',
  mrrime: 'mrrime',
  mimejr: 'mimejr',
  farfetchd: 'farfetchd',
  sirfetchd: 'sirfetchd',
  typenull: 'typenull',
  hooh: 'hooh',
  porygonz: 'porygonz',
  porygon2: 'porygon2',
  jangmoo: 'jangmoo',
  hakamoo: 'hakamoo',
  kommoo: 'kommoo',
  flabebe: 'flabebe',

  // mascot / promo naming that should collapse to a base species
  detectivepikachu: 'pikachu',
  flyingpikachu: 'pikachu',
  surfingpikachu: 'pikachu',

  // multi-word / hyphenated species (so prefix-shrinking matches them whole)
  tapukoko: 'tapukoko',
  tapulele: 'tapulele',
  tapubulu: 'tapubulu',
  tapufini: 'tapufini',
  greattusk: 'greattusk',
  screamtail: 'screamtail',
  brutebonnet: 'brutebonnet',
  fluttermane: 'fluttermane',
  slitherwing: 'slitherwing',
  sandyshocks: 'sandyshocks',
  irontreads: 'irontreads',
  ironbundle: 'ironbundle',
  ironhands: 'ironhands',
  ironjugulis: 'ironjugulis',
  ironmoth: 'ironmoth',
  ironthorns: 'ironthorns',
  ironvaliant: 'ironvaliant',
  roaringmoon: 'roaringmoon',
  walkingwake: 'walkingwake',
  ironleaves: 'ironleaves',
  gougingfire: 'gougingfire',
  ragingbolt: 'ragingbolt',
};

/** Tokens that mark a non-Pokémon card (Trainer / Energy / Item / Supporter). */
export const NON_POKEMON_TOKENS: string[] = [
  'energy',
  'trainer',
  'supporter',
  'stadium',
  'pokemontool',
  'professor',
  'fullheal',
  'potion',
  'rarecandy',
  'ultraball',
  'quickball',
  'nestball',
  'bossorders',
];
