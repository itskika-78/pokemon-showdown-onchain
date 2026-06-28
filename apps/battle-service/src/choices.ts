/**
 * Choice validation — the anti-cheat foundation. The server only accepts
 * well-formed choices that the sim's current `|request|` actually offers.
 */

const WELL_FORMED = /^(move [1-4]|switch [1-6]|team [1-6]{1,6}|pass|default)$/;

export function isWellFormedChoice(choice: string): boolean {
  return WELL_FORMED.test(choice.trim());
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// The request is the sim's dynamic JSON blob; validated structurally here.
export function isChoiceAllowedByRequest(choice: string, request: any): boolean {
  if (!request) return false;
  const c = choice.trim();

  if (request.teamPreview) {
    if (c === 'default') return true;
    const m = /^team ([1-6]{1,6})$/.exec(c);
    if (!m) return false;
    const digits = (m[1] ?? '').split('');
    const size = request.side?.pokemon?.length ?? 6;
    const unique = new Set(digits);
    return unique.size === digits.length && digits.every((d) => Number(d) >= 1 && Number(d) <= size);
  }
  if (c === 'default' || c === 'pass') return true;

  if (Array.isArray(request.forceSwitch) && request.forceSwitch.some(Boolean)) {
    const m = /^switch ([1-6])$/.exec(c);
    if (!m) return false;
    const idx = Number(m[1]) - 1;
    const mon = request.side?.pokemon?.[idx];
    return !!mon && !mon.active && !/ fnt$/.test(mon.condition ?? '');
  }

  if (Array.isArray(request.active)) {
    const move = /^move ([1-4])$/.exec(c);
    if (move) {
      const idx = Number(move[1]) - 1;
      const slot = request.active[0]?.moves?.[idx];
      return !!slot && !slot.disabled;
    }
    const sw = /^switch ([1-6])$/.exec(c);
    if (sw) {
      const idx = Number(sw[1]) - 1;
      const mon = request.side?.pokemon?.[idx];
      return !!mon && !mon.active && !/ fnt$/.test(mon.condition ?? '');
    }
  }
  return false;
}
