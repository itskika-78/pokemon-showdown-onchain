import { Sprites } from '@pkmn/img';

export type SideId = 'p1' | 'p2';

export interface FieldMon {
  ident: string;
  species: string;
  level: number;
  gender: string;
  hpPct: number;
  fainted: boolean;
  status: string; // '', 'brn','par','slp','frz','psn','tox'
}

export interface PreviewMon {
  species: string;
  level: number;
  gender: string;
}

export interface BattleView {
  turn: number;
  names: { p1: string; p2: string };
  active: { p1?: FieldMon; p2?: FieldMon };
  revealed: { p1: string[]; p2: string[] };
  preview: { p1: PreviewMon[]; p2: PreviewMon[] };
  ended: boolean;
  winner?: string | null;
  tie?: boolean;
  log: string[];
}

export const TYPE_COLORS: Record<string, string> = {
  Normal: '#9099a1', Fire: '#ff6b3d', Water: '#3a9bf4', Electric: '#f7c531', Grass: '#54b84f',
  Ice: '#5bcfe0', Fighting: '#e0533f', Poison: '#a85bc8', Ground: '#d4a04a', Flying: '#8fb6ef',
  Psychic: '#f95b8f', Bug: '#9bbb2e', Rock: '#b8a85e', Ghost: '#7166b3', Dragon: '#5a6fe0',
  Dark: '#6b5a57', Steel: '#6aa7bd', Fairy: '#ef7fd6',
};

const STATUS_LABEL: Record<string, string> = {
  brn: 'BRN', par: 'PAR', slp: 'SLP', frz: 'FRZ', psn: 'PSN', tox: 'TOX',
};
export const statusLabel = (s: string): string => STATUS_LABEL[s] ?? '';

const sideOf = (ident: string): SideId => (ident.slice(0, 2) as SideId);
const nick = (ident: string): string => ident.split(': ')[1] ?? ident;

function parseDetails(details: string): { species: string; level: number; gender: string } {
  const parts = details.split(',').map((s) => s.trim());
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

/** Species name from a Showdown "details" string ("Charizard, L93, M"). */
export function speciesOfDetails(details: unknown): string {
  return String(details ?? '').split(',')[0]?.trim() ?? '';
}

/** Parse the cumulative Showdown protocol (this side's view) into a battle state. */
export function parseBattle(lines: string[], myId: SideId): BattleView {
  const v: BattleView = {
    turn: 0,
    names: { p1: 'Player 1', p2: 'Player 2' },
    active: {},
    revealed: { p1: [], p2: [] },
    preview: { p1: [], p2: [] },
    ended: false,
    log: [],
  };
  const who = (s: SideId) => (s === myId ? 'Your' : 'Foe');
  const reveal = (s: SideId, sp: string) => {
    if (sp && !v.revealed[s].includes(sp)) v.revealed[s].push(sp);
  };

  for (const line of lines) {
    if (!line || line[0] !== '|') continue;
    const t = line.split('|');
    const cmd = t[1];
    switch (cmd) {
      case 'player':
        if ((t[2] === 'p1' || t[2] === 'p2') && t[3]) v.names[t[2]] = t[3];
        break;
      case 'poke': {
        // |poke|p1|Charizard, L93, M|item  (team-preview reveal)
        const s = t[2];
        if (s === 'p1' || s === 'p2') {
          const d = parseDetails(t[3] ?? '');
          if (d.species) v.preview[s].push({ species: d.species, level: d.level, gender: d.gender });
        }
        break;
      }
      case 'switch':
      case 'drag':
      case 'replace': {
        const s = sideOf(t[2] ?? '');
        const d = parseDetails(t[3] ?? '');
        const c = parseCondition(t[4] ?? '');
        v.active[s] = { ident: t[2] ?? '', species: d.species, level: d.level, gender: d.gender, hpPct: c.hpPct, fainted: c.fainted, status: c.status };
        reveal(s, d.species);
        if (cmd !== 'replace') v.log.push(`${who(s)} ${d.species} came out.`);
        break;
      }
      case '-damage':
      case '-heal':
      case '-sethp': {
        const s = sideOf(t[2] ?? '');
        const c = parseCondition(t[3] ?? '');
        const m = v.active[s];
        if (m) { m.hpPct = c.hpPct; m.fainted = c.fainted; if (c.status) m.status = c.status; }
        break;
      }
      case 'faint': {
        const s = sideOf(t[2] ?? '');
        const m = v.active[s];
        if (m) { m.fainted = true; m.hpPct = 0; }
        v.log.push(`${who(s)} ${nick(t[2] ?? '')} fainted.`);
        break;
      }
      case '-status': { const m = v.active[sideOf(t[2] ?? '')]; if (m) m.status = t[3] ?? ''; break; }
      case '-curestatus': { const m = v.active[sideOf(t[2] ?? '')]; if (m) m.status = ''; break; }
      case 'move':
        v.log.push(`${who(sideOf(t[2] ?? ''))} ${v.active[sideOf(t[2] ?? '')]?.species ?? ''} used ${t[3]}!`);
        break;
      case 'cant':
        v.log.push(`${who(sideOf(t[2] ?? ''))} ${v.active[sideOf(t[2] ?? '')]?.species ?? ''} couldn't move.`);
        break;
      case '-supereffective': v.log.push('It’s super effective!'); break;
      case '-resisted': v.log.push('It’s not very effective…'); break;
      case '-crit': v.log.push('A critical hit!'); break;
      case '-immune': v.log.push('It had no effect.'); break;
      case '-miss': v.log.push('The attack missed!'); break;
      case 'turn': v.turn = parseInt(t[2] ?? '0', 10) || v.turn; break;
      case 'win': v.ended = true; v.winner = (t[2] ?? '').trim(); break;
      case 'tie': v.ended = true; v.tie = true; break;
      default: break;
    }
  }
  return v;
}

export function monSprite(species: string, mine: boolean): string {
  try {
    return Sprites.getPokemon(species, { gen: 'gen5ani', side: mine ? 'p1' : 'p2' }).url;
  } catch {
    return '';
  }
}

export function iconSprite(species: string): string {
  try {
    return Sprites.getPokemon(species, { gen: 'gen5' }).url;
  } catch {
    return '';
  }
}
