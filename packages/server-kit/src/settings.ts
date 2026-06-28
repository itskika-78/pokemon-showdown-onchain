import { getRedis } from './redis.js';
import type { DasNetwork } from './settings.types.js';

export type { DasNetwork, DasMode, DasSettings } from './settings.types.js';
export { isDasNetwork, clusterForNetwork } from './settings.types.js';

const KEY = 'settings:das';

/** @deprecated Redis now stores mode only — RPC URLs live in env vars. */
interface LegacyDasSettings {
  mode?: unknown;
  heliusRpcUrl?: string;
  heliusDevnetRpcUrl?: string;
}

/** Read the active network mode from Redis (RPC URLs are env-only). */
export async function getDasSettings(): Promise<DasNetwork | null> {
  const raw = await getRedis().get(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LegacyDasSettings | { mode?: unknown };
    const mode = coerceMode(parsed.mode);
    return mode;
  } catch {
    return null;
  }
}

function coerceMode(v: unknown): DasNetwork | null {
  if (v === 'devnet' || v === 'mainnet') return v;
  if (v === 'mock') return 'devnet';
  return null;
}

/** Persist network mode only — never store RPC URLs or API keys in Redis. */
export async function setDasSettingsMode(mode: DasNetwork): Promise<void> {
  await getRedis().set(KEY, JSON.stringify({ mode }));
}
