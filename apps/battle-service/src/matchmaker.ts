import { v4 as uuid } from 'uuid';
import { normalizeCardName } from '@battler/card-parser';
import { deriveBattleProfile, buildTeam, type PokemonSet } from '@battler/battle-engine';
import { getRedis, logger, loadServerConfig } from '@battler/server-kit';
import { matches as matchRepo, users, challenges } from '@battler/repositories';
import type { WagerTerms } from '@battler/core';
import { buildPackedTeam, reverifyTeam } from '@battler/ingest';
import { getDasProvider } from './dasProvider.js';
import { BOT_PUBKEY, type IO, type RoomManager } from './room.js';

const QUEUE_KEY = 'matchmaking_queue';
const TEAMS_KEY = 'matchmaking_teams';
const BOT_WAIT_MS = 5_000; // solo player gets a bot opponent after 5s

// ---- random WAGER matchmaking (separate queue, matched by identical stake) ----
const WAGER_QUEUE = 'wager_queue';   // zset pubkey -> join ts
const WAGER_META = 'wager_meta';     // hash pubkey -> stake "bucket"

/** Group identical stakes so only equal-stake players are paired. Card stakes are
 *  intentionally NOT random-matchable (you stake a *specific* card → use a challenge). */
function wagerBucket(w: WagerTerms): string | null {
  if (w.type === 'crypto' && typeof w.amount === 'number' && w.amount > 0) return `crypto:${Math.floor(w.amount)}`;
  return null;
}
function bucketWager(bucket: string): WagerTerms {
  return { type: 'crypto', amount: Number(bucket.slice(7)) };
}

const BOT_SPECIES = ['Charizard', 'Garchomp', 'Dragonite', 'Greninja', 'Tyranitar', 'Lucario'];

async function botTeam(): Promise<PokemonSet[]> {
  const attrs = {
    grade: '8',
    gradingCompany: 'PSA',
    set: 'Bot',
    cardNumber: '1/1',
    rarity: 'Rare',
    year: '2022',
    language: 'English',
    certNumber: null,
  };
  const profiles = [];
  for (let i = 0; i < BOT_SPECIES.length; i++) {
    const d = await deriveBattleProfile(`bot_${uuid()}`, normalizeCardName(BOT_SPECIES[i]!), attrs);
    profiles.push(d.profile);
  }
  return buildTeam(profiles);
}

/**
 * Redis-backed matchmaking. Queue = sorted set keyed by join timestamp; each
 * player's chosen team is stashed in a hash. The matchmaker ticks every second,
 * pops two players (ZPOPMIN), re-verifies both teams' on-chain ownership, and
 * opens a battle room. A player waiting alone past BOT_WAIT_MS is paired with a
 * bot so the loop is never stuck.
 */
export class Matchmaker {
  private readonly redis = getRedis();
  private interval?: NodeJS.Timeout;
  /** Injected by the server: turns a paired challenge into a (possibly escrowed) battle. */
  private wagerStarter?: (challengeId: string) => Promise<void>;

  constructor(
    private readonly io: IO,
    private readonly rooms: RoomManager,
  ) {}

  setWagerStarter(fn: (challengeId: string) => Promise<void>): void {
    this.wagerStarter = fn;
  }

  async join(pubkey: string, teamAssetIds: string[]): Promise<void> {
    await users.ensureUser(pubkey);
    await this.redis.hset(TEAMS_KEY, pubkey, JSON.stringify(teamAssetIds));
    await this.redis.zadd(QUEUE_KEY, Date.now(), pubkey);
    this.io.to(`user:${pubkey}`).emit('queue:waiting', { since: Date.now() });
  }

  async leave(pubkey: string): Promise<void> {
    await this.redis.zrem(QUEUE_KEY, pubkey);
    await this.redis.hdel(TEAMS_KEY, pubkey);
  }

  /** Join the RANDOM wager queue with a crypto stake. Card stakes use challenges. */
  async joinWager(pubkey: string, wager: WagerTerms): Promise<void> {
    const bucket = wagerBucket(wager);
    if (!bucket) {
      this.io.to(`user:${pubkey}`).emit('battle:error', {
        message: 'Random match requires a SOL stake — card stakes need “Challenge a trainer”.',
      });
      return;
    }
    await users.ensureUser(pubkey);
    await this.redis.zrem(WAGER_QUEUE, pubkey); // dedupe re-joins
    await this.redis.hset(WAGER_META, pubkey, bucket);
    await this.redis.zadd(WAGER_QUEUE, Date.now(), pubkey);
    this.io.to(`user:${pubkey}`).emit('queue:waiting', { since: Date.now() });
  }

  async leaveWager(pubkey: string): Promise<void> {
    await this.redis.zrem(WAGER_QUEUE, pubkey);
    await this.redis.hdel(WAGER_META, pubkey);
  }

  start(): void {
    this.interval = setInterval(() => {
      void this.tickWager().catch((err) => logger.error({ err }, 'wager matchmaker tick failed'));
    }, 1_000);
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
  }

  private async teamOf(pubkey: string): Promise<string[]> {
    const raw = await this.redis.hget(TEAMS_KEY, pubkey);
    await this.redis.hdel(TEAMS_KEY, pubkey);
    return raw ? (JSON.parse(raw) as string[]) : [];
  }

  async tick(): Promise<void> {
    const popped = await this.redis.zpopmin(QUEUE_KEY, 2);
    if (popped.length >= 4) {
      await this.createPvpMatch(popped[0]!, popped[2]!);
    } else if (popped.length === 2) {
      const member = popped[0]!;
      const score = Number(popped[1]);
      if (Date.now() - score > BOT_WAIT_MS) {
        await this.createBotMatch(member);
      } else {
        await this.redis.zadd(QUEUE_KEY, score, member); // re-queue preserving join time
      }
    }
  }

  private async createPvpMatch(p1: string, p2: string): Promise<void> {
    const provider = await getDasProvider();
    const p1Assets = await this.teamOf(p1);
    const p2Assets = await this.teamOf(p2);

    const v1 = await reverifyTeam(provider, p1Assets, p1);
    const v2 = await reverifyTeam(provider, p2Assets, p2);
    if (!v1.ok || !v2.ok) {
      if (!v1.ok) this.io.to(`user:${p1}`).emit('battle:error', { message: 'Ownership check failed — re-sync your collection' });
      if (!v2.ok) this.io.to(`user:${p2}`).emit('battle:error', { message: 'Ownership check failed — re-sync your collection' });
      // re-queue the verified player
      if (v1.ok) await this.redis.zadd(QUEUE_KEY, Date.now(), p1);
      if (v2.ok) await this.redis.zadd(QUEUE_KEY, Date.now(), p2);
      return;
    }

    const p1Team = await buildPackedTeam(p1Assets);
    const p2Team = await buildPackedTeam(p2Assets);
    if (p1Team.length === 0 || p2Team.length === 0) {
      this.io.to(`user:${p1}`).emit('battle:error', { message: 'No playable team — build a team first' });
      this.io.to(`user:${p2}`).emit('battle:error', { message: 'No playable team — build a team first' });
      return;
    }

    const wager = { type: 'none' as const };
    const matchId = await matchRepo.createMatch({ p1, p2, p1TeamAssets: p1Assets, p2TeamAssets: p2Assets, wager });
    const roomId = uuid();
    await this.rooms.create({ id: roomId, matchId, p1Pubkey: p1, p2Pubkey: p2, p1Team, p2Team, wager });

    this.io.to(`user:${p1}`).emit('battle:matched', { roomId, opponent: p2, wager });
    this.io.to(`user:${p2}`).emit('battle:matched', { roomId, opponent: p1, wager });
    logger.info({ roomId, matchId, p1, p2 }, 'pvp match created');
  }

  private async createBotMatch(p1: string): Promise<void> {
    const provider = await getDasProvider();
    const p1Assets = await this.teamOf(p1);
    const v1 = await reverifyTeam(provider, p1Assets, p1);
    if (!v1.ok) {
      this.io.to(`user:${p1}`).emit('battle:error', { message: 'Ownership check failed — re-sync your collection' });
      return;
    }
    const p1Team = await buildPackedTeam(p1Assets);
    if (p1Team.length === 0) {
      this.io.to(`user:${p1}`).emit('battle:error', { message: 'No playable team — build a team first' });
      return;
    }
    const wager = { type: 'none' as const };
    await users.ensureUser(BOT_PUBKEY);
    const matchId = await matchRepo.createMatch({ p1, p2: BOT_PUBKEY, p1TeamAssets: p1Assets, p2TeamAssets: [], wager });
    const roomId = uuid();
    await this.rooms.create({
      id: roomId,
      matchId,
      p1Pubkey: p1,
      p2Pubkey: BOT_PUBKEY,
      p1Team,
      p2Team: await botTeam(),
      wager,
      p2IsBot: true,
    });
    this.io.to(`user:${p1}`).emit('battle:matched', { roomId, opponent: BOT_PUBKEY, wager });
    logger.info({ roomId, matchId, p1 }, 'bot match created');
  }

  /** Pair RANDOM wager players who staked an identical amount, then funnel the pair
   *  through the normal challenge→lock→(escrow)→battle path. Solo players keep waiting. */
  async tickWager(): Promise<void> {
    const flat = await this.redis.zpopmin(WAGER_QUEUE, 50);
    if (flat.length === 0) return;
    const entries: { pubkey: string; score: number }[] = [];
    for (let i = 0; i < flat.length; i += 2) entries.push({ pubkey: flat[i]!, score: Number(flat[i + 1]) });

    // group by identical stake (read the stashed bucket; drop stale entries)
    const byBucket = new Map<string, { pubkey: string; score: number }[]>();
    for (const e of entries) {
      const bucket = await this.redis.hget(WAGER_META, e.pubkey);
      if (!bucket) continue;
      const list = byBucket.get(bucket) ?? [];
      list.push(e);
      byBucket.set(bucket, list);
    }

    for (const [bucket, list] of byBucket) {
      list.sort((a, b) => a.score - b.score);
      while (list.length >= 2) {
        const p1 = list.shift()!;
        const p2 = list.shift()!;
        await this.redis.hdel(WAGER_META, p1.pubkey);
        await this.redis.hdel(WAGER_META, p2.pubkey);
        await this.pairWager(p1.pubkey, p2.pubkey, bucketWager(bucket));
      }
      // a lone staker goes back in the queue keeping their place in line
      for (const e of list) await this.redis.zadd(WAGER_QUEUE, e.score, e.pubkey);
    }
  }

  private async pairWager(p1: string, p2: string, wager: WagerTerms): Promise<void> {
    try {
      await users.ensureUser(p1);
      await users.ensureUser(p2);
      const n = await challenges.createChallenge({ challenger: p1, challengee: p2, wager, ttlSeconds: 180 });
      await challenges.acceptChallenge(n.challengeId, p1);
      await challenges.acceptChallenge(n.challengeId, p2); // 2nd accept flips status → ACCEPTED
      if (this.wagerStarter) await this.wagerStarter(n.challengeId);
      else logger.error('wagerStarter not wired — random wager match cannot start');
      logger.info({ p1, p2, wager }, 'random wager pair matched');
    } catch (err) {
      logger.error({ err, p1, p2 }, 'pairWager failed');
      for (const who of [p1, p2]) {
        this.io.to(`user:${who}`).emit('battle:error', { message: 'Matchmaking hiccup — please search again.' });
      }
    }
  }
}
