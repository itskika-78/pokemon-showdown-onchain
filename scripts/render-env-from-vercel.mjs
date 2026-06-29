#!/usr/bin/env node
/**
 * Print Render blueprint env values (paste into Render "Specified configurations").
 * Run from repo root after: cd apps/web && npx vercel env pull ../../.env.render --environment production --yes
 *
 * DATABASE_URL is Sensitive on Vercel — copy from Vercel dashboard or Neon if missing below.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env.render');
const pullPath = resolve(root, 'apps/web/.env.production.pull');

function parseEnv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const key = t.slice(0, i);
    let val = t.slice(i + 1);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const sources = [envPath, pullPath].filter((p) => existsSync(p));
const env = {};
for (const p of sources) Object.assign(env, parseEnv(readFileSync(p, 'utf8')));

const fields = {
  DATABASE_URL: env.DATABASE_URL || '(copy from Vercel → Settings → DATABASE_URL → reveal)',
  JWT_SECRET: env.JWT_SECRET,
  LOG_SIGNING_SECRET: env.LOG_SIGNING_SECRET,
  HELIUS_RPC_URL: env.HELIUS_RPC_URL,
  HELIUS_DEVNET_RPC_URL: env.HELIUS_DEVNET_RPC_URL,
  TREASURY_WALLET: env.TREASURY_WALLET,
  REDIS_URL: env.REDIS_URL || '(optional — leave blank for single-instance mode)',
};

console.log('Render blueprint — paste these into "Specified configurations":\n');
for (const [k, v] of Object.entries(fields)) {
  console.log(`${k}:`);
  console.log(v || '(missing — set on Vercel or Neon first)');
  console.log('');
}

console.log('After deploy succeeds, set on Vercel (Production):');
console.log('BATTLE_WS_PUBLIC_URL=https://showdown-onchain-battle.onrender.com');
console.log('');
console.log('Verify: curl https://showdown-onchain-battle.onrender.com/health');
console.log('Expect JSON with status/uptime/redis/postgres — NOT {"success":true} (wrong app).');
