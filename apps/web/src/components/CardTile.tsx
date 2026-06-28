'use client';

import { useState } from 'react';
import { Sprites } from '@pkmn/img';
import type { CollectionCard } from '@battler/das';
import type { BattleProfile } from '@battler/core';
import { clientConfig } from '@/lib/clientConfig';
import { playCry } from '@/lib/cry';
import { TYPE_COLORS } from '@/lib/battle';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const STAT_ROWS: [keyof NonNullable<BattleProfile['stats']>, string][] = [
  ['hp', 'HP'], ['atk', 'ATK'], ['def', 'DEF'], ['spa', 'SPA'], ['spd', 'SPD'], ['spe', 'SPE'],
];
const statColor = (v: number) => (v >= 130 ? '#2aa84a' : v >= 90 ? '#2a75bb' : v >= 60 ? '#e8a800' : '#ee5b4f');

function spriteUrl(speciesId: string): string {
  try {
    return Sprites.getPokemon(speciesId, { gen: 'gen5ani' }).url;
  } catch {
    return `${clientConfig.spriteHost}/gen5ani/${speciesId}.gif`;
  }
}

function rarityTier(rarity?: string | null): 'holo' | 'secret' | null {
  if (!rarity) return null;
  const r = rarity.toLowerCase();
  if (r.includes('secret') || r.includes('illustration') || r.includes('special art')) return 'secret';
  if (r.includes('holo') || r.includes('ultra') || r.includes('rare') || r.includes('ex') || r.includes('gx') || r.includes('vmax') || r.includes(' v ')) return 'holo';
  return null;
}

export function CardTile({
  card,
  profile,
  selected,
  onClick,
  ribbon,
}: {
  card: CollectionCard;
  profile?: BattleProfile;
  selected?: boolean;
  onClick?: () => void;
  ribbon?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const reduced = useReducedMotion();
  const img = card.cardImageUrl ?? '';
  const showScan = !!img && !imgError;
  const sprite = card.playable && card.speciesId && clientConfig.enablePokemonArt ? spriteUrl(card.speciesId) : '';
  const tier = rarityTier(card.rarity);
  const isSlab = !!(card.grade || card.gradingCompany);

  const onHover = () => {
    if (card.speciesId && clientConfig.enablePokemonArt) playCry(card.speciesId);
    if (!reduced) setFlipped(true);
  };

  const cardClass = [
    'panel', 'card',
    onClick ? 'click' : '',
    card.playable ? '' : 'unplayable',
    selected ? 'selected' : '',
    tier ?? '',
    isSlab ? 'slab' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cardClass}
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={() => setFlipped(false)}
      style={{ position: 'relative' }}
    >
      {(selected || ribbon) && (
        <span className="card-ribbon">{ribbon ?? 'In team'}</span>
      )}
      <div className="flip">
        <div className={`flip-inner${flipped && !reduced ? ' flipped' : ''}`}>
          <div className="flip-face flip-front">
            {showScan ? (
              <div className="cardscan-wrap">
                {/* Plain <img>: real cNFT scans come from arbitrary hosts
                    (Arweave/IPFS/CDNs); next/image would need each allow-listed.
                    onError falls back to the framed sprite below. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="cardscan"
                  src={img}
                  alt={card.cardName}
                  loading="lazy"
                  onError={() => setImgError(true)}
                  style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                />
              </div>
            ) : (
              <div className={`cardframe ${card.playable ? '' : 'dim'}`}>
                <div className="cardframe-top">
                  <span className="cardframe-name">{card.cardName}</span>
                  {profile && <span className="cardframe-hp">Lv{profile.level}</span>}
                </div>
                <div className="cardframe-art">
                  {sprite ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sprite} alt={card.speciesId ?? card.cardName} />
                  ) : (
                    <span className="muted" style={{ fontSize: 11, textAlign: 'center', padding: 8 }}>{card.cardName}</span>
                  )}
                </div>
                <div className="cardframe-foot">
                  {card.set && <span>{card.set}</span>}
                  {card.rarity && <span>{card.rarity}</span>}
                </div>
              </div>
            )}
          </div>

          <div className="flip-face flip-back">
            {sprite ? (
              <>
                <div className="cardmon-stage">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="cardmon" src={sprite} alt={card.speciesId!} />
                </div>
                <div className="cardback-body">
                  <div className="cardback-head">
                    <strong className="cardmon-name">{card.speciesId}</strong>
                    {profile && <span className="lv-pill">Lv {profile.level}</span>}
                  </div>
                  {profile?.types && profile.types.length > 0 && (
                    <div className="type-chips">
                      {profile.types.map((ty) => (
                        <span key={ty} className="type-chip" style={{ background: TYPE_COLORS[ty] ?? '#9099a1' }}>{ty}</span>
                      ))}
                    </div>
                  )}
                  {profile?.stats ? (
                    <div className="statgrid">
                      {STAT_ROWS.map(([k, label]) => {
                        const v = profile.stats![k];
                        return (
                          <div className="srow" key={k}>
                            <span className="s-l">{label}</span>
                            <span className="s-bar"><span style={{ width: `${Math.min(100, (v / 260) * 100)}%`, background: statColor(v) }} /></span>
                            <span className="s-v">{v}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    profile && <div className="muted" style={{ fontSize: 10 }}>{profile.ability} · {profile.nature}</div>
                  )}
                  {profile?.stats && <div className="muted cardback-meta">{profile.ability} · {profile.nature}</div>}
                </div>
              </>
            ) : (
              <span className="muted" style={{ fontSize: 12 }}>
                {card.playable ? 'No profile yet' : 'Not playable'}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="cardtile-foot">
        <span className="cardtile-title" title={card.cardName}>
          {card.cardName.length > 26 ? card.cardName.slice(0, 25) + '…' : card.cardName}
        </span>
        <div className="row" style={{ marginTop: 4, gap: 6 }}>
          {card.grade && <span className="badge">{card.gradingCompany ?? ''} {card.grade}</span>}
          {card.rarity && <span className="badge">{card.rarity}</span>}
        </div>
      </div>
    </div>
  );
}
