'use client';

import { useReducedMotion } from '@/hooks/useReducedMotion';
import { clientConfig } from '@/lib/clientConfig';

/**
 * Bright Pokémon-TCG-style backdrop: a soft sky gradient + dotted energy grid
 * with a scatter of animated Pokémon sprites gently floating behind the glass
 * UI. Sprites are gated behind the same dev art flag as the rest of the app.
 */
const FLOATERS = [
  { id: 'pikachu', top: '13%', left: '5%', size: 116, dur: 7.0, delay: 0.0, rot: -8 },
  { id: 'charizard', top: '63%', left: '3%', size: 148, dur: 9.0, delay: 1.2, rot: 6 },
  { id: 'bulbasaur', top: '22%', left: '89%', size: 118, dur: 8.0, delay: 0.6, rot: 7 },
  { id: 'squirtle', top: '70%', left: '91%', size: 120, dur: 7.6, delay: 2.0, rot: -6 },
  { id: 'gengar', top: '6%', left: '54%', size: 96, dur: 10.0, delay: 0.4, rot: 5 },
  { id: 'eevee', top: '85%', left: '42%', size: 92, dur: 8.4, delay: 1.6, rot: -5 },
  { id: 'snorlax', top: '46%', left: '95%', size: 128, dur: 11.0, delay: 0.9, rot: 4 },
  { id: 'jigglypuff', top: '52%', left: '1%', size: 88, dur: 9.4, delay: 1.1, rot: -7 },
  { id: 'mew', top: '34%', left: '46%', size: 80, dur: 12.0, delay: 0.3, rot: 3 },
];

export function AppBackground() {
  const reduced = useReducedMotion();

  return (
    <div className="poke-bg" aria-hidden>
      <div className="poke-bg-sky" />
      <div className="poke-bg-grid" />
      {clientConfig.enablePokemonArt && (
        <div className="poke-floaters">
          {FLOATERS.map((f) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={f.id}
              className="poke-floater"
              src={`${clientConfig.spriteHost}/gen5ani/${f.id}.gif`}
              alt=""
              style={{
                top: f.top,
                left: f.left,
                width: f.size,
                // CSS var consumed by the float keyframes for a per-sprite tilt.
                ['--r' as string]: `${f.rot}deg`,
                animationDuration: reduced ? '0s' : `${f.dur}s`,
                animationDelay: `${f.delay}s`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}
    </div>
  );
}
