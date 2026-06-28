'use client';

import type { SideId } from '@/lib/battlePlayer';
import type { Field } from '@/lib/battlePlayer';
import { monSprite } from '@/lib/battle';
import { MonPlate, BallTray } from './shared';

export function BattleField({
  field,
  myId,
  oppId,
  fx,
  msg,
  typing,
  animating,
  ended,
  turnFlag,
  mineRevealed,
  mineFainted,
}: {
  field: Field;
  myId: SideId;
  oppId: SideId;
  fx: { p1?: string; p2?: string };
  msg: string;
  typing: boolean;
  animating: boolean;
  ended: { winner: string | null; reason: string } | null;
  turnFlag: number | null;
  mineRevealed: string[];
  mineFainted: Set<string>;
}) {
  const myActive = field.active[myId];
  const oppActive = field.active[oppId];

  return (
    <div className="battlefield has-bg">
      {turnFlag != null && <div className="turn-flag" key={turnFlag}>Turn {turnFlag}</div>}

      <div className="bf-side foe">
        <div className="bf-info">
          <span className="muted" style={{ fontSize: 12 }}>
            {field.names[oppId] === 'BOT' ? 'Bot' : (field.names[oppId] ?? 'Opponent').slice(0, 10)}
          </span>
          <BallTray revealed={field.revealed[oppId]} faintedSpecies={new Set()} />
          {oppActive ? <MonPlate mon={oppActive} /> : <div className="muted">—</div>}
        </div>
        <div className="bf-stage">
          {oppActive && monSprite(oppActive.species, false) && (
            <div className="bf-mon-wrap" key={oppActive.species}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={`bf-sprite foe ${oppActive.fainted ? 'fainted' : ''} ${fx[oppId] ?? ''}`}
                src={monSprite(oppActive.species, false)}
                alt={oppActive.species}
              />
            </div>
          )}
        </div>
      </div>

      <div className="bf-side mine">
        <div className="bf-stage">
          {myActive && monSprite(myActive.species, true) && (
            <div className="bf-mon-wrap" key={myActive.species}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={`bf-sprite mine ${myActive.fainted ? 'fainted' : ''} ${fx[myId] ?? ''}`}
                src={monSprite(myActive.species, true)}
                alt={myActive.species}
              />
            </div>
          )}
        </div>
        <div className="bf-info">
          <span className="muted" style={{ fontSize: 12 }}>You</span>
          <BallTray revealed={mineRevealed} faintedSpecies={mineFainted} />
          {myActive ? <MonPlate mon={myActive} /> : <div className="muted">—</div>}
        </div>
      </div>

      <div className="ds-msgbox">
        <span className="ds-text">
          {msg || (ended && !animating ? 'The battle is over.' : '')}
          {typing && <span className="ds-caret">&nbsp;</span>}
        </span>
        {!typing && msg && animating && <span className="ds-arrow" />}
      </div>
    </div>
  );
}
