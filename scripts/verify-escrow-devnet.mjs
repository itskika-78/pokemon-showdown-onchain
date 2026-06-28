// Devnet end-to-end proof of the custodial SOL escrow:
//   2 players airdrop devnet SOL → each deposits a stake to the escrow →
//   verify deposits on-chain → settle → escrow pays winner (pot−fee) + fee→treasury.
// Proves real SOL moves on devnet, and that settle is idempotent.
import { readFileSync } from 'node:fs';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  verifySolTransfer,
  payoutFromEscrow,
  OnChainSettlementService,
  InMemoryEscrowStore,
} from '@battler/settlement';

const ENV = Object.fromEntries(
  readFileSync('D:/Pokemon Battler/.env', 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const RPC = ENV.HELIUS_DEVNET_RPC_URL || 'https://api.devnet.solana.com';
const TREASURY = new PublicKey(ENV.TREASURY_WALLET);
const escrow = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync('D:/Pokemon Battler/.runtime/escrow-devnet.json', 'utf8'))));
const conn = new Connection(RPC, 'confirmed');
const STAKE = 0.02 * LAMPORTS_PER_SOL;
const fail = (m) => { console.error('FAIL:', m); process.exit(1); };
const sol = (l) => (l / LAMPORTS_PER_SOL).toFixed(4);

async function airdrop(pubkey, lamports, label) {
  const sig = await conn.requestAirdrop(pubkey, lamports);
  const bh = await conn.getLatestBlockhash('confirmed');
  await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
  console.log(`  airdropped ${sol(lamports)} SOL → ${label}`);
}

async function transfer(from, to, lamports) {
  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports }));
  const bh = await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = bh.blockhash; tx.feePayer = from.publicKey; tx.sign(from);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
  return sig;
}

console.log('RPC:', RPC.replace(/api-key=.*/, 'api-key=***'));
console.log('escrow:', escrow.publicKey.toBase58(), '| treasury:', TREASURY.toBase58());

const p1 = Keypair.generate();
const p2 = Keypair.generate();
console.log('players: p1', p1.publicKey.toBase58().slice(0, 8), 'p2', p2.publicKey.toBase58().slice(0, 8));

// 1) fund the two players. Prefer funding FROM the escrow (works without the
//    faucet — just top the escrow up once from your treasury); else try airdrops.
console.log('1) funding players…');
const escrowBal = await conn.getBalance(escrow.publicKey);
const NEED = 0.06 * LAMPORTS_PER_SOL;
if (escrowBal >= NEED * 2 + 0.02 * LAMPORTS_PER_SOL) {
  console.log(`  escrow has ${sol(escrowBal)} SOL — funding players from escrow (no faucet needed)`);
  await transfer(escrow, p1.publicKey, NEED);
  await transfer(escrow, p2.publicKey, NEED);
} else {
  console.log(`  escrow has ${sol(escrowBal)} SOL — trying the devnet faucet…`);
  await airdrop(p1.publicKey, 0.1 * LAMPORTS_PER_SOL, 'p1').catch((e) => fail('airdrop p1: ' + e.message + '\n  → Fund the escrow ' + escrow.publicKey.toBase58() + ' with ~0.3 devnet SOL from your treasury, then re-run.'));
  await airdrop(p2.publicKey, 0.1 * LAMPORTS_PER_SOL, 'p2').catch((e) => fail('airdrop p2: ' + e.message));
  await airdrop(escrow.publicKey, 0.05 * LAMPORTS_PER_SOL, 'escrow (fee buffer)').catch(() => {});
}

// 2) both players deposit their stake to escrow
console.log('2) deposits…');
const sig1 = await transfer(p1, escrow.publicKey, STAKE);
const sig2 = await transfer(p2, escrow.publicKey, STAKE);
console.log(`  p1 staked ${sol(STAKE)} (${sig1.slice(0, 8)}), p2 staked ${sol(STAKE)} (${sig2.slice(0, 8)})`);

// 3) verify deposits on-chain (server-side check)
const v1 = await verifySolTransfer(conn, { signature: sig1, from: p1.publicKey.toBase58(), to: escrow.publicKey.toBase58(), minLamports: STAKE });
const v2 = await verifySolTransfer(conn, { signature: sig2, from: p2.publicKey.toBase58(), to: escrow.publicKey.toBase58(), minLamports: STAKE });
if (!v1.ok) fail('verify p1: ' + v1.reason);
if (!v2.ok) fail('verify p2: ' + v2.reason);
console.log('3) deposits verified on-chain ✓');

// 4) settle: escrow → winner (pot−fee) + treasury (fee)
const store = new InMemoryEscrowStore();
await store.recordDeposit({ matchId: 'm1', pubkey: p1.publicKey.toBase58(), signature: sig1, lamports: v1.lamports });
await store.recordDeposit({ matchId: 'm1', pubkey: p2.publicKey.toBase58(), signature: sig2, lamports: v2.lamports });
const svc = new OnChainSettlementService({ connection: conn, escrow, treasury: TREASURY, feeBps: Number(ENV.PLATFORM_FEE_BPS || 250) }, store);

const treBefore = await conn.getBalance(TREASURY);
const winBefore = await conn.getBalance(p1.publicKey);
console.log('4) settling (winner = p1)…');
const out = await svc.settle({ matchId: 'm1', winner: p1.publicKey.toBase58(), loser: p2.publicKey.toBase58(), reason: 'normal' });
const treAfter = await conn.getBalance(TREASURY);
const winAfter = await conn.getBalance(p1.publicKey);

console.log(`   winner +${sol(winAfter - winBefore)} SOL | treasury fee +${sol(treAfter - treBefore)} SOL | feeTaken=${out.feeTaken}`);
if (winAfter <= winBefore) fail('winner balance did not increase');
if (treAfter <= treBefore) fail('treasury fee not received');

// 5) idempotency
const again = await svc.settle({ matchId: 'm1', winner: p1.publicKey.toBase58(), loser: p2.publicKey.toBase58(), reason: 'normal' });
if (!again.alreadySettled) fail('settle was not idempotent');
console.log('5) idempotent re-settle ✓ (no double-pay)');

console.log('PASS — real SOL escrow settled on devnet');
process.exit(0);
