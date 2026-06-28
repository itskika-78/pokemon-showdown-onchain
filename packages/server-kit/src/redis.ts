import Redis from 'ioredis';
import { loadServerConfig } from './config.js';
import { MemoryKv } from './memory-kv.js';

/**
 * ioredis emits an `error` event on every failed (re)connection. With no
 * listener, Node treats it as an unhandled error — log spam at best, a process
 * crash at worst. Attach a quiet handler to every connection we create.
 */
function attachErrorHandler(r: Redis, label: string): Redis {
  let warned = false;
  r.on('error', (err: Error) => {
    if (!warned) {
      console.warn(`[server-kit] Redis (${label}) error: ${err.message}`);
      warned = true; // only the first, to avoid flooding logs on retry loops
    }
  });
  return r;
}

export interface KvClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<'OK'>;
  del(key: string): Promise<number>;
  ping(): Promise<string>;
  // counter ops (Redis-backed rate limiting)
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  // hash ops (matchmaking team stash)
  hset(key: string, field: string, value: string): Promise<number>;
  hget(key: string, field: string): Promise<string | null>;
  hdel(key: string, ...fields: string[]): Promise<number>;
  // sorted-set ops (matchmaking queue keyed by join time)
  zadd(key: string, score: number, member: string): Promise<number>;
  zrem(key: string, ...members: string[]): Promise<number>;
  /** Pop the `count` lowest-scored members as a flat [member, score, ...] array. */
  zpopmin(key: string, count?: number): Promise<string[]>;
}

let client: KvClient | undefined;
let clientMode: 'redis' | 'memory' | 'pending' = 'pending';

/**
 * A durable, long-lived Redis client: auto-reconnects, buffers commands while
 * reconnecting (offline queue on), and retries indefinitely instead of throwing
 * "Stream isn't writeable" on a transient drop. Used for both the dev and prod
 * primary client so a Redis blip never wedges the matchmaker/rate-limiter.
 */
function durableClient(url: string): Redis {
  return attachErrorHandler(
    new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: null, // keep retrying through reconnects (don't fail commands)
      enableOfflineQueue: true,
      retryStrategy: (times) => Math.min(times * 200, 3_000),
    }),
    'main',
  );
}

async function resolveClient(): Promise<KvClient> {
  if (client) return client;

  const cfg = loadServerConfig();
  const forceRedis = process.env.FORCE_REDIS === '1';

  // FORCE_REDIS (the battle-service, which truly requires shared Redis) → use the
  // durable client directly. Everything else (incl. the Vercel web app) PROBES
  // first and falls back to in-memory KV when Redis is unreachable — otherwise an
  // unset/unreachable REDIS_URL leaves the durable client's offline queue waiting
  // forever and every request (e.g. the rate-limited /api/rpc) hangs until timeout.
  if (forceRedis) {
    client = durableClient(cfg.redisUrl) as unknown as KvClient;
    clientMode = 'redis';
    return client;
  }

  // Probe with a fragile, fail-fast connection (offline queue OFF, 1 retry) so we
  // fall back to the in-memory KV quickly when Redis is down or not configured.
  const probe = attachErrorHandler(new Redis(cfg.redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 1500,
    lazyConnect: true,
    enableOfflineQueue: false,
  }), 'probe');
  try {
    await probe.connect();
    await probe.ping();
    await probe.quit().catch(() => undefined);
    // ...but for the long-lived client use a DURABLE connection (default offline
    // queue + auto-reconnect) — otherwise a single Redis blip leaves a permanently
    // un-writeable stream ("Stream isn't writeable").
    client = durableClient(cfg.redisUrl) as unknown as KvClient;
    clientMode = 'redis';
  } catch {
    await probe.quit().catch(() => undefined);
    client = new MemoryKv();
    clientMode = 'memory';
    console.warn('[server-kit] Redis unavailable — using in-memory KV. Set REDIS_URL to a reachable Redis (e.g. Upstash) for shared state across instances.');
  }
  return client;
}

let clientPromise: Promise<KvClient> | undefined;

function getClientPromise(): Promise<KvClient> {
  if (!clientPromise) clientPromise = resolveClient();
  return clientPromise;
}

/** Redis-compatible KV; falls back to in-memory store in dev when Redis is down. */
export function getRedis(): KvClient {
  if (client) return client;
  const proxy: KvClient = {
    get: async (key) => (await getClientPromise()).get(key),
    set: async (key, value, ...args) => (await getClientPromise()).set(key, value, ...args),
    del: async (key) => (await getClientPromise()).del(key),
    ping: async () => (await getClientPromise()).ping(),
    incr: async (key) => (await getClientPromise()).incr(key),
    pexpire: async (key, ms) => (await getClientPromise()).pexpire(key, ms),
    hset: async (key, field, value) => (await getClientPromise()).hset(key, field, value),
    hget: async (key, field) => (await getClientPromise()).hget(key, field),
    hdel: async (key, ...fields) => (await getClientPromise()).hdel(key, ...fields),
    zadd: async (key, score, member) => (await getClientPromise()).zadd(key, score, member),
    zrem: async (key, ...members) => (await getClientPromise()).zrem(key, ...members),
    zpopmin: async (key, count) => (await getClientPromise()).zpopmin(key, count),
  };
  return proxy;
}

export function getRedisMode(): 'redis' | 'memory' | 'pending' {
  return clientMode;
}

/** A second connection — Socket.IO's Redis adapter needs a dedicated pub/sub pair. */
export function newRedisConnection(): Redis {
  return attachErrorHandler(new Redis(loadServerConfig().redisUrl), 'pubsub');
}

export async function pingRedis(timeoutMs = 10_000): Promise<boolean> {
  try {
    const pong = await Promise.race([
      getRedis().ping(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('redis ping timeout')), timeoutMs);
      }),
    ]);
    return pong === 'PONG';
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (client && client instanceof Redis) {
    await (client as unknown as Redis).quit();
  }
  client = undefined;
  clientPromise = undefined;
  clientMode = 'pending';
}

export type { Redis };
