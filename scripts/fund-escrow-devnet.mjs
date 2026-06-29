#!/usr/bin/env node
/** Request devnet SOL airdrop to the escrow hot wallet (tx fees + optional refunds). */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const escrowPath = resolve(root, '.runtime/escrow-devnet.json');
if (!existsSync(escrowPath)) {
  console.error('Missing .runtime/escrow-devnet.json');
  process.exit(1);
}

function loadRpc() {
  for (const p of [resolve(root, '.env.render'), resolve(root, '.env')]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^HELIUS_DEVNET_RPC_URL=(.+)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  return 'https://api.devnet.solana.com';
}

const escrow = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(escrowPath, 'utf8'))));
const rpc = loadRpc();
const conn = new Connection(rpc, 'confirmed');
const SOL = 0.25;

async function main() {
  const before = await conn.getBalance(escrow.publicKey);
  console.log('escrow:', escrow.publicKey.toBase58());
  console.log('balance before:', (before / LAMPORTS_PER_SOL).toFixed(4), 'SOL');
  const sig = await conn.requestAirdrop(escrow.publicKey, Math.floor(SOL * LAMPORTS_PER_SOL));
  const bh = await conn.getLatestBlockhash('confirmed');
  await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
  const after = await conn.getBalance(escrow.publicKey);
  console.log('airdrop sig:', sig);
  console.log('balance after:', (after / LAMPORTS_PER_SOL).toFixed(4), 'SOL');
}

main().catch((e) => {
  console.error('airdrop failed:', e.message);
  console.error('Send ~0.25 devnet SOL manually to the escrow address above.');
  process.exit(1);
});
