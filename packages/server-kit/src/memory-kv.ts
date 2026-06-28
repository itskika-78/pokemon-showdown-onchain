/**
 * Dev-only in-memory KV when Redis is unavailable. Supports the GET/SET/DEL (+EX
 * TTL) string ops plus the hash and sorted-set ops the matchmaker needs, so a
 * full PvP/bot match can run end-to-end without a Redis server.
 */
export class MemoryKv {
  private store = new Map<string, { value: string; expiresAt?: number }>();
  private hashes = new Map<string, Map<string, string>>();
  private zsets = new Map<string, Map<string, number>>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ...args: unknown[]): Promise<'OK'> {
    let expiresAt: number | undefined;
    const exIdx = args.indexOf('EX');
    if (exIdx >= 0 && typeof args[exIdx + 1] === 'number') {
      expiresAt = Date.now() + (args[exIdx + 1] as number) * 1000;
    }
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async ping(): Promise<'PONG'> {
    return 'PONG';
  }

  // ---- counter ops (rate limiting) ----
  async incr(key: string): Promise<number> {
    const cur = await this.get(key); // honours TTL expiry
    const next = (cur ? Number.parseInt(cur, 10) || 0 : 0) + 1;
    const existing = this.store.get(key);
    this.store.set(key, { value: String(next), expiresAt: existing?.expiresAt });
    return next;
  }

  async pexpire(key: string, ms: number): Promise<number> {
    const e = this.store.get(key);
    if (!e) return 0;
    e.expiresAt = Date.now() + ms;
    return 1;
  }

  // ---- hash ops ----
  async hset(key: string, field: string, value: string): Promise<number> {
    let h = this.hashes.get(key);
    if (!h) {
      h = new Map();
      this.hashes.set(key, h);
    }
    const isNew = h.has(field) ? 0 : 1;
    h.set(field, value);
    return isNew;
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.hashes.get(key)?.get(field) ?? null;
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    const h = this.hashes.get(key);
    if (!h) return 0;
    let n = 0;
    for (const f of fields) if (h.delete(f)) n++;
    return n;
  }

  // ---- sorted-set ops ----
  async zadd(key: string, score: number, member: string): Promise<number> {
    let z = this.zsets.get(key);
    if (!z) {
      z = new Map();
      this.zsets.set(key, z);
    }
    const isNew = z.has(member) ? 0 : 1;
    z.set(member, score);
    return isNew;
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    const z = this.zsets.get(key);
    if (!z) return 0;
    let n = 0;
    for (const m of members) if (z.delete(m)) n++;
    return n;
  }

  async zpopmin(key: string, count = 1): Promise<string[]> {
    const z = this.zsets.get(key);
    if (!z || z.size === 0) return [];
    const sorted = [...z.entries()].sort((a, b) => a[1] - b[1]);
    const out: string[] = [];
    for (let i = 0; i < count && i < sorted.length; i++) {
      const [member, score] = sorted[i]!;
      z.delete(member);
      out.push(member, String(score));
    }
    return out;
  }
}