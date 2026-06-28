import { BattleStreams, Teams, type PokemonSet } from '@pkmn/sim';
import { RandomBotAI } from './bot.js';

export type ProtocolSide = 'p1' | 'p2' | 'spectator';

export interface BattleEngineOptions {
  format?: string;
  p1Name?: string;
  p2Name?: string;
  p1Team: PokemonSet[];
  p2Team: PokemonSet[];
  /** Raw Showdown protocol lines, routed per side. The service forwards these
   *  to the right socket (p1 sees only p1's view + public lines). */
  onProtocol?: (side: ProtocolSide, lines: string[]) => void;
  /** Parsed `|request|` for a side — what the client needs to choose. */
  onRequest?: (side: 'p1' | 'p2', request: unknown) => void;
  onTurn?: (turn: number) => void;
  onEnd?: (winner: string | null, tie: boolean) => void;
  /** Safety cap so a random-vs-random game can never loop forever in tests. */
  maxTurns?: number;
}

/**
 * Server-authoritative battle room. Wraps a single @pkmn/sim BattleStream:
 * clients only submit validated choices via choose(); the engine streams back
 * protocol lines. The same class backs vs-bot, the headless test, and the
 * Socket.IO PvP rooms.
 */
export class BattleRoomEngine {
  readonly battleStream = new BattleStreams.BattleStream();
  private readonly streams = BattleStreams.getPlayerStreams(this.battleStream);
  readonly log: string[] = [];
  readonly errors: string[] = [];
  winner: string | null = null;
  tie = false;
  turn = 0;
  ended = false;
  private readonly loops: Promise<void>[] = [];

  constructor(private readonly opts: BattleEngineOptions) {}

  async start(): Promise<void> {
    const format = this.opts.format ?? 'gen9customgame';
    this.loops.push(this.readOmniscient());
    this.loops.push(this.readPlayer('p1'));
    this.loops.push(this.readPlayer('p2'));

    void this.streams.omniscient.write(`>start ${JSON.stringify({ formatid: format })}`);
    void this.streams.omniscient.write(
      `>player p1 ${JSON.stringify({ name: this.opts.p1Name ?? 'Player 1', team: Teams.pack(this.opts.p1Team) })}`,
    );
    void this.streams.omniscient.write(
      `>player p2 ${JSON.stringify({ name: this.opts.p2Name ?? 'Player 2', team: Teams.pack(this.opts.p2Team) })}`,
    );
  }

  /** Submit a (pre-validated) choice for a side. No-op once the battle ended. */
  choose(side: 'p1' | 'p2', choice: string): void {
    if (this.ended) return;
    void this.streams[side].write(choice);
  }

  /** Force a result (used for timeout/forfeit). winner = 'p1'|'p2'. */
  forceWin(side: 'p1' | 'p2'): void {
    void this.streams.omniscient.write(`>forcewin ${side}`);
  }

  /** Force a tie (used when both players time out / disconnect). */
  forceTie(): void {
    void this.streams.omniscient.write('>forcetie');
  }

  /** Resolves when the battle has fully ended and all streams drained. */
  async finished(): Promise<{
    winner: string | null;
    tie: boolean;
    turns: number;
    log: string[];
    errors: string[];
  }> {
    await Promise.all(this.loops);
    return {
      winner: this.tie ? null : this.winner,
      tie: this.tie,
      turns: this.turn,
      log: this.log,
      errors: this.errors,
    };
  }

  private async readOmniscient(): Promise<void> {
    for await (const chunk of this.streams.omniscient) {
      const lines = chunk.split('\n');
      for (const line of lines) {
        this.log.push(line);
        if (line.startsWith('|turn|')) {
          this.turn = Number.parseInt(line.slice('|turn|'.length), 10) || this.turn;
          this.opts.onTurn?.(this.turn);
          if (this.opts.maxTurns && this.turn > this.opts.maxTurns && !this.ended) {
            void this.streams.omniscient.write('>forcetie');
          }
        } else if (line.startsWith('|win|')) {
          this.winner = line.slice('|win|'.length).trim();
          this.ended = true;
          this.opts.onEnd?.(this.winner, false);
        } else if (line.startsWith('|tie|')) {
          this.tie = true;
          this.ended = true;
          this.opts.onEnd?.(null, true);
        } else if (line.startsWith('|error|')) {
          this.errors.push(line);
        }
      }
      this.opts.onProtocol?.('spectator', lines);
    }
  }

  private async readPlayer(side: 'p1' | 'p2'): Promise<void> {
    for await (const chunk of this.streams[side]) {
      const lines = chunk.split('\n');
      this.opts.onProtocol?.(side, lines);
      for (const line of lines) {
        if (line.startsWith('|request|')) {
          const json = line.slice('|request|'.length);
          if (!json) continue;
          try {
            this.opts.onRequest?.(side, JSON.parse(json));
          } catch {
            /* malformed request line — ignore */
          }
        }
      }
    }
  }
}

export interface BotBattleResult {
  winner: string | null;
  tie: boolean;
  turns: number;
  log: string[];
  errors: string[];
}

/**
 * Drive a complete battle between two RandomAI bots. Used by the vs-bot mode and
 * the Phase-7 headless test. Returns once a winner (or tie) is reached.
 */
export async function runBotBattle(
  p1Team: PokemonSet[],
  p2Team: PokemonSet[],
  opts: { format?: string; maxTurns?: number; rng1?: () => number; rng2?: () => number } = {},
): Promise<BotBattleResult> {
  const bot1 = new RandomBotAI(opts.rng1);
  const bot2 = new RandomBotAI(opts.rng2);

  let engine!: BattleRoomEngine;
  engine = new BattleRoomEngine({
    format: opts.format,
    p1Name: 'Bot 1',
    p2Name: 'Bot 2',
    p1Team,
    p2Team,
    maxTurns: opts.maxTurns ?? 1000,
    onRequest: (side, request) => {
      const choice = (side === 'p1' ? bot1 : bot2).choose(request);
      if (choice) engine.choose(side, choice);
    },
  });

  await engine.start();
  return engine.finished();
}
