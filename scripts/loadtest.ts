/**
 * Load test: simulate N concurrent matchmade battles against a running stack.
 * Requires Postgres + Redis + battle-service up (docker compose up).
 *
 *   pnpm loadtest 50
 *
 * For each virtual user it: seeds a mock collection + team into Postgres (via the
 * ingest pipeline), signs a session JWT, connects a Socket.IO client, queues, and
 * plays random legal choices until the battle ends. Reports completion stats.
 */
import { io, type Socket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { loadServerConfig } from '@battler/server-kit';
import { syncOwnerAssets } from '@battler/ingest';
import { createDasProvider } from '@battler/das';
import { teams, profiles } from '@battler/repositories';

const N = Number.parseInt(process.argv[2] ?? '50', 10);
const cfg = loadServerConfig();
const WS = process.env.NEXT_PUBLIC_WS_URL ?? `http://localhost:${cfg.battlePort}`;
const provider = createDasProvider({ useMock: cfg.useMockDas, rpcUrl: cfg.heliusRpcUrl });

function jwtFor(pubkey: string): string {
  return jwt.sign({ pubkey }, cfg.jwtSecret, { algorithm: 'HS256', expiresIn: 3600 });
}

async function seedUser(pubkey: string): Promise<string[]> {
  const cards = await syncOwnerAssets(provider, pubkey);
  const playable: string[] = [];
  for (const c of cards) {
    if (c.playable && (await profiles.getProfile(c.assetId))) playable.push(c.assetId);
    if (playable.length >= 6) break;
  }
  await teams.setTeam(pubkey, playable);
  return playable;
}

function playOne(pubkey: string, team: string[]): Promise<{ ok: boolean; ms: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket: Socket = io(WS, { auth: { token: jwtFor(pubkey) }, transports: ['websocket'] });
    let roomId: string | null = null;
    const done = (ok: boolean) => {
      socket.disconnect();
      resolve({ ok, ms: Date.now() - start });
    };
    const timeout = setTimeout(() => done(false), 120_000);

    socket.on('connect', () => socket.emit('queue:join', { teamAssetIds: team }));
    socket.on('battle:matched', (p: { roomId: string }) => {
      roomId = p.roomId;
      socket.emit('battle:join', { roomId });
    });
    socket.on('battle:request', (p: { roomId: string; request: any }) => {
      // play a random legal move/switch
      const req = p.request;
      let choice = 'default';
      if (Array.isArray(req?.forceSwitch) && req.forceSwitch.some(Boolean)) {
        const i = (req.side?.pokemon ?? []).findIndex(
          (m: any) => m && !m.active && !/ fnt$/.test(m.condition ?? ''),
        );
        choice = i >= 0 ? `switch ${i + 1}` : 'pass';
      } else if (Array.isArray(req?.active)) {
        const moves = (req.active[0]?.moves ?? []).filter((m: any) => !m.disabled);
        choice = `move ${moves.length ? Math.floor(Math.random() * moves.length) + 1 : 1}`;
      }
      if (roomId) socket.emit('battle:choice', { roomId, choice });
    });
    socket.on('battle:end', () => {
      clearTimeout(timeout);
      done(true);
    });
    socket.on('connect_error', () => {
      clearTimeout(timeout);
      done(false);
    });
  });
}

async function main() {
  console.log(`Load test: ${N} concurrent battles → ${WS}`);
  const users = Array.from({ length: N }, (_, i) => `LoadTestUser${String(i).padStart(4, '0')}xxxxxxxxxxxx`);

  console.log('Seeding teams…');
  const teamsByUser = new Map<string, string[]>();
  for (const u of users) teamsByUser.set(u, await seedUser(u));

  console.log('Connecting + battling…');
  const t0 = Date.now();
  const results = await Promise.all(users.map((u) => playOne(u, teamsByUser.get(u)!)));

  const ok = results.filter((r) => r.ok).length;
  const avg = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length);
  console.log(`\nDone in ${Date.now() - t0}ms`);
  console.log(`completed: ${ok}/${N}  avg battle time: ${avg}ms`);
  process.exit(ok === N ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
