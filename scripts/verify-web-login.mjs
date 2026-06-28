/**
 * Replicates exactly what the browser does on "Sign In With Solana":
 * nonce → ed25519 sign → verify → GET /api/game/assets. Run from apps/web so
 * bs58 resolves. Proves the web auth + card-loading path end to end.
 */
import crypto from 'node:crypto';
import bs58 from 'bs58';

const BASE = process.env.BASE ?? 'http://localhost:3000';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const rawPub = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
const address = bs58.encode(rawPub);
console.log('test wallet:', address);

const nonce = await (await fetch(`${BASE}/api/auth/nonce?pubkey=${address}`)).json();
const message = nonce.message;
const signature = bs58.encode(crypto.sign(null, Buffer.from(message, 'utf8'), privateKey));

const vRes = await fetch(`${BASE}/api/auth/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pubkey: address, message, signature }),
});
const v = await vRes.json();
console.log('verify:', vRes.status, v.token ? 'token issued ✓' : JSON.stringify(v));
if (!v.token) process.exit(1);

const auth = { Authorization: `Bearer ${v.token}`, 'Content-Type': 'application/json' };
const a = await (await fetch(`${BASE}/api/game/assets`, { headers: auth })).json();
console.log(`\ncards: ${a.cards.length}  playable: ${a.cards.filter((c) => c.playable).length}`);
for (const c of a.cards) {
  const p = a.profiles[c.assetId];
  console.log(
    ` ${c.playable ? '✓' : '✗'} ${(c.speciesId ?? '(none)').padEnd(14)} ${p ? 'Lv' + p.level : '    '}  ${c.cardName}`,
  );
}

// team save
const pick = a.cards.filter((c) => c.playable).slice(0, 6).map((c) => c.assetId);
const tRes = await fetch(`${BASE}/api/game/team`, { method: 'PUT', headers: auth, body: JSON.stringify({ assetIds: pick }) });
const t = await tRes.json();
console.log(`\nsave team: ${tRes.status} ${tRes.ok ? '✓ saved ' + t.assetIds.length + ' cards' : JSON.stringify(t)}`);
const got = await (await fetch(`${BASE}/api/game/team`, { headers: auth })).json();
console.log(`get team: ${got.assetIds.length} cards persisted`);
