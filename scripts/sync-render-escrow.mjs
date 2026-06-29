#!/usr/bin/env node
/**
 * Set ESCROW_SECRET_KEY on the Render battle-service and trigger a redeploy.
 *
 * Usage (from repo root):
 *   set RENDER_API_KEY=rnd_...
 *   node scripts/sync-render-escrow.mjs
 *
 * Reads the devnet escrow keypair from:
 *   ESCROW_SECRET_KEY env, or .runtime/escrow-devnet.json (JSON byte array)
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Keypair } from '@solana/web3.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.render.com/v1';
const SERVICE_NAME = 'showdown-onchain-battle';

function loadEscrowSecret() {
  const env = process.env.ESCROW_SECRET_KEY?.trim();
  if (env) return env;
  const p = resolve(root, '.runtime/escrow-devnet.json');
  if (!existsSync(p)) {
    console.error('Missing ESCROW_SECRET_KEY and .runtime/escrow-devnet.json');
    process.exit(1);
  }
  return readFileSync(p, 'utf8').trim();
}

const apiKey = process.env.RENDER_API_KEY?.trim();
if (!apiKey) {
  console.error('Missing RENDER_API_KEY');
  process.exit(1);
}

const secret = loadEscrowSecret();
const pubkey = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(secret.startsWith('[') ? secret : readFileSync(resolve(root, '.runtime/escrow-devnet.json'), 'utf8'))),
).publicKey.toBase58();

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

async function main() {
  const list = await api(`/services?limit=100&name=${SERVICE_NAME}`);
  const row = (list ?? []).find((r) => r?.service?.name === SERVICE_NAME || r?.name === SERVICE_NAME);
  const serviceId = row?.service?.id ?? row?.id;
  if (!serviceId) throw new Error(`Service ${SERVICE_NAME} not found on Render`);

  const envVars = await api(`/services/${serviceId}/env-vars?limit=100`);
  const hadEscrow = (envVars ?? []).some((r) => (r?.envVar?.key ?? r?.key) === 'ESCROW_SECRET_KEY');

  await api(`/services/${serviceId}/env-vars/ESCROW_SECRET_KEY`, {
    method: 'PUT',
    body: JSON.stringify({ value: secret }),
  });
  console.log(hadEscrow ? 'Updated ESCROW_SECRET_KEY on Render' : 'Created ESCROW_SECRET_KEY on Render');

  await api(`/services/${serviceId}/deploys`, { method: 'POST', body: '{}' });
  console.log(`Escrow pubkey: ${pubkey}`);
  console.log(`Redeploy triggered → https://${SERVICE_NAME}.onrender.com`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
