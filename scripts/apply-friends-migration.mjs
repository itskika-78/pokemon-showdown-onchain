// One-off: apply the username + friends schema additions to the running DB.
import pg from 'pg';

const url = process.env.DATABASE_URL || 'postgres://battler:battler@localhost:5432/battler';
const client = new pg.Client({ connectionString: url });

const ddl = [
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uq ON users (lower(username)) WHERE username IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS friends (
     owner_pubkey   TEXT NOT NULL,
     friend_pubkey  TEXT NOT NULL,
     created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     PRIMARY KEY (owner_pubkey, friend_pubkey)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_friends_owner ON friends(owner_pubkey)`,
];

try {
  await client.connect();
  for (const sql of ddl) {
    await client.query(sql);
    console.log('OK:', sql.split('\n')[0].trim().slice(0, 60));
  }
  console.log('migration complete');
} catch (e) {
  console.error('migration failed:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
