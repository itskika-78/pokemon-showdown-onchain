import http from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { v4 as uuid } from 'uuid';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  WagerTerms,
} from '@battler/core';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  loadServerConfig,
  logger,
  metricsText,
  metricsContentType,
  newRedisConnection,
  pingPostgres,
  pingRedis,
  clusterForNetwork,
} from '@battler/server-kit';
import { assets, challenges, matches as matchRepo, teams } from '@battler/repositories';
import { buildPackedTeam, reverifyTeam, getEffectiveDasSettings } from '@battler/ingest';
import { verifySolTransfer, refundFromEscrow } from '@battler/settlement';
import { NetworkAwareSettlement, escrowPubkey, loadEscrowKeypair } from './settlement.js';
import { PgEscrowStore } from './escrowStore.js';
import { socketAuth } from './auth.js';
import { RoomManager } from './room.js';
import { Matchmaker } from './matchmaker.js';
import { getDasProvider } from './dasProvider.js';

const START = Date.now();

/** Hard cap so a fat-fingered or hostile crypto wager can't propose absurd stakes. */
const MAX_WAGER_BASE_UNITS = 1_000_000_000_000_000; // 1M SOL in lamports

/**
 * Server-authoritative wager validation. Never trust client-asserted terms:
 * crypto amounts must be positive integers within a sane cap; card stakes must
 * name an asset (ownership is verified at lock time against the DB).
 */
function validateWagerTerms(w: WagerTerms | null | undefined): string | null {
  if (!w || typeof w !== 'object') return 'missing terms';
  if (w.type === 'none') return 'friendly stakes are disabled — set a SOL or card wager';
  if (w.type === 'crypto') {
    const a = w.amount;
    if (typeof a !== 'number' || !Number.isFinite(a) || !Number.isInteger(a) || a <= 0) {
      return 'amount must be a positive integer';
    }
    if (a > MAX_WAGER_BASE_UNITS) return 'amount too large';
    return null;
  }
  if (w.type === 'card') {
    if (typeof w.assetId !== 'string' || !w.assetId) return 'card stake requires an asset id';
    return null;
  }
  return 'unknown wager type';
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Per-socket fixed-window event throttle. Returns a function that yields false
 * once a socket exceeds `max` events within `windowMs` — cheap flood protection
 * on top of the per-event auth/validation.
 */
function makeSocketThrottle(max = 40, windowMs = 1_000): () => boolean {
  let count = 0;
  let windowStart = Date.now();
  return () => {
    const now = Date.now();
    if (now - windowStart > windowMs) {
      windowStart = now;
      count = 0;
    }
    count += 1;
    return count <= max;
  };
}

/** Recursively collect anything that looks like a cNFT asset id from a payload. */
function collectAssetIds(node: unknown, out = new Set<string>()): Set<string> {
  if (!node || typeof node !== 'object') return out;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if ((k === 'assetId' || k === 'asset_id') && typeof v === 'string') out.add(v);
    else if (v && typeof v === 'object') collectAssetIds(v, out);
  }
  return out;
}

export async function createServer() {
  const cfg = loadServerConfig();
  // Network-aware: off-chain credits in mock, real on-chain SOL escrow on devnet/mainnet.
  const settlement = new NetworkAwareSettlement();

  const httpServer = http.createServer((req, res) => {
    void handleHttp(req, res).catch((err) => {
      logger.error({ err }, 'http handler error');
      if (!res.headersSent) res.writeHead(500);
      res.end('error');
    });
  });

  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
    httpServer,
    { cors: { origin: cfg.webOrigin, credentials: true } },
  );
  io.adapter(createAdapter(newRedisConnection(), newRedisConnection()));
  io.use(socketAuth);

  const rooms = new RoomManager(io, settlement);
  const matchmaker = new Matchmaker(io, rooms);
  // Random wager pairs reuse the exact challenge→lock→(escrow)→battle path.
  matchmaker.setWagerStarter(lockAndStart);
  matchmaker.start();

  io.on('connection', (socket) => {
    const pubkey = socket.data.pubkey;
    void socket.join(`user:${pubkey}`);
    logger.info({ pubkey, id: socket.id }, 'socket connected');
    void emitPendingChallenges(pubkey);

    // Per-socket flood guard: a hostile client can otherwise spam events (queue
    // churn, negotiation/choice floods). Drop events past ~40/sec for this socket.
    const allow = makeSocketThrottle();
    const guard = <T extends unknown[]>(fn: (...a: T) => void) => (...a: T) => {
      if (!allow()) return;
      fn(...a);
    };

    socket.on('queue:join', guard(() => {
      io.to(`user:${pubkey}`).emit('battle:error', {
        message: 'Free battles are disabled — use wager matchmaking with a SOL or card stake.',
      });
    }));
    socket.on('queue:leave', guard(() => void matchmaker.leave(pubkey)));
    // Random WAGER matchmaking — queue with a stake, get paired with a random equal staker.
    socket.on('queue:joinWager', guard((p) => {
      const err = validateWagerTerms(p.wager);
      if (err) { io.to(`user:${pubkey}`).emit('battle:error', { message: `Invalid wager: ${err}` }); return; }
      void matchmaker.joinWager(pubkey, p.wager);
    }));
    socket.on('queue:leaveWager', guard(() => void matchmaker.leaveWager(pubkey)));

    socket.on('battle:join', guard((p) => {
      if (!rooms.attach(p.roomId, pubkey, socket)) {
        socket.emit('battle:error', { roomId: p.roomId, message: 'Room not found or not a participant' });
      }
    }));
    socket.on('battle:reconnect', guard((p) => {
      rooms.attach(p.roomId, pubkey, socket);
    }));
    socket.on('battle:choice', guard((p) => void rooms.submitChoice(pubkey, p.roomId, p.choice)));

    // ---- structured negotiation (Phase 9) ----
    socket.on('negotiation:propose', guard((p) => void onPropose(pubkey, p.challengeId, p.wager)));
    socket.on('negotiation:reject', guard((p) => void onReject(pubkey, p.challengeId)));
    socket.on('negotiation:accept', guard((p) => void onAccept(pubkey, p.challengeId)));
    socket.on('wager:deposit', guard((p) => void onWagerDeposit(pubkey, p.roomId, p.signature)));

    socket.on('disconnect', () => {
      rooms.detach(pubkey, socket);
      void matchmaker.leave(pubkey);
      logger.info({ pubkey }, 'socket disconnected');
    });
  });

  async function onPropose(pubkey: string, challengeId: string, wager: WagerTerms) {
    const err = validateWagerTerms(wager);
    if (err) {
      io.to(`user:${pubkey}`).emit('battle:error', { message: `Invalid wager: ${err}` });
      return;
    }
    const n = await challenges.counterChallenge(challengeId, wager, pubkey);
    if (n) emitNegotiation(n);
  }
  async function onReject(pubkey: string, challengeId: string) {
    // Only a participant may reject — prevents griefing arbitrary challenge ids.
    const n = await challenges.rejectChallenge(challengeId, pubkey);
    if (n) emitNegotiation(n);
  }
  async function onAccept(pubkey: string, challengeId: string) {
    const n = await challenges.acceptChallenge(challengeId, pubkey);
    if (!n) return;
    emitNegotiation(n);
    if (n.status === 'ACCEPTED') await lockAndStart(challengeId);
  }

  function emitNegotiation(n: Awaited<ReturnType<typeof challenges.getChallenge>>) {
    if (!n) return;
    const payload = {
      challengeId: n.challengeId,
      challengerPubkey: n.challengerPubkey,
      challengeePubkey: n.challengeePubkey,
      status: n.status,
      wager: n.wager,
      challengerAccepted: n.challengerAccepted,
      challengeeAccepted: n.challengeeAccepted,
    };
    for (const who of [n.challengerPubkey, n.challengeePubkey]) {
      io.to(`user:${who}`).emit('negotiation:update', payload);
    }
  }

  async function emitPendingChallenges(pubkey: string) {
    const list = await challenges.listActiveForUser(pubkey);
    for (const n of list) emitNegotiation(n);
  }

  // Rooms held in the "awaiting escrow deposits" phase (on-chain SOL wagers).
  interface PendingEscrow {
    challengeId: string;
    matchId: string;
    roomId: string;
    p1: string;
    p2: string;
    lamports: number;
    cluster: string;
    rpcUrl: string;
    deposited: Set<string>;
    timer: NodeJS.Timeout;
  }
  const pendingEscrow = new Map<string, PendingEscrow>();

  function emitStart(challengeId: string, roomId: string, wager: WagerTerms) {
    const startsAt = Date.now() + 3_000;
    const room = rooms.get(roomId);
    for (const who of [room?.p1Pubkey, room?.p2Pubkey]) {
      if (who) io.to(`user:${who}`).emit('negotiation:locked', { challengeId, roomId, wager, startsAt });
    }
  }

  async function lockAndStart(challengeId: string) {
    const n = await challenges.getChallenge(challengeId);
    if (!n || n.status !== 'ACCEPTED') return;

    // Re-validate terms server-side at the moment of commitment (defense in depth).
    const wErr = validateWagerTerms(n.wager);
    if (wErr) {
      for (const who of [n.challengerPubkey, n.challengeePubkey]) {
        io.to(`user:${who}`).emit('battle:error', { message: `Wager rejected: ${wErr}` });
      }
      await challenges.setChallengeStatus(challengeId, 'REJECTED');
      return;
    }

    const provider = await getDasProvider();

    const aAssets = await teams.getTeam(n.challengerPubkey);
    const bAssets = await teams.getTeam(n.challengeePubkey);
    const va = await reverifyTeam(provider, aAssets, n.challengerPubkey);
    const vb = await reverifyTeam(provider, bAssets, n.challengeePubkey);
    if (!va.ok || !vb.ok) {
      io.to(`user:${n.challengerPubkey}`).emit('battle:error', { message: 'Ownership check failed' });
      io.to(`user:${n.challengeePubkey}`).emit('battle:error', { message: 'Ownership check failed' });
      return;
    }

    // A staked card must actually be owned by a participant and be playable —
    // otherwise a loss would (mock) reassign or (on-chain) try to move a card the
    // staker doesn't hold. Verify against the freshly re-verified DB state.
    if (n.wager.type === 'card' && n.wager.assetId) {
      const rec = await assets.getAsset(n.wager.assetId);
      const owner = rec?.ownerPubkey;
      if (!rec || !rec.playable || (owner !== n.challengerPubkey && owner !== n.challengeePubkey)) {
        for (const who of [n.challengerPubkey, n.challengeePubkey]) {
          io.to(`user:${who}`).emit('battle:error', { message: 'Staked card is not owned by a player or is not playable' });
        }
        await challenges.setChallengeStatus(challengeId, 'REJECTED');
        return;
      }
    }
    const aTeam = await buildPackedTeam(aAssets);
    const bTeam = await buildPackedTeam(bAssets);
    if (!aTeam.length || !bTeam.length) return;

    const matchId = await matchRepo.createMatch({
      p1: n.challengerPubkey,
      p2: n.challengeePubkey,
      p1TeamAssets: aAssets,
      p2TeamAssets: bAssets,
      wager: n.wager,
    });
    const roomId = uuid();

    // Decide whether this match needs an on-chain escrow deposit phase first.
    const eff = await getEffectiveDasSettings().catch(() => null);
    const cluster = eff ? clusterForNetwork(eff.mode) : 'devnet';
    const rpcUrl = (cluster === 'mainnet-beta' ? eff?.heliusRpcUrl : eff?.heliusDevnetRpcUrl) ?? '';
    const onChainWager =
      n.wager.type === 'crypto' && (n.wager.amount ?? 0) > 0 && !!eff?.activeRpcUrl && !!escrowPubkey && !!rpcUrl;

    await rooms.create(
      {
        id: roomId,
        matchId,
        p1Pubkey: n.challengerPubkey,
        p2Pubkey: n.challengeePubkey,
        p1Team: aTeam,
        p2Team: bTeam,
        wager: n.wager,
      },
      !onChainWager, // autoStart unless we must collect deposits first
    );

    if (onChainWager) {
      const lamports = n.wager.amount!;
      const timer = setTimeout(() => voidEscrow(roomId, 'deposit timeout'), 120_000);
      pendingEscrow.set(roomId, {
        challengeId, matchId, roomId,
        p1: n.challengerPubkey, p2: n.challengeePubkey,
        lamports, cluster, rpcUrl, deposited: new Set(), timer,
      });
      for (const who of [n.challengerPubkey, n.challengeePubkey]) {
        io.to(`user:${who}`).emit('wager:awaiting-deposit', { roomId, escrow: escrowPubkey!, lamports, cluster });
      }
      logger.info({ challengeId, roomId, matchId, lamports, cluster }, 'on-chain wager → awaiting escrow deposits');
      return;
    }

    emitStart(challengeId, roomId, n.wager);
    logger.info({ challengeId, roomId, matchId }, 'negotiation locked → battle starting');
  }

  /** A player submitted a stake-deposit signature; verify + record; start when both in. */
  async function onWagerDeposit(pubkey: string, roomId: string, signature: string) {
    const p = pendingEscrow.get(roomId);
    if (!p || (pubkey !== p.p1 && pubkey !== p.p2)) return;
    if (p.deposited.has(pubkey)) return;
    const conn = new Connection(p.rpcUrl, 'confirmed');
    const v = await verifySolTransfer(conn, { signature, from: pubkey, to: escrowPubkey!, minLamports: p.lamports });
    if (!v.ok) {
      io.to(`user:${pubkey}`).emit('wager:deposit-update', { roomId, youDeposited: false, bothDeposited: false, message: v.reason });
      return;
    }
    const store = new PgEscrowStore(p.cluster);
    await store.recordDeposit({ matchId: p.matchId, pubkey, signature, lamports: v.lamports });
    p.deposited.add(pubkey);
    const both = p.deposited.has(p.p1) && p.deposited.has(p.p2);
    io.to(`user:${pubkey}`).emit('wager:deposit-update', { roomId, youDeposited: true, bothDeposited: both });
    if (both) {
      clearTimeout(p.timer);
      pendingEscrow.delete(roomId);
      await rooms.start(roomId);
      emitStart(p.challengeId, roomId, { type: 'crypto', amount: p.lamports });
      logger.info({ roomId, matchId: p.matchId }, 'both staked → on-chain wager battle starting');
    }
  }

  /** No-show / timeout: refund whoever deposited and discard the room. */
  async function voidEscrow(roomId: string, reason: string) {
    const p = pendingEscrow.get(roomId);
    if (!p) return;
    pendingEscrow.delete(roomId);
    clearTimeout(p.timer);
    rooms.discard(roomId);
    try {
      const store = new PgEscrowStore(p.cluster);
      const deposits = await store.depositsFor(p.matchId);
      const kp = loadEscrowKeypair();
      const cfg = loadServerConfig();
      if (kp && deposits.length && cfg.treasuryWallet) {
        await refundFromEscrow(
          { connection: new Connection(p.rpcUrl, 'confirmed'), escrow: kp, treasury: new PublicKey(cfg.treasuryWallet), feeBps: cfg.platformFeeBps },
          deposits,
        );
      }
    } catch (e) {
      logger.error({ err: e, roomId }, 'escrow refund failed');
    }
    for (const who of [p.p1, p.p2]) {
      io.to(`user:${who}`).emit('battle:error', { message: `Wager cancelled (${reason}). Any deposit was refunded.` });
    }
  }

  async function handleHttp(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/health') {
      const [redis, postgres] = await Promise.all([pingRedis(), pingPostgres()]);
      const body = {
        status: redis && postgres ? 'ok' : 'degraded',
        uptime: Math.floor((Date.now() - START) / 1000),
        redis: redis ? 'ok' : 'err',
        postgres: postgres ? 'ok' : 'err',
      };
      res.writeHead(redis && postgres ? 200 : 503, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/metrics') {
      res.writeHead(200, { 'content-type': metricsContentType });
      res.end(await metricsText());
      return;
    }

    // Phase 10 — Helius webhook: a cNFT transfer means re-verify those assets.
    if (req.method === 'POST' && url.pathname === '/webhooks/helius') {
      // When a secret is configured, require it (Authorization header) so a
      // stranger can't spam reverify-flags / abuse the endpoint as a DoS vector.
      const secret = cfg.heliusWebhookSecret;
      if (secret) {
        const provided = req.headers.authorization ?? '';
        const bearer = provided.startsWith('Bearer ') ? provided.slice(7) : provided;
        if (bearer !== secret) {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'unauthorized' }));
          return;
        }
      }
      const body = await readJson(req);
      const ids = collectAssetIds(body);
      for (const id of ids) await assets.flagForReverify(id).catch(() => undefined);
      logger.info({ count: ids.size }, 'helius webhook: flagged assets for reverify');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ flagged: ids.size }));
      return;
    }

    res.writeHead(404);
    res.end('not found');
  }

  return { httpServer, io, matchmaker };
}
