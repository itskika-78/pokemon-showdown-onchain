import { query } from '@battler/server-kit';

export interface UserRecord {
  pubkey: string;
  rating: number;
  ledgerBalance: number;
  suspended: boolean;
  username: string | null;
}

export interface PublicUser {
  pubkey: string;
  username: string | null;
  rating: number;
}

/** Usernames: 3–20 chars, letters/numbers/_ , must start with a letter. */
const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
export function isValidUsername(name: unknown): name is string {
  return typeof name === 'string' && USERNAME_RE.test(name);
}

interface UserDbRow {
  pubkey: string;
  rating: number;
  ledger_balance: string;
  suspended: boolean;
  username: string | null;
}

export async function ensureUser(pubkey: string): Promise<void> {
  await query('INSERT INTO users (pubkey) VALUES ($1) ON CONFLICT (pubkey) DO NOTHING', [pubkey]);
}

export async function getUser(pubkey: string): Promise<UserRecord | null> {
  const res = await query<UserDbRow>(
    'SELECT pubkey, rating, ledger_balance, suspended, username FROM users WHERE pubkey = $1',
    [pubkey],
  );
  const r = res.rows[0];
  if (!r) return null;
  return { pubkey: r.pubkey, rating: r.rating, ledgerBalance: Number(r.ledger_balance), suspended: r.suspended, username: r.username };
}

/** Set (or change) the caller's unique username. Returns false if it's taken. */
export async function setUsername(pubkey: string, username: string): Promise<{ ok: boolean; reason?: string }> {
  if (!isValidUsername(username)) return { ok: false, reason: 'invalid' };
  await ensureUser(pubkey);
  // someone else already owns this handle (case-insensitive)?
  const taken = await query<{ pubkey: string }>(
    'SELECT pubkey FROM users WHERE lower(username) = lower($1) AND pubkey <> $2',
    [username, pubkey],
  );
  if (taken.rows.length > 0) return { ok: false, reason: 'taken' };
  await query('UPDATE users SET username = $2 WHERE pubkey = $1', [pubkey, username]);
  return { ok: true };
}

/** Resolve a username (case-insensitive) → pubkey. */
export async function getByUsername(username: string): Promise<PublicUser | null> {
  const res = await query<{ pubkey: string; username: string | null; rating: number }>(
    'SELECT pubkey, username, rating FROM users WHERE lower(username) = lower($1)',
    [username],
  );
  return res.rows[0] ?? null;
}

/** Prefix-search trainers by username (for the battle opponent picker). */
export async function searchByUsername(q: string, limit = 8): Promise<PublicUser[]> {
  const term = q.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  if (term.length < 1) return [];
  const res = await query<{ pubkey: string; username: string | null; rating: number }>(
    `SELECT pubkey, username, rating FROM users
       WHERE username IS NOT NULL AND lower(username) LIKE $1
       ORDER BY (lower(username) = $2) DESC, username ASC LIMIT $3`,
    [`${term}%`, term, Math.min(limit, 20)],
  );
  return res.rows;
}

/** Batch-fetch display names for a set of pubkeys (friends list, lobbies). */
export async function getPublicUsers(pubkeys: string[]): Promise<PublicUser[]> {
  if (pubkeys.length === 0) return [];
  const res = await query<{ pubkey: string; username: string | null; rating: number }>(
    'SELECT pubkey, username, rating FROM users WHERE pubkey = ANY($1)',
    [pubkeys],
  );
  return res.rows;
}

export async function isSuspended(pubkey: string): Promise<boolean> {
  const res = await query<{ suspended: boolean }>('SELECT suspended FROM users WHERE pubkey = $1', [pubkey]);
  return res.rows[0]?.suspended ?? false;
}

export async function setSuspended(pubkey: string, suspended: boolean): Promise<void> {
  await query('UPDATE users SET suspended = $2 WHERE pubkey = $1', [pubkey, suspended]);
}

/** Debit fake credits for a purchase. Atomic + balance-guarded; writes a ledger row. */
export async function spend(
  pubkey: string,
  amount: number,
  reason = 'purchase',
): Promise<{ ok: boolean; balance: number }> {
  const upd = await query<{ ledger_balance: string }>(
    'UPDATE users SET ledger_balance = ledger_balance - $2 WHERE pubkey = $1 AND ledger_balance >= $2 RETURNING ledger_balance',
    [pubkey, amount],
  );
  if (upd.rows.length === 0) {
    const u = await getUser(pubkey);
    return { ok: false, balance: u?.ledgerBalance ?? 0 };
  }
  const balanceAfter = Number(upd.rows[0]!.ledger_balance);
  await query(
    'INSERT INTO ledger_entries (user_pubkey, delta, balance_after, reason) VALUES ($1, $2, $3, $4)',
    [pubkey, -amount, balanceAfter, reason],
  );
  return { ok: true, balance: balanceAfter };
}

/** Dev faucet: credit fake balance + write a ledger row (so balances reconcile). */
export async function faucet(pubkey: string, amount: number): Promise<number> {
  const upd = await query<{ ledger_balance: string }>(
    'UPDATE users SET ledger_balance = ledger_balance + $2 WHERE pubkey = $1 RETURNING ledger_balance',
    [pubkey, amount],
  );
  const balanceAfter = Number(upd.rows[0]?.ledger_balance ?? 0);
  await query(
    "INSERT INTO ledger_entries (user_pubkey, delta, balance_after, reason) VALUES ($1, $2, $3, 'faucet')",
    [pubkey, amount, balanceAfter],
  );
  return balanceAfter;
}
