/**
 * RandomAI opponent — picks a legal move (or a forced switch) uniformly at
 * random from the simulator's `|request|`. A good model for the Phase-5 vs-bot
 * mode and the matchmaking smoke tests. It reads ONLY the request the server
 * sends; it never sees or computes hidden state.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
// The Showdown request object is a large dynamic JSON blob; typing it fully adds
// no safety here, so we read it as `any` at the boundary.
export interface SimRequest {
  active?: { moves: { id: string; disabled?: boolean; pp?: number }[] }[] | null;
  forceSwitch?: boolean[];
  teamPreview?: boolean;
  wait?: boolean;
  side?: { pokemon: { active: boolean; condition: string; fainted?: boolean }[] };
}

export class RandomBotAI {
  constructor(private readonly rng: () => number = Math.random) {}

  /** Returns a choice string for the sim, or null when no action is required. */
  choose(request: SimRequest | any): string | null {
    if (!request || request.wait) return null;
    if (request.teamPreview) return 'default';

    if (Array.isArray(request.forceSwitch) && request.forceSwitch.some(Boolean)) {
      const bench = request.side?.pokemon ?? [];
      const picks: string[] = [];
      const used = new Set<number>();
      for (const must of request.forceSwitch as boolean[]) {
        if (!must) {
          picks.push('pass');
          continue;
        }
        const idx = bench.findIndex(
          (p: any, i: number) =>
            p && !p.active && !used.has(i) && !p.fainted && !/ fnt$/.test(p.condition ?? ''),
        );
        if (idx >= 0) {
          used.add(idx);
          picks.push(`switch ${idx + 1}`);
        } else {
          picks.push('pass');
        }
      }
      return picks.join(', ');
    }

    if (Array.isArray(request.active)) {
      const picks: string[] = [];
      for (const slot of request.active as any[]) {
        if (!slot) {
          picks.push('pass');
          continue;
        }
        const usable = (slot.moves ?? [])
          .map((m: any, i: number) => ({ m, i }))
          .filter((x: any) => !x.m.disabled && (x.m.pp == null || x.m.pp > 0));
        const choice = usable.length ? usable[Math.floor(this.rng() * usable.length)] : null;
        // index+1 is the move slot; falls back to "move 1" (Struggle handles 0-PP)
        picks.push(`move ${choice ? choice.i + 1 : 1}`);
      }
      return picks.join(', ');
    }

    return 'default';
  }
}
