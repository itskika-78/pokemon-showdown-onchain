'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { CardReel } from '@/components/CardReel';

const ProfileCard = dynamic(() => import('@/components/reactbits/ProfileCard'), { ssr: false });

interface PdxCard {
  id: string;
  name: string;
  number: string | null;
  rarity: string | null;
  set: string | null;
  year: string | null;
  image: string;
  thumb: string;
}

/** Curated iconic Base Set holos for the WebGL hero gallery (always available). */
const HERO_ITEMS = [
  { image: 'https://images.pokemontcg.io/base1/4.png', text: 'Charizard' },
  { image: 'https://images.pokemontcg.io/base1/2.png', text: 'Blastoise' },
  { image: 'https://images.pokemontcg.io/base1/15.png', text: 'Venusaur' },
  { image: 'https://images.pokemontcg.io/base1/10.png', text: 'Mewtwo' },
  { image: 'https://images.pokemontcg.io/base1/16.png', text: 'Zapdos' },
  { image: 'https://images.pokemontcg.io/base1/1.png', text: 'Alakazam' },
  { image: 'https://images.pokemontcg.io/base1/6.png', text: 'Gyarados' },
  { image: 'https://images.pokemontcg.io/base1/14.png', text: 'Raichu' },
  { image: 'https://images.pokemontcg.io/base1/8.png', text: 'Machamp' },
  { image: 'https://images.pokemontcg.io/base1/12.png', text: 'Ninetales' },
  { image: 'https://images.pokemontcg.io/base1/11.png', text: 'Nidoking' },
  { image: 'https://images.pokemontcg.io/base1/5.png', text: 'Clefairy' },
] as const;

const FILTERS = [
  { id: 'all', label: 'See All' },
  { id: 'mega', label: 'Mega Evolution' },
  { id: 'ex', label: 'Pokémon ex' },
  { id: 'vmax', label: 'VMAX' },
  { id: 'special', label: 'Special Art' },
] as const;

/** Clicking a card opens it as a holographic, 3D-tilting ProfileCard. */
function CardLightbox({ card, onClose }: { card: PdxCard; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div className="pdx-pc-lightbox" role="dialog" aria-modal="true" aria-label={`${card.name} card`}>
      <div className="pdx-lightbox-backdrop" onClick={onClose} aria-hidden />
      <button type="button" className="pdx-lightbox-close pdx-pc-close" onClick={onClose} aria-label="Close">
        <Icon name="close" size={20} />
      </button>
      <div className="pdx-pc-holder">
        <ProfileCard
          className="pdx-pc"
          avatarUrl={card.image}
          miniAvatarUrl={card.thumb}
          name={card.name}
          title={`${card.set ?? 'Pokémon TCG'}${card.year ? ` · ${card.year}` : ''}`}
          handle={(card.number ?? '—').replace(/\s+/g, '')}
          status={card.rarity ?? 'Trading Card'}
          contactText="Battle with this"
          showUserInfo
          enableTilt
          innerGradient="linear-gradient(145deg, rgba(58,82,214,0.5) 0%, rgba(246,201,69,0.30) 100%)"
          behindGlowColor="rgba(125,190,255,0.6)"
          behindGlowSize="55%"
          onContactClick={() => { window.location.href = '/login'; }}
        />
      </div>
    </div>
  );
}

export default function PokedexPage() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [cards, setCards] = useState<PdxCard[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<PdxCard | null>(null);
  const [mounted, setMounted] = useState(false);
  const reqId = useRef(0);

  useEffect(() => setMounted(true), []);

  const fetchPage = useCallback(
    async (nextPage: number, append: boolean) => {
      const id = ++reqId.current;
      setLoading(true);
      try {
        const url = `/api/pokedex?q=${encodeURIComponent(q)}&filter=${filter}&page=${nextPage}&pageSize=24`;
        const res = await fetch(url);
        const data = (await res.json()) as { cards: PdxCard[]; hasMore: boolean; totalCount: number };
        if (id !== reqId.current) return; // a newer request superseded this one
        setCards((prev) => (append ? [...prev, ...data.cards] : data.cards));
        setHasMore(!!data.hasMore);
        setTotal(data.totalCount ?? 0);
        setPage(nextPage);
      } catch {
        if (id === reqId.current && !append) setCards([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [q, filter],
  );

  // Debounced reset whenever the query or filter changes.
  useEffect(() => {
    const t = setTimeout(() => void fetchPage(1, false), 280);
    return () => clearTimeout(t);
  }, [q, filter, fetchPage]);

  return (
    <div className="pdx">
      <div className="pdx-bg" aria-hidden>
        <span className="pdx-bg-grid" />
        <span className="pdx-bg-glow one" />
        <span className="pdx-bg-glow two" />
      </div>

      {/* ───────── HERO — WebGL circular card gallery ───────── */}
      <section className="pdx-hero">
        <div className="pdx-hero-head">
          <span className="pdx-kicker"><span className="pdx-kicker-dot" /> The Card Database</span>
          <h1 className="pdx-title">POKÉ<span>DEX</span></h1>
          <p className="pdx-lede">
            Every Pokémon Trading Card Game card, in one place. Drag the reel, then search the full
            archive below — tap any card to inspect the real scan.
          </p>
        </div>
        <div className="pdx-gallery">
          <CardReel items={HERO_ITEMS.map((it) => ({ image: it.image, text: it.text }))} />
        </div>
        <span className="pdx-hero-rule" aria-hidden />
      </section>

      {/* ───────── CONTROLS ───────── */}
      <section className="pdx-controls">
        <div className="pdx-search">
          <Icon name="search" size={18} />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search 18,000+ cards — Charizard, Pikachu, Mewtwo…"
            aria-label="Search cards by name"
          />
          {q && (
            <button type="button" className="pdx-search-clear" onClick={() => setQ('')} aria-label="Clear search">
              <Icon name="close" size={15} />
            </button>
          )}
        </div>
        <div className="pdx-filters" role="tablist" aria-label="Card filters">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`pdx-pill ${filter === f.id ? 'on' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {/* ───────── GRID ───────── */}
      <section className="pdx-results">
        {total > 0 && (
          <p className="pdx-count">{total.toLocaleString()} cards{q ? ` matching “${q}”` : ''}</p>
        )}
        <div className="pdx-grid">
          {cards.map((c, i) => (
            <button
              key={`${c.id}-${i}`}
              type="button"
              className="pdx-card"
              style={{ animationDelay: `${(i % 24) * 28}ms` }}
              onClick={() => setActive(c)}
              aria-label={`Inspect ${c.name}`}
            >
              <span className="pdx-card-inner">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="pdx-card-img" src={c.thumb} alt={c.name} loading="lazy" />
                <span className="pdx-card-shine" />
                <span className="pdx-card-zoom"><Icon name="search" size={15} /></span>
              </span>
              <span className="pdx-card-meta">
                <span className="pdx-card-name" title={c.name}>{c.name}</span>
                <span className="pdx-card-sub">{c.set ?? '—'}{c.rarity ? ` · ${c.rarity}` : ''}</span>
              </span>
            </button>
          ))}

          {loading && cards.length === 0 &&
            Array.from({ length: 12 }).map((_, i) => <span key={i} className="pdx-card skeleton" />)}
        </div>

        {!loading && cards.length === 0 && (
          <div className="pdx-empty">
            <span className="pdx-empty-ball" />
            <p>No cards found{q ? ` for “${q}”` : ''}. Try another name or filter.</p>
          </div>
        )}

        {hasMore && (
          <div className="pdx-more">
            <button type="button" className="pdx-btn pdx-btn-load" disabled={loading} onClick={() => void fetchPage(page + 1, true)}>
              {loading ? 'Loading…' : 'Load more cards'}
            </button>
          </div>
        )}
      </section>

      {mounted && active && createPortal(<CardLightbox card={active} onClose={() => setActive(null)} />, document.body)}
    </div>
  );
}
