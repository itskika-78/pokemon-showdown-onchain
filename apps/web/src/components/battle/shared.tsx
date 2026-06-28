'use client';

import type { WagerTerms } from '@battler/core';
import type { AssetsResponse } from '@/lib/api';
import { Icon } from '@/components/Icon';
import { statusLabel } from '@/lib/battle';
import type { PlayMon } from '@/lib/battlePlayer';

export const short = (k: string) => (k === 'BOT' ? 'Bot' : `${k.slice(0, 4)}…${k.slice(-4)}`);

export const hpColor = (pct: number) =>
  pct > 50
    ? 'linear-gradient(90deg,#34d399,#22c55e)'
    : pct > 20
      ? 'linear-gradient(90deg,#fbbf24,#f59e0b)'
      : 'linear-gradient(90deg,#f87171,#ef4444)';

export function HpBar({ pct }: { pct: number }) {
  return (
    <div className="hpbar">
      <span style={{ width: `${pct}%`, background: hpColor(pct) }} />
    </div>
  );
}

export function MonPlate({ mon }: { mon: PlayMon }) {
  return (
    <div className="plate">
      <div className="row between" style={{ gap: 8 }}>
        <strong style={{ textTransform: 'capitalize', fontSize: 14 }}>
          {mon.species}{' '}
          {mon.gender && <span className="muted">{mon.gender === 'M' ? '♂' : '♀'}</span>}
        </strong>
        <span className="row" style={{ gap: 6 }}>
          {mon.status && <span className={`statusbadge st-${mon.status}`}>{statusLabel(mon.status)}</span>}
          <span className="muted" style={{ fontSize: 12 }}>L{mon.level}</span>
        </span>
      </div>
      <HpBar pct={mon.hpPct} />
      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{Math.round(mon.hpPct)}%</div>
    </div>
  );
}

export function BallTray({ revealed, faintedSpecies }: { revealed: string[]; faintedSpecies: Set<string> }) {
  return (
    <div className="balltray">
      {Array.from({ length: 6 }, (_, i) => {
        const sp = revealed[i];
        return (
          <span
            key={i}
            className={`ball ${sp ? 'seen' : 'unknown'} ${sp && faintedSpecies.has(sp) ? 'fainted' : ''}`}
            title={sp ?? 'Unrevealed'}
          />
        );
      })}
    </div>
  );
}

/** Format crypto wager base units for display (lamports on-chain, credits in mock). */
export function formatCryptoWager(amount: number, onChain: boolean, currency = 'SOL'): string {
  if (onChain) {
    const ui = amount / 1_000_000_000;
    const digits = ui < 0.01 ? 4 : 3;
    return `${ui.toLocaleString(undefined, { maximumFractionDigits: digits })} ${currency}`;
  }
  return `${amount.toLocaleString()} PokéCoin`;
}

export function wagerLabel(
  w: WagerTerms,
  assets: AssetsResponse | null,
  onChain = false,
  currency = 'SOL',
): string {
  if (w.type === 'crypto') return formatCryptoWager(w.amount ?? 0, onChain, currency);
  if (w.type === 'card') {
    const c = assets?.cards.find((x) => x.assetId === w.assetId);
    return c?.speciesId ? c.speciesId : c?.cardName ?? 'a staked card';
  }
  return 'Friendly — no stake';
}

export function WagerChip({
  w,
  assets,
  onChain = false,
  currency = 'SOL',
}: {
  w: WagerTerms;
  assets: AssetsResponse | null;
  onChain?: boolean;
  currency?: string;
}) {
  return (
    <span
      className={`wager-chip ${w.type}`}
      style={{ textTransform: w.type === 'card' ? 'capitalize' : undefined }}
    >
      {w.type === 'crypto' && <span className="coin" />}
      {w.type === 'card' && <Icon name="cards" size={15} />}
      {w.type === 'none' && <Icon name="handshake" size={15} />}
      {wagerLabel(w, assets, onChain, currency)}
    </span>
  );
}
