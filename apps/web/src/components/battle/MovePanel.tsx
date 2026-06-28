'use client';

import { Icon } from '@/components/Icon';
import { TYPE_COLORS } from '@/lib/battle';

interface Move {
  move: string;
  type?: string;
  pp: number;
  maxpp: number;
  disabled?: boolean;
}

export function MovePanel({
  species,
  moves,
  trapped,
  onMove,
  onSwitch,
}: {
  species?: string;
  moves: Move[];
  trapped: boolean;
  onMove: (idx: number) => void;
  onSwitch: () => void;
}) {
  return (
    <div className="game-panel stack" style={{ gap: 10 }}>
      <strong>What will {species} do?</strong>
      <div className="moves-grid">
        {moves.map((m, i) => {
          const color = TYPE_COLORS[m.type ?? ''] ?? 'var(--panel-3)';
          const out = m.pp === 0;
          return (
            <button
              key={i}
              type="button"
              className="move-btn"
              disabled={!!m.disabled || out}
              style={{ background: color }}
              onClick={() => onMove(i)}
            >
              <span className="move-name">{m.move}</span>
              <span className="move-meta">
                {m.type && <span className="typechip">{m.type}</span>}
                <span>{m.pp}/{m.maxpp} PP</span>
              </span>
            </button>
          );
        })}
      </div>
      <button type="button" className="btn ghost sm" onClick={onSwitch} disabled={trapped}>
        <Icon name="swap" size={15} /> {trapped ? 'Trapped — cannot switch' : 'Switch Pokémon'}
      </button>
    </div>
  );
}
