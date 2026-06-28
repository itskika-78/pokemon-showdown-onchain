import { getRedis } from '@battler/server-kit';

const PREFIX = 'assets:';
const TTL_S = 300;

const mem = new Map<string, { at: number; json: string }>();
const MEM_MS = 60_000;

export async function getCachedAssets(owner: string): Promise<string | null> {
  const m = mem.get(owner);
  if (m && Date.now() - m.at < MEM_MS) return m.json;

  try {
    const raw = await getRedis().get(`${PREFIX}${owner}`);
    if (raw) {
      mem.set(owner, { at: Date.now(), json: raw });
      return raw;
    }
  } catch {
    /* optional */
  }
  return null;
}

export async function setCachedAssets(owner: string, json: string): Promise<void> {
  mem.set(owner, { at: Date.now(), json });
  try {
    await getRedis().set(`${PREFIX}${owner}`, json, 'EX', TTL_S);
  } catch {
    /* optional */
  }
}

export async function invalidateOwnerAssets(owner: string): Promise<void> {
  mem.delete(owner);
  try {
    await getRedis().del(`${PREFIX}${owner}`);
  } catch {
    /* optional */
  }
}
