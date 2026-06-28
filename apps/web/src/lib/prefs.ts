'use client';

/** Local, device-scoped UI preferences (no server round-trip). */
export interface Prefs {
  muteSound: boolean;
  cardCries: boolean;
  reduceMotion: boolean;
  battleSpeed: 'slow' | 'normal' | 'fast';
  showSprites: boolean;
  compactCards: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  muteSound: false,
  cardCries: true,
  reduceMotion: false,
  battleSpeed: 'normal',
  showSprites: true,
  compactCards: false,
};

const KEY = 'pkx-prefs';

export function getPrefs(): Prefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): Prefs {
  const next = { ...getPrefs(), [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('prefs-changed'));
  } catch {
    /* ignore */
  }
  return next;
}

/** Cheap read of a single boolean pref for hot paths (e.g. sound). */
export function prefEnabled(key: keyof Prefs): boolean {
  return getPrefs()[key] === true;
}
