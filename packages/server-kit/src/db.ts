import pg from 'pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { loadServerConfig } from './config.js';

const { Pool } = pg;

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    // Serverless (Vercel) opens a fresh pool per instance, so a large `max`
    // across many concurrent lambdas can exhaust Postgres connections. Keep the
    // pool small there (PG_POOL_MAX=1–3 + a pooled/PgBouncer DATABASE_URL) and
    // close idle clients quickly; the long-running battle-service can use more.
    const max = Number(process.env.PG_POOL_MAX ?? 10);
    pool = new Pool({
      connectionString: loadServerConfig().databaseUrl,
      max: Number.isFinite(max) && max > 0 ? max : 10,
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS ?? 10_000),
      connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 10_000),
    });
    // A pool-level error listener prevents an idle-client disconnect from
    // crashing the process (Vercel/managed PG drop idle conns aggressively).
    pool.on('error', (err) => {
      console.warn(`[server-kit] pg pool idle-client error: ${err.message}`);
    });
  }
  return pool;
}

/** Parameterized query (NEVER interpolate user input into SQL). */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params as unknown[]);
}

/** Run `fn` inside a BEGIN/COMMIT transaction, rolling back on any error. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function pingPostgres(timeoutMs = 10_000): Promise<boolean> {
  try {
    await Promise.race([
      query('SELECT 1'),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('postgres ping timeout')), timeoutMs);
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

export type { PoolClient, QueryResult, QueryResultRow };
