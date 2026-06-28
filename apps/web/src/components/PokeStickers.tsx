'use client';

import { useEffect, useState } from 'react';
import { clientConfig } from '@/lib/clientConfig';
import { useParallaxStickers } from '@/hooks/useParallaxStickers';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const SPECIES = [
  'pikachu', 'charizard', 'bulbasaur', 'squirtle', 'gengar', 'snorlax', 'mewtwo', 'eevee',
  'jigglypuff', 'lucario', 'gardevoir', 'dragonite', 'lapras', 'gyarados', 'machamp', 'blastoise',
  'venusaur', 'umbreon', 'garchomp', 'magikarp', 'psyduck', 'vaporeon', 'jolteon', 'flareon',
  'scizor', 'tyranitar', 'metagross', 'rayquaza', 'pichu', 'togepi', 'cubone', 'ditto',
  'slowpoke', 'mudkip', 'torchic', 'treecko', 'piplup', 'chimchar', 'turtwig', 'absol',
];

const ANCHORS: { pos: React.CSSProperties; size: number }[] = [
  { pos: { top: '13%', left: '3%' }, size: 96 },
  { pos: { top: '23%', right: '4%' }, size: 108 },
  { pos: { top: '50%', left: '1.5%' }, size: 88 },
  { pos: { top: '63%', right: '2.5%' }, size: 100 },
  { pos: { bottom: '7%', left: '9%' }, size: 84 },
  { pos: { top: '38%', right: '10%' }, size: 72 },
  { pos: { bottom: '11%', right: '22%' }, size: 92 },
  { pos: { top: '7%', left: '38%' }, size: 62 },
  { pos: { bottom: '18%', left: '28%' }, size: 70 },
];

const spriteUrl = (id: string) => `${clientConfig.spriteHost}/gen5ani/${id}.gif`;
const rand = (min: number, max: number) => min + Math.random() * (max - min);

interface Sticker {
  id: string;
  pos: React.CSSProperties;
  size: number;
  dur: number;
  delay: number;
  rot: number;
  opacity: number;
  blur: number;
  depth: number;
}

export function PokeStickers({
  count = 9,
  interactive = false,
}: {
  count?: number;
  interactive?: boolean;
}) {
  const [items, setItems] = useState<Sticker[]>([]);
  const reduced = useReducedMotion();
  const parallaxRef = useParallaxStickers(interactive && !reduced);

  useEffect(() => {
    if (!clientConfig.enablePokemonArt) return;
    const pool = [...SPECIES].sort(() => Math.random() - 0.5);
    const n = Math.min(count, ANCHORS.length);
    setItems(
      ANCHORS.slice(0, n).map((a, i) => {
        const size = Math.round(a.size + rand(-10, 12));
        // Smaller stickers read as "farther": more blur, lower opacity, slower
        // drift — a tasteful depth field instead of flat clip-art.
        const far = size < 84;
        return {
          id: pool[i % pool.length]!,
          pos: a.pos,
          size,
          dur: rand(5, 8),
          delay: -rand(0, 6),
          rot: rand(-8, 8),
          opacity: far ? rand(0.32, 0.5) : rand(0.6, 0.82),
          blur: far ? rand(1.4, 2.6) : rand(0, 0.6),
          depth: far ? 0.45 : 1,
        };
      }),
    );
  }, [count]);

  if (items.length === 0) return null;

  const layerClass = `sticker-layer${interactive ? ' interactive' : ''}`;

  return (
    <div ref={parallaxRef} className={layerClass} aria-hidden>
      {items.map((it, i) => (
        <span
          key={i}
          className="sticker"
          style={{
            ...it.pos,
            opacity: it.opacity,
            filter: it.blur ? `blur(${it.blur}px)` : undefined,
            animationDuration: `${it.dur}s`,
            animationDelay: `${it.delay}s`,
            ['--rot' as string]: `${it.rot}deg`,
            ['--depth' as string]: String(it.depth),
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={spriteUrl(it.id)}
            alt=""
            style={{ width: it.size }}
            onError={(e) => {
              const el = e.currentTarget.parentElement as HTMLElement | null;
              if (el) el.style.display = 'none';
            }}
          />
        </span>
      ))}
    </div>
  );
}
