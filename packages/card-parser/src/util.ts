/** Showdown's canonical ID normalizer: lowercase, keep only a-z0-9. */
export function toID(text: unknown): string {
  if (text == null) return '';
  return ('' + text).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Transliterate the accented / gendered characters in Pokémon names so they
 * survive toID() into the right Showdown id:
 *   Flabébé   → flabebe   Nidoran♀ → nidoranf   Nidoran♂ → nidoranm
 */
export function transliterate(name: string): string {
  return name
    .replace(/♀/g, 'f')
    .replace(/♂/g, 'm')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function speciesKey(name: string): string {
  return toID(transliterate(name));
}

/** Collapse whitespace and trim stray separators left after token stripping. */
export function tidy(name: string): string {
  return name
    .replace(/[#/&+:]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s.,'’\-]+|[\s.,'’\-]+$/g, '')
    .trim();
}
