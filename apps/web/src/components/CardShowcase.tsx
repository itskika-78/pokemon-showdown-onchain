'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { clientConfig } from '@/lib/clientConfig';
import { playCry } from '@/lib/cry';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Premium TCG-style card showcase.
 *
 * Each card renders the REAL Pokémon TCG scan. Hovering tilts the card in 3D and
 * floats up a non-intrusive stat ribbon (Lv / HP / quick bars). Clicking smoothly
 * zooms into the actual card inside an inspector lightbox where the real printed
 * details are readable and elegant overlays surface the in-game derived stats
 * (Level, HP, Attack, Defense, Sp. stats, Speed) and signature Moves.
 *
 * Data is a curated, real-card set — intentional for the landing showcase.
 */

export type StatKey = 'atk' | 'def' | 'spa' | 'spd' | 'spe';

export type ShowcaseCard = {
  id: string;
  name: string;
  species: string; // showdown sprite/cry id
  image: string;
  set: string;
  number: string;
  year: string;
  grade?: string;
  rarity: string;
  accent: string; // hex accent for glows / chips
  types: string[];
  level: number;
  hp: number;
  stats: Record<StatKey, number>;
  moves: { name: string; type: string; power: string }[];
  floor: string;
};

const TYPE_COLOR: Record<string, string> = {
  Fire: '#ff7a3c', Water: '#3a9bf5', Grass: '#4cb05a', Electric: '#f6c945',
  Psychic: '#f65f86', Flying: '#8fa8e8', Poison: '#a25cc8', Dragon: '#6155f0',
  Normal: '#9099a1', Ice: '#62c6d3', Ground: '#dcb44e', Rock: '#b6a14a',
  Fighting: '#e0392b', Ghost: '#6a5aa0', Dark: '#4f4860', Steel: '#62a0b8',
  Bug: '#9bbd2a', Fairy: '#ef8fd6',
};

export const SHOWCASE_CARDS: ShowcaseCard[] = [
  {
    id: 'charizard', name: 'Charizard', species: 'charizard',
    image: 'https://images.pokemontcg.io/base1/4_hires.png',
    set: 'Base Set', number: '4 / 102', year: '1999', grade: 'PSA 10', rarity: 'Holo Rare',
    accent: '#ff6a2c', types: ['Fire', 'Flying'], level: 76, hp: 360,
    stats: { atk: 84, def: 78, spa: 109, spd: 85, spe: 100 },
    moves: [
      { name: 'Fire Spin', type: 'Fire', power: '100' },
      { name: 'Air Slash', type: 'Flying', power: '75' },
      { name: 'Dragon Pulse', type: 'Dragon', power: '85' },
      { name: 'Solar Beam', type: 'Grass', power: '120' },
    ],
    floor: '420.0',
  },
  {
    id: 'blastoise', name: 'Blastoise', species: 'blastoise',
    image: 'https://images.pokemontcg.io/base1/2_hires.png',
    set: 'Base Set', number: '2 / 102', year: '1999', grade: 'PSA 9', rarity: 'Holo Rare',
    accent: '#3a9bf5', types: ['Water'], level: 74, hp: 318,
    stats: { atk: 83, def: 100, spa: 85, spd: 105, spe: 78 },
    moves: [
      { name: 'Hydro Pump', type: 'Water', power: '110' },
      { name: 'Ice Beam', type: 'Ice', power: '90' },
      { name: 'Flash Cannon', type: 'Steel', power: '80' },
      { name: 'Aqua Tail', type: 'Water', power: '90' },
    ],
    floor: '128.0',
  },
  {
    id: 'venusaur', name: 'Venusaur', species: 'venusaur',
    image: 'https://images.pokemontcg.io/base1/15_hires.png',
    set: 'Base Set', number: '15 / 102', year: '1999', grade: 'PSA 9', rarity: 'Holo Rare',
    accent: '#4cb05a', types: ['Grass', 'Poison'], level: 73, hp: 324,
    stats: { atk: 82, def: 83, spa: 100, spd: 100, spe: 80 },
    moves: [
      { name: 'Solar Beam', type: 'Grass', power: '120' },
      { name: 'Sludge Bomb', type: 'Poison', power: '90' },
      { name: 'Earthquake', type: 'Ground', power: '100' },
      { name: 'Synthesis', type: 'Grass', power: '—' },
    ],
    floor: '96.0',
  },
  {
    id: 'mewtwo', name: 'Mewtwo', species: 'mewtwo',
    image: 'https://images.pokemontcg.io/base1/10_hires.png',
    set: 'Base Set', number: '10 / 102', year: '1999', grade: 'PSA 10', rarity: 'Holo Rare',
    accent: '#f65f86', types: ['Psychic'], level: 78, hp: 348,
    stats: { atk: 110, def: 90, spa: 154, spd: 90, spe: 130 },
    moves: [
      { name: 'Psystrike', type: 'Psychic', power: '100' },
      { name: 'Aura Sphere', type: 'Fighting', power: '80' },
      { name: 'Shadow Ball', type: 'Ghost', power: '80' },
      { name: 'Recover', type: 'Normal', power: '—' },
    ],
    floor: '210.0',
  },
  {
    id: 'zapdos', name: 'Zapdos', species: 'zapdos',
    image: 'https://images.pokemontcg.io/base1/16_hires.png',
    set: 'Base Set', number: '16 / 102', year: '1999', grade: 'PSA 9', rarity: 'Holo Rare',
    accent: '#f6c945', types: ['Electric', 'Flying'], level: 72, hp: 282,
    stats: { atk: 90, def: 85, spa: 125, spd: 90, spe: 100 },
    moves: [
      { name: 'Thunderbolt', type: 'Electric', power: '90' },
      { name: 'Hurricane', type: 'Flying', power: '110' },
      { name: 'Heat Wave', type: 'Fire', power: '95' },
      { name: 'Thunder Wave', type: 'Electric', power: '—' },
    ],
    floor: '74.0',
  },
  {
    id: 'pikachu', name: 'Pikachu', species: 'pikachu',
    image: 'https://images.pokemontcg.io/base1/58_hires.png',
    set: 'Base Set', number: '58 / 102', year: '1999', rarity: 'Common',
    accent: '#f6c945', types: ['Electric'], level: 35, hp: 211,
    stats: { atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
    moves: [
      { name: 'Thunderbolt', type: 'Electric', power: '90' },
      { name: 'Quick Attack', type: 'Normal', power: '40' },
      { name: 'Iron Tail', type: 'Steel', power: '100' },
      { name: 'Volt Tackle', type: 'Electric', power: '120' },
    ],
    floor: '12.0',
  },
];

const STAT_LABEL: Record<StatKey, string> = {
  atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed',
};

function TypeChip({ t }: { t: string }) {
  return (
    <span className="pp-type" style={{ ['--tc' as string]: TYPE_COLOR[t] ?? '#9099a1' }}>
      {t}
    </span>
  );
}

/** 3D pointer-tilt + glare handlers shared by tiles and the lightbox card. */
function useTilt(disabled: boolean) {
  const onMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (disabled) return;
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      el.style.setProperty('--rx', `${(0.5 - py) * 16}deg`);
      el.style.setProperty('--ry', `${(px - 0.5) * 18}deg`);
      el.style.setProperty('--gx', `${px * 100}%`);
      el.style.setProperty('--gy', `${py * 100}%`);
    },
    [disabled],
  );
  const onLeave = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  }, []);
  return { onMove, onLeave };
}

function CardTileFace({ card, onError, ok }: { card: ShowcaseCard; ok: boolean; onError: () => void }) {
  if (ok && clientConfig.enablePokemonArt) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={card.image} alt={`${card.name} — ${card.set}`} onError={onError} draggable={false} />
    );
  }
  return (
    <div className="pp-card-fallback" style={{ ['--ac' as string]: card.accent }}>
      <div className="pp-card-fallback-top">
        <span>{card.name}</span>
        <span>{card.hp} HP</span>
      </div>
      <div className="pp-card-fallback-art">
        {clientConfig.enablePokemonArt && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${clientConfig.spriteHost}/gen5ani/${card.species}.gif`} alt="" draggable={false} />
        )}
      </div>
      <div className="pp-card-fallback-foot">
        <span>{card.types.join(' · ')}</span>
        <span>{card.number}</span>
      </div>
    </div>
  );
}

function ShowcaseTile({ card, onOpen, reduced }: { card: ShowcaseCard; onOpen: () => void; reduced: boolean }) {
  const [ok, setOk] = useState(true);
  const tilt = useTilt(reduced);
  const topStats: StatKey[] = ['atk', 'def', 'spe'];
  return (
    <button
      type="button"
      className="pp-tile"
      style={{ ['--ac' as string]: card.accent }}
      onClick={onOpen}
      onPointerMove={tilt.onMove}
      onPointerLeave={tilt.onLeave}
      onMouseEnter={() => clientConfig.enablePokemonArt && playCry(card.species)}
      aria-label={`Inspect ${card.name}, ${card.set}`}
    >
      <span className="pp-tile-glow" aria-hidden />
      <span className="pp-tile-inner">
        <span className="pp-tile-scan">
          <CardTileFace card={card} ok={ok} onError={() => setOk(false)} />
          <span className="pp-tile-holo" aria-hidden />
          <span className="pp-tile-glare" aria-hidden />
        </span>

        {card.grade && <span className="pp-grade">{card.grade}</span>}
        <span className="pp-tile-zoom" aria-hidden>
          <Icon name="search" size={16} />
        </span>

        {/* non-intrusive stat ribbon — slides up on hover */}
        <span className="pp-ribbon">
          <span className="pp-ribbon-head">
            <span className="pp-ribbon-name">{card.name}</span>
            <span className="pp-ribbon-lv">Lv {card.level}</span>
          </span>
          <span className="pp-ribbon-hp">
            <b>{card.hp}</b> HP
            <span className="pp-ribbon-types">
              {card.types.map((t) => <TypeChip key={t} t={t} />)}
            </span>
          </span>
          <span className="pp-ribbon-bars">
            {topStats.map((k) => (
              <span className="pp-mini" key={k}>
                <span className="pp-mini-l">{STAT_LABEL[k].slice(0, 3).toUpperCase()}</span>
                <span className="pp-mini-track">
                  <span style={{ width: `${Math.min(100, (card.stats[k] / 160) * 100)}%` }} />
                </span>
              </span>
            ))}
          </span>
        </span>
      </span>
    </button>
  );
}

function Inspector({ card, onClose }: { card: ShowcaseCard; onClose: () => void }) {
  const reduced = useReducedMotion();
  const tilt = useTilt(reduced);
  const [shown, setShown] = useState(false);
  const [ok, setOk] = useState(true);

  useEffect(() => {
    // Reveal on the next frame for the enter transition, with a timer fallback
    // (rAF is throttled in background tabs, which would leave the modal at opacity 0).
    const raf = requestAnimationFrame(() => setShown(true));
    const t = setTimeout(() => setShown(true), 60);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    if (clientConfig.enablePokemonArt) playCry(card.species);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [card.species, onClose]);

  const order: StatKey[] = ['atk', 'def', 'spa', 'spd', 'spe'];

  return (
    <div className={`pp-lightbox ${shown ? 'in' : ''}`} role="dialog" aria-modal="true" aria-label={`${card.name} card details`}>
      <div className="pp-lightbox-backdrop" onClick={onClose} aria-hidden />
      <div className="pp-lightbox-panel" style={{ ['--ac' as string]: card.accent }}>
        <button type="button" className="pp-lightbox-close" onClick={onClose} aria-label="Close">
          <Icon name="close" size={20} />
        </button>

        <div
          className="pp-zoom-card"
          onPointerMove={tilt.onMove}
          onPointerLeave={tilt.onLeave}
        >
          <span className="pp-zoom-aura" aria-hidden />
          <span className="pp-zoom-scan">
            <CardTileFace card={card} ok={ok} onError={() => setOk(false)} />
            <span className="pp-zoom-glare" aria-hidden />
          </span>
        </div>

        <div className="pp-detail">
          <span className="pp-detail-eyebrow">
            <span className="pp-detail-dot" /> {card.set} · {card.year} · #{card.number}
          </span>
          <h3 className="pp-detail-name">
            {card.name}
            {card.grade && <span className="pp-detail-grade">{card.grade}</span>}
          </h3>
          <div className="pp-detail-types">
            {card.types.map((t) => <TypeChip key={t} t={t} />)}
            <span className="pp-detail-rarity">{card.rarity}</span>
          </div>

          <div className="pp-detail-vitals">
            <div className="pp-vital">
              <span className="pp-vital-l">Level</span>
              <span className="pp-vital-v">{card.level}</span>
            </div>
            <div className="pp-vital">
              <span className="pp-vital-l">Total HP</span>
              <span className="pp-vital-v">{card.hp}</span>
            </div>
            <div className="pp-vital">
              <span className="pp-vital-l">Est. floor</span>
              <span className="pp-vital-v">{card.floor} <i>SOL</i></span>
            </div>
          </div>

          <div className="pp-detail-stats">
            {order.map((k, i) => (
              <div className="pp-stat" key={k}>
                <span className="pp-stat-l">{STAT_LABEL[k]}</span>
                <span className="pp-stat-track">
                  <span
                    className="pp-stat-fill"
                    style={{ width: shown ? `${Math.min(100, (card.stats[k] / 160) * 100)}%` : '0%', transitionDelay: `${120 + i * 70}ms` }}
                  />
                </span>
                <span className="pp-stat-v">{card.stats[k]}</span>
              </div>
            ))}
          </div>

          <div className="pp-moves">
            <span className="pp-moves-head">Signature moves</span>
            <div className="pp-moves-grid">
              {card.moves.map((m) => (
                <div className="pp-move" key={m.name} style={{ ['--tc' as string]: TYPE_COLOR[m.type] ?? '#9099a1' }}>
                  <span className="pp-move-dot" />
                  <span className="pp-move-name">{m.name}</span>
                  <span className="pp-move-pow">{m.power === '—' ? '—' : `${m.power}`}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pp-detail-cta">
            <Link href="/login" className="pp-btn pp-btn-accent">
              <Icon name="bolt" size={16} /> Battle with this card
            </Link>
            <Link href="/collection" className="pp-btn pp-btn-ghost">View collection</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CardShowcase() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState<ShowcaseCard | null>(null);
  const [mounted, setMounted] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);

  return (
    <section className="pp-section pp-showcase" id="cards">
      <div className="pp-sec-head">
        <span className="pp-kicker"><span className="pp-kicker-dot" /> The collection</span>
        <h2 className="pp-h2">Every card is a <span className="pp-grad">living fighter</span></h2>
        <p className="pp-sub">
          Hover to feel the holo. Click any card to zoom into the real scan and reveal its
          in-game stats — the exact numbers it brings into a 6&nbsp;v&nbsp;6 battle.
        </p>
      </div>

      <div className="pp-grid" ref={gridRef}>
        {SHOWCASE_CARDS.map((c) => (
          <ShowcaseTile key={c.id} card={c} reduced={reduced} onOpen={() => setActive(c)} />
        ))}
      </div>

      {mounted && active && createPortal(
        <Inspector card={active} onClose={() => setActive(null)} />,
        document.body,
      )}
    </section>
  );
}
