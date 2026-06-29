import { query } from './db.js';
import { getRedis } from './redis.js';
import type { DasNetwork } from './settings.types.js';

export type { DasNetwork, DasMode, DasSettings } from './settings.types.js';
export { isDasNetwork, clusterForNetwork } from './settings.types.js';

const REDIS_KEY = 'settings:das';
const PG_KEY = 'das_mode';

/** @deprecated Redis now stores mode only — RPC URLs live in env vars. */
interface LegacyDasSettings {
  mode?: unknown;
  heliusRpcUrl?: string;
  heliusDevnetRpcUrl?: string;
}

function coerceMode(v: unknown): DasNetwork | null {
  if (v === 'devnet' || v === 'mainnet') return v;
  if (v === 'mock') return 'devnet';
  return null;
}

function parseModeRaw(raw: string | null | undefined): DasNetwork | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LegacyDasSettings | { mode?: unknown };
    return coerceMode(parsed.mode);
  } catch {
    return null;
  }
}

async function ensurePlatformKvTable(): Promise<void> {
  await query(
    `CREATE TABLE IF NOT EXISTS platform_kv (
       key         TEXT PRIMARY KEY,
       value       JSONB NOT NULL,
       updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
  );
}

async function readPostgresMode(): Promise<DasNetwork | null> {
  try {
    await ensurePlatformKvTable();
    const res = await query<{ value: { mode?: unknown } | string }>(
      'SELECT value FROM platform_kv WHERE key = $1',
      [PG_KEY],
    );
    const row = res.rows[0]?.value;
    if (!row) return null;
    if (typeof row === 'string') return parseModeRaw(row);
    return coerceMode(row.mode);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('platform_kv')) {
      console.warn('[settings] postgres read failed:', msg);
    }
    return null;
  }
}

async function writePostgresMode(mode: DasNetwork): Promise<void> {
  const payload = JSON.stringify({ mode });
  await ensurePlatformKvTable();
  await query(
    `INSERT INTO platform_kv (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [PG_KEY, payload],
  );
}

/** Read the active network mode — Postgres first (durable on Vercel), then Redis. */
export async function getDasSettings(): Promise<DasNetwork | null> {
  const pgMode = await readPostgresMode();
  if (pgMode) return pgMode;

  const raw = await getRedis().get(REDIS_KEY);
  return parseModeRaw(raw);
}

/** Persist network mode to Postgres + Redis (never store RPC URLs or API keys). */
export async function setDasSettingsMode(mode: DasNetwork): Promise<void> {
  const payload = JSON.stringify({ mode });
  await writePostgresMode(mode);
  try {
    await getRedis().set(REDIS_KEY, payload);
  } catch {
    /* redis/memory optional after postgres write */
  }
}
