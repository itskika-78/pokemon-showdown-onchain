/**
 * Dev-only: run a real embedded Postgres 16 (no Docker / no system install).
 * Initialises a persistent data dir under .runtime/pgdata, starts the server on
 * :5432, ensures the `battler` database exists, loads db/schema.sql, then stays
 * alive so the rest of the stack can use it. Stop with Ctrl-C / kill.
 *
 *   node scripts/dev-postgres.mjs
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pglib from 'pg';

const dataDir = path.resolve('.runtime/pgdata');
const schemaPath = path.resolve('db/schema.sql');
const connStr = 'postgres://battler:battler@localhost:5432/battler';
const alreadyInit = existsSync(path.join(dataDir, 'PG_VERSION'));

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'battler',
  password: 'battler',
  port: 5432,
  persistent: true,
  // Force UTF8 on first init. On Windows initdb otherwise picks the OS locale
  // (WIN1252), which then rejects real NFT metadata containing non-Latin1 chars
  // (Postgres 22P05) — that silently broke real Helius cNFT ingestion. C locale
  // keeps collation portable; UTF8 stores any valid Unicode.
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

if (!alreadyInit) {
  console.log('[pg] initialising data dir…');
  await pg.initialise();
} else {
  console.log('[pg] reusing existing data dir');
}

console.log('[pg] starting…');
await pg.start();

try {
  await pg.createDatabase('battler');
  console.log('[pg] created database "battler"');
} catch {
  console.log('[pg] database "battler" already exists');
}

const client = new pglib.Client({ connectionString: connStr });
await client.connect();
await client.query(readFileSync(schemaPath, 'utf8'));
// Guard: a pre-existing non-UTF8 cluster will reject real NFT metadata. Loudly
// tell the operator to recreate it (the initdb encoding only applies on a fresh
// data dir), rather than failing mysteriously later on a real wallet sync.
try {
  const enc = await client.query(
    "SELECT pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE datname = current_database()",
  );
  const dbEnc = enc.rows[0]?.enc;
  if (dbEnc && dbEnc !== 'UTF8') {
    console.warn(
      `[pg] WARNING: database encoding is ${dbEnc}, not UTF8. Real cNFT metadata may fail to store.\n` +
        `[pg] Fix: stop this, delete .runtime/pgdata, and restart (it re-inits as UTF8).`,
    );
  }
} catch {
  /* non-fatal */
}
await client.end();
console.log('[pg] schema loaded — READY on postgres://battler:battler@localhost:5432/battler');

const shutdown = async () => {
  try { await pg.stop(); } catch {}
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => {}, 1 << 30); // keep the server process alive
