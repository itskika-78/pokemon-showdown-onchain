#!/usr/bin/env node
/**
 * Create showdown-onchain-battle on Render via REST API.
 *
 * Usage:
 *   set RENDER_API_KEY=rnd_...   (Render Dashboard → Account Settings → API Keys)
 *   node scripts/deploy-render-service.mjs
 *
 * Reads env from .env.render (gitignored) or apps/web/.env.production.pull
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.render.com/v1';

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

function loadEnv() {
  const paths = [
    resolve(root, '.env.render'),
    resolve(root, 'apps/web/.env.production.pull'),
  ].filter((p) => existsSync(p));
  const env = {};
  for (const p of paths) Object.assign(env, parseEnv(readFileSync(p, 'utf8')));
  return env;
}

const apiKey = process.env.RENDER_API_KEY?.trim();
if (!apiKey) {
  console.error('Missing RENDER_API_KEY. Get one at https://dashboard.render.com/u/settings#api-keys');
  process.exit(1);
}

const env = loadEnv();
const required = ['DATABASE_URL', 'JWT_SECRET', 'LOG_SIGNING_SECRET', 'HELIUS_RPC_URL', 'HELIUS_DEVNET_RPC_URL', 'TREASURY_WALLET'];
const missing = required.filter((k) => !env[k]?.trim());
if (missing.length) {
  console.error('Missing env keys in .env.render:', missing.join(', '));
  console.error('Create .env.render from apps/web env pull + DATABASE_URL from Vercel dashboard.');
  process.exit(1);
}

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(opts.headers ?? {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${opts.method ?? 'GET'} ${path} → ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

const SERVICE_NAME = 'showdown-onchain-battle';
const REPO = 'https://github.com/itskika-78/pokemon-showdown-onchain';

async function main() {
  const owners = await api('/owners?limit=20');
  const owner = owners?.[0]?.owner ?? owners?.[0];
  const ownerId = owner?.id;
  if (!ownerId) throw new Error('Could not resolve Render owner id');

  const existing = await api(`/services?limit=100&name=${SERVICE_NAME}`);
  const found = (existing ?? []).find((row) => row?.service?.name === SERVICE_NAME || row?.name === SERVICE_NAME);
  if (found?.service?.id || found?.id) {
    const id = found.service?.id ?? found.id;
    console.log(`Service already exists (${id}). Triggering deploy…`);
    await api(`/services/${id}/deploys`, { method: 'POST', body: JSON.stringify({ clearCache: false }) });
    console.log(`https://${SERVICE_NAME}.onrender.com`);
    return;
  }

  const envVars = [
    { key: 'NODE_ENV', value: 'production' },
    { key: 'FORCE_REDIS', value: '0' },
    { key: 'WEB_ORIGIN', value: 'https://pokemon-showdown-onchain.vercel.app' },
    { key: 'DAS_MODE', value: 'devnet' },
    {
      key: 'PHYGITALS_COLLECTION_MINTS',
      value: env.PHYGITALS_COLLECTION_MINTS || 'BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM',
    },
    { key: 'DATABASE_URL', value: env.DATABASE_URL },
    { key: 'JWT_SECRET', value: env.JWT_SECRET },
    { key: 'LOG_SIGNING_SECRET', value: env.LOG_SIGNING_SECRET },
    { key: 'HELIUS_RPC_URL', value: env.HELIUS_RPC_URL },
    { key: 'HELIUS_DEVNET_RPC_URL', value: env.HELIUS_DEVNET_RPC_URL },
    { key: 'TREASURY_WALLET', value: env.TREASURY_WALLET },
  ];
  if (env.REDIS_URL?.trim()) envVars.push({ key: 'REDIS_URL', value: env.REDIS_URL });

  const payload = {
    type: 'web_service',
    name: SERVICE_NAME,
    ownerId,
    repo: REPO,
    branch: 'main',
    autoDeploy: 'yes',
    buildCommand:
      'corepack enable && corepack prepare pnpm@11.1.3 --activate && pnpm install',
    startCommand: 'pnpm --filter @battler/battle-service start',
    healthCheckPath: '/health',
    plan: 'free',
    region: 'oregon',
    envVars,
  };

  const created = await api('/services', { method: 'POST', body: JSON.stringify(payload) });
  const svc = created?.service ?? created;
  console.log('Created service:', svc?.id ?? created);
  console.log(`URL: https://${SERVICE_NAME}.onrender.com`);
  console.log('First deploy may take ~5–10 minutes on free tier.');
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
