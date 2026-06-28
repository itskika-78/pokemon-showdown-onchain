'use client';

import { clientConfig } from './clientConfig';
import { getPrefs } from './prefs';

// One shared <audio> element so cries never stack into a cacophony, plus a small
// throttle so re-hovering the same Pokémon doesn't retrigger constantly.
let audio: HTMLAudioElement | null = null;
let lastId = '';
let lastAt = 0;

/** Play a Pokémon's cry (Showdown CDN mp3). No-op on autoplay block / failure. */
export function playCry(speciesId: string | null | undefined, volume = 0.35): void {
  if (typeof window === 'undefined' || !speciesId) return;
  const prefs = getPrefs();
  if (prefs.muteSound || !prefs.cardCries) return; // respect device sound prefs
  const now = Date.now();
  if (speciesId === lastId && now - lastAt < 1100) return;
  lastId = speciesId;
  lastAt = now;
  try {
    if (!audio) audio = new Audio();
    audio.pause();
    audio.src = `${clientConfig.cryHost}/${speciesId}.mp3`;
    audio.volume = Math.max(0, Math.min(1, volume));
    void audio.play().catch(() => {});
  } catch {
    /* ignore */
  }
}
