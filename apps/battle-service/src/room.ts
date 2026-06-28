import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  SettlementProvider,
  WagerTerms,
} from '@battler/core';
import { BattleRoomEngine, RandomBotAI, enrichRequest, type PokemonSet } from '@battler/battle-engine';
import {
  loadServerConfig,
  logger,
  sha256Hex,
  signLogHash,
  activeBattles,
  matchesCompleted,
  wagerVolumeTotal,
} from '@battler/server-kit';
import { matches as matchRepo, antiCheat } from '@battler/repositories';
import { isChoiceAllowedByRequest, isWellFormedChoice } from './choices.js';

type Empty = Record<string, never>;
export type IO = Server<ClientToServerEvents, ServerToClientEvents, Empty, SocketData>;
export type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents, Empty, SocketData>;

export const BOT_PUBKEY = 'BOT';

type Side = 'p1' | 'p2';

export interface BattleRoomOpts {
  id: string;
  matchId: string;
  p1Pubkey: string;
  p2Pubkey: string;
  p1Team: PokemonSet[];
  p2Team: PokemonSet[];
  wager: WagerTerms;
  io: IO;
  settlement: SettlementProvider;
  p2IsBot?: boolean;
}

/**
 * One authoritative PvP (or vs-bot) battle. Wraps a BattleRoomEngine, routes
 * per-side protocol to sockets, validates every choice against the sim's current
 * request, enforces one-choice-per-turn + a per-turn timer, and settles exactly
 * once through the SettlementProvider when the battle ends.
 */
export class BattleRoom {
  readonly id: string;
  readonly matchId: string;
  readonly p1Pubkey: string;
  readonly p2Pubkey: string;
  private readonly wager: WagerTerms;
  private readonly io: IO;
  private readonly settlement: SettlementProvider;
  private readonly bot?: RandomBotAI;

  private engine: BattleRoomEngine;
  private readonly sockets: { p1?: IOSocket; p2?: IOSocket } = {};
  private readonly sideLog: { p1: string[]; p2: string[] } = { p1: [], p2: [] };
  private readonly lastRequest: { p1?: unknown; p2?: unknown } = {};
  private readonly moved: { p1: boolean; p2: boolean } = { p1: false, p2: false };
  private readonly attempts = new Map<string, number>();
  private readonly disconnectTimers: { p1?: NodeJS.Timeout; p2?: NodeJS.Timeout } = {};
  private turn = 0;
  private turnTimer?: NodeJS.Timeout;
  private finished = false;

  constructor(opts: BattleRoomOpts) {
    this.id = opts.id;
    this.matchId = opts.matchId;
    this.p1Pubkey = opts.p1Pubkey;
    this.p2Pubkey = opts.p2Pubkey;
    this.wager = opts.wager;
    this.io = opts.io;
    this.settlement = opts.settlement;
    if (opts.p2IsBot) this.bot = new RandomBotAI();

    const cfg = loadServerConfig();
    this.engine = new BattleRoomEngine({
      format: cfg.battleFormat,
      p1Name: opts.p1Pubkey, // name === pubkey so |win|<name> maps straight back
      p2Name: opts.p2Pubkey,
      p1Team: opts.p1Team,
      p2Team: opts.p2Team,
      maxTurns: 1000,
      onProtocol: (side, lines) => this.routeProtocol(side, lines),
      onRequest: (side, request) => this.onRequest(side, request),
      onTurn: (t) => this.onTurn(t),
    });
  }

  side(pubkey: string): Side | null {
    if (pubkey === this.p1Pubkey) return 'p1';
    if (pubkey === this.p2Pubkey) return 'p2';
    return null;
  }

  async start(): Promise<void> {
    activeBattles.inc();
    await this.engine.start();
    void this.engine.finished().then((r) => this.finalize(r.winner, r.tie));
  }

  /** Attach (or re-attach on reconnect) a player's socket and replay their view. */
  attach(side: Side, socket: IOSocket): void {
    this.sockets[side] = socket;
    void socket.join(this.id);
    const t = this.disconnectTimers[side];
    if (t) {
      clearTimeout(t);
      this.disconnectTimers[side] = undefined;
    }
    // replay this side's protocol + current request (reconnect-safe)
    if (this.sideLog[side].length) {
      socket.emit('battle:protocol', { roomId: this.id, lines: this.sideLog[side] });
    }
    if (this.lastRequest[side]) {
      socket.emit('battle:request', { roomId: this.id, request: this.lastRequest[side] });
    }
  }

  /** A socket dropped: hold the room open for the reconnect window, then forfeit. */
  detach(side: Side): void {
    if (this.finished) return;
    this.sockets[side] = undefined;
    const cfg = loadServerConfig();
    this.disconnectTimers[side] = setTimeout(() => {
      if (this.finished) return;
      logger.info({ roomId: this.id, side }, 'reconnect window elapsed — forfeiting');
      void antiCheat.flagAndMaybeSuspend(
        side === 'p1' ? this.p1Pubkey : this.p2Pubkey,
        'disconnect_forfeit_pattern',
        this.matchId,
        { reason: 'disconnect' },
      );
      this.forfeit(side, 'disconnect');
    }, cfg.reconnectWindowSeconds * 1000);
  }

  private routeProtocol(side: 'p1' | 'p2' | 'spectator', lines: string[]): void {
    if (side === 'spectator') return; // full log kept by engine for hashing
    this.sideLog[side].push(...lines);
    this.sockets[side]?.emit('battle:protocol', { roomId: this.id, lines });
  }

  private onRequest(side: Side, request: unknown): void {
    if (side === 'p2' && this.bot) {
      this.lastRequest[side] = request;
      this.moved[side] = false;
      const choice = this.bot.choose(request);
      if (choice) {
        this.moved.p2 = true;
        this.engine.choose('p2', choice);
      }
      return;
    }
    const enriched = enrichRequest(request); // add move/species typing for the UI
    this.lastRequest[side] = enriched;
    this.moved[side] = false;
    this.sockets[side]?.emit('battle:request', { roomId: this.id, request: enriched });
    this.armTurnTimer();
  }

  private onTurn(turn: number): void {
    this.turn = turn;
    this.moved.p1 = false;
    this.moved.p2 = false;
    const cfg = loadServerConfig();
    this.io.to(this.id).emit('battle:turn', {
      roomId: this.id,
      turn,
      deadline: Date.now() + cfg.turnTimerSeconds * 1000,
    });
  }

  async submitChoice(pubkey: string, choice: string): Promise<void> {
    if (this.finished) return;
    const side = this.side(pubkey);
    if (!side || side === 'p2' && this.bot) return;

    if (!isWellFormedChoice(choice) || !isChoiceAllowedByRequest(choice, this.lastRequest[side])) {
      await antiCheat.flagAndMaybeSuspend(pubkey, 'invalid_choice', this.matchId, { choice, turn: this.turn });
      this.sockets[side]?.emit('battle:error', { roomId: this.id, message: 'Invalid or disallowed choice' });
      return;
    }

    // one choice per turn — second is ignored with a warning, third+ is flagged
    const key = `${side}:${this.turn}`;
    const n = (this.attempts.get(key) ?? 0) + 1;
    this.attempts.set(key, n);
    if (this.moved[side]) {
      if (n >= 3) {
        await antiCheat.flagAndMaybeSuspend(pubkey, 'double_move', this.matchId, { turn: this.turn, attempts: n });
      }
      this.sockets[side]?.emit('battle:error', { roomId: this.id, message: 'Only one choice per turn' });
      return;
    }

    this.moved[side] = true;
    this.engine.choose(side, choice);
  }

  private armTurnTimer(): void {
    const cfg = loadServerConfig();
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = setTimeout(() => this.onTurnTimeout(), cfg.turnTimerSeconds * 1000);
  }

  private onTurnTimeout(): void {
    if (this.finished) return;
    const p1Pending = !this.moved.p1 && !!this.lastRequest.p1;
    const p2Pending = !this.moved.p2 && !!this.lastRequest.p2 && !this.bot;
    if (p1Pending && p2Pending) {
      this.engine.forceTie();
    } else if (p1Pending) {
      this.forfeit('p1', 'timeout');
    } else if (p2Pending) {
      this.forfeit('p2', 'timeout');
    }
  }

  private forfeit(loserSide: Side, reason: string): void {
    if (this.finished) return;
    const winnerSide: Side = loserSide === 'p1' ? 'p2' : 'p1';
    logger.info({ roomId: this.id, loserSide, reason }, 'forfeit');
    this.engine.forceWin(winnerSide);
  }

  private async finalize(winnerName: string | null, tie: boolean): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    if (this.turnTimer) clearTimeout(this.turnTimer);
    activeBattles.dec();

    const log = this.engine.log.join('\n');
    const hash = sha256Hex(log);
    signLogHash(hash); // ensure it signs (stored hash is enough for the verify endpoint)
    try {
      await matchRepo.saveBattleLog(this.matchId, log, hash);
    } catch (err) {
      logger.error({ err, matchId: this.matchId }, 'failed to persist battle log');
    }

    const winner = tie ? null : winnerName;
    const loser = winner === this.p1Pubkey ? this.p2Pubkey : this.p1Pubkey;
    this.io.to(this.id).emit('battle:end', { roomId: this.id, winner, reason: tie ? 'tie' : 'normal' });

    if (winner && winner !== BOT_PUBKEY && loser !== BOT_PUBKEY) {
      try {
        const outcome = await this.settlement.settle({ matchId: this.matchId, winner, loser, reason: 'normal' });
        if (outcome.applied && this.wager.type === 'crypto' && this.wager.amount) {
          wagerVolumeTotal.inc(this.wager.amount);
        }
        matchesCompleted.inc();
        logger.info({ matchId: this.matchId, winner, outcome: outcome.applied }, 'settled');
      } catch (err) {
        logger.error({ err, matchId: this.matchId }, 'settlement failed');
      }
    } else {
      matchesCompleted.inc();
    }
  }
}

/** Owns active rooms and maps players to their current room. */
export class RoomManager {
  private readonly rooms = new Map<string, BattleRoom>();
  private readonly byPubkey = new Map<string, string>();

  constructor(
    private readonly io: IO,
    private readonly settlement: SettlementProvider,
  ) {}

  async create(opts: Omit<BattleRoomOpts, 'io' | 'settlement'>, autoStart = true): Promise<BattleRoom> {
    const room = new BattleRoom({ ...opts, io: this.io, settlement: this.settlement });
    this.rooms.set(opts.id, room);
    this.byPubkey.set(opts.p1Pubkey, opts.id);
    if (!opts.p2IsBot) this.byPubkey.set(opts.p2Pubkey, opts.id);
    if (autoStart) await room.start();
    return room;
  }

  /** Start a room created with autoStart=false (e.g. after escrow deposits land). */
  async start(roomId: string): Promise<boolean> {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    await room.start();
    return true;
  }

  /** Drop a room that never started (e.g. deposit timeout/void). */
  discard(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    this.rooms.delete(roomId);
    this.byPubkey.delete(room.p1Pubkey);
    this.byPubkey.delete(room.p2Pubkey);
  }

  get(roomId: string): BattleRoom | undefined {
    return this.rooms.get(roomId);
  }

  roomIdForPubkey(pubkey: string): string | undefined {
    return this.byPubkey.get(pubkey);
  }

  attach(roomId: string, pubkey: string, socket: IOSocket): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const side = room.side(pubkey);
    if (!side) return false;
    room.attach(side, socket);
    return true;
  }

  detach(pubkey: string, socket: IOSocket): void {
    const roomId = this.byPubkey.get(pubkey);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;
    const side = room.side(pubkey);
    if (side) room.detach(side);
  }

  async submitChoice(pubkey: string, roomId: string, choice: string): Promise<void> {
    await this.rooms.get(roomId)?.submitChoice(pubkey, choice);
  }
}
