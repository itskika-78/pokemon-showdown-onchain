import type Prando from 'prando';
import { Dex, type Species } from './data.js';

export interface MoveInfo {
  id: string;
  name: string;
  type: string;
  category: 'Physical' | 'Special' | 'Status';
  basePower: number;
}

export interface MovePool {
  levelUp: MoveInfo[]; // legal at/below the mon's level
  other: MoveInfo[]; // TM/egg/tutor — legal, used to fill out the set
}

function info(id: string): MoveInfo | null {
  const mv = Dex.moves.get(id);
  if (!mv?.exists || mv.isNonstandard) return null;
  return {
    id: mv.id,
    name: mv.name,
    type: mv.type,
    category: mv.category as MoveInfo['category'],
    basePower: mv.basePower ?? 0,
  };
}

/**
 * Build a species' legal move pool, merged across its pre-evolution chain (as
 * Showdown allows). Splits into level-up moves available at the mon's level and
 * everything else legal, so the picker can prefer level-appropriate moves.
 */
export async function buildMovePool(speciesId: string, level: number): Promise<MovePool> {
  const levelUpIds = new Set<string>();
  const otherIds = new Set<string>();
  const seen = new Set<string>();
  let cur: Species | undefined = Dex.species.get(speciesId);

  while (cur?.exists && !seen.has(cur.id)) {
    seen.add(cur.id);
    const ls = await Dex.learnsets.get(cur.id);
    if (ls?.learnset) {
      for (const [moveId, sources] of Object.entries(ls.learnset)) {
        let isLevelUp = false;
        for (const src of sources as string[]) {
          const m = /^(\d+)L(\d+)$/.exec(src);
          if (m && Number.parseInt(m[2]!, 10) <= level) isLevelUp = true;
        }
        if (isLevelUp) levelUpIds.add(moveId);
        else otherIds.add(moveId);
      }
    }
    cur = cur.prevo ? Dex.species.get(cur.prevo) : undefined;
  }

  const levelUp: MoveInfo[] = [];
  const other: MoveInfo[] = [];
  for (const id of levelUpIds) {
    const mi = info(id);
    if (mi) levelUp.push(mi);
  }
  for (const id of otherIds) {
    if (levelUpIds.has(id)) continue;
    const mi = info(id);
    if (mi) other.push(mi);
  }
  return { levelUp, other };
}

function shuffle<T>(arr: readonly T[], rng: Prando): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Pick up to 4 legal moves, seeded. Prefers level-appropriate, damaging, STAB
 * moves so battles aren't filler, while staying varied and deterministic.
 * Always returns ≥1 legal move (or throws if the pool is genuinely empty).
 */
export function selectMoves(pool: MovePool, stabTypes: ReadonlySet<string>, rng: Prando): string[] {
  const base = pool.levelUp.length >= 4 ? pool.levelUp : [...pool.levelUp, ...pool.other];
  const attackPoolAll = base.filter((m) => m.category !== 'Status' && m.basePower > 0);
  const strong = attackPoolAll.filter((m) => m.basePower >= 60);
  const attackPool = strong.length >= 3 ? strong : attackPoolAll;

  const stab = shuffle(attackPool.filter((m) => stabTypes.has(m.type)), rng);
  const nonStab = shuffle(attackPool.filter((m) => !stabTypes.has(m.type)), rng);
  const status = shuffle(base.filter((m) => m.category === 'Status'), rng);

  const chosen: MoveInfo[] = [];
  const add = (m?: MoveInfo) => {
    if (m && chosen.length < 4 && !chosen.some((c) => c.id === m.id)) chosen.push(m);
  };

  add(stab[0]);
  add(stab[1]);
  for (const m of nonStab) {
    if (chosen.length >= 3) break;
    add(m);
  }
  add(status[0]);
  for (const m of [...attackPool, ...status, ...shuffle(base, rng)]) {
    if (chosen.length >= 4) break;
    add(m);
  }

  if (chosen.length === 0) {
    const fallback = pool.levelUp[0] ?? pool.other[0];
    if (!fallback) throw new Error('No legal moves available for species');
    chosen.push(fallback);
  }
  return chosen.map((m) => m.name);
}
