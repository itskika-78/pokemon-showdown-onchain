'use client';

import type { Sfx } from './battlePlayer';
import { getPrefs } from './prefs';

/**
 * Tiny Web-Audio synth for battle SFX — chiptune-style blips that evoke the
 * Gen-5 games without shipping (IP-encumbered) game-rips or risking 404s. One
 * shared AudioContext, unlocked on first user gesture, and silenced by the
 * "Sound effects" preference.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One oscillator "note": shape, start/end frequency, duration, volume. */
function note(
  ac: AudioContext,
  type: OscillatorType,
  f0: number,
  f1: number,
  start: number,
  dur: number,
  vol: number,
): void {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, ac.currentTime + start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), ac.currentTime + start + dur);
  gain.gain.setValueAtTime(0.0001, ac.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(vol, ac.currentTime + start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + dur + 0.02);
}

/** Short filtered-noise burst for "hit" impacts. */
function noise(ac: AudioContext, dur: number, vol: number, hp = 800): void {
  const n = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = hp;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(vol, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start();
  src.stop(ac.currentTime + dur + 0.02);
}

export function playSfx(kind: Sfx | undefined): void {
  if (!kind) return;
  if (getPrefs().muteSound) return;
  const ac = audio();
  if (!ac) return;
  switch (kind) {
    case 'move':
      note(ac, 'square', 520, 760, 0, 0.08, 0.12);
      break;
    case 'hit':
      noise(ac, 0.16, 0.22, 700);
      note(ac, 'sawtooth', 220, 90, 0, 0.16, 0.1);
      break;
    case 'crit':
      noise(ac, 0.2, 0.28, 600);
      note(ac, 'sawtooth', 260, 70, 0, 0.2, 0.14);
      break;
    case 'super': // bright rising arpeggio
      note(ac, 'square', 660, 680, 0, 0.07, 0.12);
      note(ac, 'square', 880, 900, 0.07, 0.07, 0.12);
      note(ac, 'square', 1175, 1200, 0.14, 0.1, 0.12);
      break;
    case 'resist': // dull low blip
      note(ac, 'triangle', 300, 200, 0, 0.16, 0.1);
      break;
    case 'faint': // descending defeat tone
      note(ac, 'square', 520, 90, 0, 0.5, 0.14);
      break;
    case 'status':
      note(ac, 'triangle', 400, 300, 0, 0.12, 0.1);
      note(ac, 'triangle', 320, 240, 0.12, 0.12, 0.1);
      break;
    case 'boost':
      note(ac, 'sine', 500, 900, 0, 0.18, 0.1);
      break;
  }
}
