/**
 * DS-style battle playback. Instead of dumping the whole Showdown protocol at
 * once, the page feeds lines through `interpret()` one at a time and plays each
 * event with a delay — sprite animations, a typed message, then a pause — the
 * way the Gen-5 (Unova) games pace a turn.
 */

export type SideId = 'p1' | 'p2';

export interface PlayMon {
  ident: string;
  species: string;
  level: number;
  gender: string;
  hpPct: number;
  fainted: boolean;
  status: string;
}
export interface PreviewMon { species: string; level: number; gender: string }

export interface Field {
  turn: number;
  names: { p1: string; p2: string };
  active: { p1?: PlayMon; p2?: PlayMon };
  revealed: { p1: string[]; p2: string[] };
  preview: { p1: PreviewMon[]; p2: PreviewMon[] };
  ended: boolean;
  winner: string | null;
  tie: boolean;
}

export function emptyField(): Field {
  return {
    turn: 0,
    names: { p1: 'Player 1', p2: 'Player 2' },
    active: {},
    revealed: { p1: [], p2: [] },
    preview: { p1: [], p2: [] },
    ended: false,
    winner: null,
    tie: false,
  };
}

export function cloneField(f: Field): Field {
  return {
    turn: f.turn,
    names: { ...f.names },
    active: { p1: f.active.p1 ? { ...f.active.p1 } : undefined, p2: f.active.p2 ? { ...f.active.p2 } : undefined },
    revealed: { p1: [...f.revealed.p1], p2: [...f.revealed.p2] },
    preview: { p1: [...f.preview.p1], p2: [...f.preview.p2] },
    ended: f.ended,
    winner: f.winner,
    tie: f.tie,
  };
}

export type Sfx = 'move' | 'hit' | 'faint' | 'super' | 'resist' | 'crit' | 'status' | 'boost';

export interface PlayEvent {
  text?: string;
  fx?: { side: SideId; kind: 'attack' | 'hit' };
  cry?: string;
  /** Sound effect to play for this event (synth, mute-aware). */
  sfx?: Sfx;
  turn?: number;
  delay: number;
}

const sideOf = (ident: string): SideId => (ident.slice(0, 2) as SideId);

function parseDetails(details: string): { species: string; level: number; gender: string } {
  const parts = (details ?? '').split(',').map((s) => s.trim());
  let level = 100;
  let gender = '';
  for (const p of parts.slice(1)) {
    if (/^L\d+$/.test(p)) level = parseInt(p.slice(1), 10);
    else if (p === 'M' || p === 'F') gender = p;
  }
  return { species: parts[0] ?? '', level, gender };
}

function parseCondition(cond: string): { hpPct: number; fainted: boolean; status: string } {
  if (!cond) return { hpPct: 100, fainted: false, status: '' };
  if (cond.includes('fnt')) return { hpPct: 0, fainted: true, status: '' };
  const parts = cond.split(' ');
  const [curS, maxS] = (parts[0] ?? '').split('/');
  const cur = Number(curS ?? 0);
  const max = Number(maxS ?? 0);
  const pct = max ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  return { hpPct: pct, fainted: false, status: parts[1] ?? '' };
}

const STATUS_VERB: Record<string, string> = {
  par: 'was paralyzed', brn: 'was burned', psn: 'was poisoned', tox: 'was badly poisoned',
  slp: 'fell asleep', frz: 'was frozen solid',
};
const STAT_NAME: Record<string, string> = {
  atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed',
  accuracy: 'accuracy', evasion: 'evasiveness',
};

/** Apply one protocol line to `f` (mutating) and return how to animate it. */
export function interpret(line: string, f: Field, myId: SideId): PlayEvent {
  if (!line || line[0] !== '|') return { delay: 0 };
  const t = line.split('|');
  const cmd = t[1];
  const sp = (side: SideId): string => f.active[side]?.species ?? 'Pokémon';
  const subj = (side: SideId): string => (side === myId ? sp(side) : `The opposing ${sp(side)}`);
  const reveal = (side: SideId, species: string) => {
    if (species && !f.revealed[side].includes(species)) f.revealed[side].push(species);
  };

  switch (cmd) {
    case 'player':
      if ((t[2] === 'p1' || t[2] === 'p2') && t[3]) f.names[t[2]] = t[3];
      return { delay: 0 };

    case 'poke': {
      const s = t[2];
      if (s === 'p1' || s === 'p2') {
        const d = parseDetails(t[3] ?? '');
        if (d.species) f.preview[s].push({ species: d.species, level: d.level, gender: d.gender });
      }
      return { delay: 35 };
    }

    case 'switch':
    case 'drag':
    case 'replace': {
      const s = sideOf(t[2] ?? '');
      const d = parseDetails(t[3] ?? '');
      const c = parseCondition(t[4] ?? '');
      f.active[s] = { ident: t[2] ?? '', species: d.species, level: d.level, gender: d.gender, hpPct: c.hpPct, fainted: c.fainted, status: c.status };
      reveal(s, d.species);
      if (cmd === 'replace') return { delay: 120 };
      const text = s === myId ? `Go! ${d.species}!` : `The opposing ${d.species} was sent out!`;
      return { text, cry: d.species, delay: 850 };
    }

    case 'move': {
      const s = sideOf(t[2] ?? '');
      return { text: `${subj(s)} used ${t[3]}!`, fx: { side: s, kind: 'attack' }, sfx: 'move', delay: 600 };
    }

    case 'cant': {
      const s = sideOf(t[2] ?? '');
      return { text: `${subj(s)} can't move!`, delay: 700 };
    }

    case '-damage':
    case '-heal':
    case '-sethp': {
      const s = sideOf(t[2] ?? '');
      const c = parseCondition(t[3] ?? '');
      const m = f.active[s];
      const dropped = m ? c.hpPct < m.hpPct : false;
      if (m) { m.hpPct = c.hpPct; m.fainted = c.fainted; if (c.status) m.status = c.status; }
      if (cmd === '-sethp') return { delay: 180 };
      if (cmd === '-heal') return { delay: 520 };
      // status-tick damage carries a "[from] xyz" tag → narrate it
      const from = (t[4] ?? '').match(/\[from\]\s*(?:psn|tox)/) ? `${subj(s)} is hurt by poison!`
        : (t[4] ?? '').includes('brn') ? `${subj(s)} is hurt by its burn!` : undefined;
      return { text: from, fx: dropped ? { side: s, kind: 'hit' } : undefined, sfx: dropped ? 'hit' : undefined, delay: 680 };
    }

    case 'faint': {
      const s = sideOf(t[2] ?? '');
      const m = f.active[s];
      const species = m?.species;
      if (m) { m.fainted = true; m.hpPct = 0; }
      return { text: `${subj(s)} fainted!`, cry: species, sfx: 'faint', delay: 950 };
    }

    case '-status': {
      const s = sideOf(t[2] ?? '');
      const m = f.active[s];
      if (m) m.status = t[3] ?? '';
      return { text: `${subj(s)} ${STATUS_VERB[t[3] ?? ''] ?? 'was afflicted'}!`, sfx: 'status', delay: 720 };
    }
    case '-curestatus': {
      const s = sideOf(t[2] ?? '');
      const m = f.active[s];
      if (m) m.status = '';
      return { delay: 320 };
    }

    case '-supereffective': return { text: "It's super effective!", sfx: 'super', delay: 680 };
    case '-resisted': return { text: "It's not very effective…", sfx: 'resist', delay: 680 };
    case '-crit': return { text: 'A critical hit!', sfx: 'crit', delay: 680 };
    case '-immune': { const s = sideOf(t[2] ?? ''); return { text: `It doesn't affect ${sp(s)}…`, delay: 720 }; }
    case '-miss': { const s = sideOf(t[2] ?? ''); return { text: `${subj(s)}'s attack missed!`, delay: 680 }; }

    case '-boost':
    case '-unboost': {
      const s = sideOf(t[2] ?? '');
      const stat = STAT_NAME[t[3] ?? ''] ?? (t[3] ?? 'stats');
      const dir = cmd === '-boost' ? 'rose' : 'fell';
      return { text: `${subj(s)}'s ${stat} ${dir}!`, sfx: 'boost', delay: 620 };
    }

    case 'turn':
      f.turn = parseInt(t[2] ?? '0', 10) || f.turn;
      return { turn: f.turn, delay: 240 };

    case 'win':
      f.ended = true;
      f.winner = (t[2] ?? '').trim();
      return { delay: 400 };
    case 'tie':
      f.ended = true;
      f.tie = true;
      return { delay: 400 };

    default:
      return { delay: 40 };
  }
}
