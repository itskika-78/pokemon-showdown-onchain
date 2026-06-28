/**
 * Verifies the new Settings + Add-Card features against the running web app:
 * login → GET settings → add custom card → assets includes it → switch to
 * mainnet → switch back to mock.
 */
import crypto from 'node:crypto';
import bs58 from 'bs58';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const address = bs58.encode(Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url'));

const nonce = await (await fetch(`${BASE}/api/auth/nonce?pubkey=${address}`)).json();
const signature = bs58.encode(crypto.sign(null, Buffer.from(nonce.message, 'utf8'), privateKey));
const v = await (
  await fetch(`${BASE}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pubkey: address, message: nonce.message, signature }),
  })
).json();
const auth = { Authorization: `Bearer ${v.token}`, 'Content-Type': 'application/json' };
const j = (r) => r.json();

console.log('1) GET /api/settings');
console.log('   ', JSON.stringify(await j(await fetch(`${BASE}/api/settings`, { headers: auth }))));

console.log('2) add custom card "Gengar VMAX"');
const add = await j(
  await fetch(`${BASE}/api/game/mock-card`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: 'Gengar VMAX', rarity: 'Secret Rare', grade: '10', gradingCompany: 'PSA', year: '2021' }),
  }),
);
console.log('   ', JSON.stringify({ id: add.card?.assetId, species: add.speciesId, playable: add.playable }));

console.log('3) GET /api/game/assets (should include Gengar)');
const assets = await j(await fetch(`${BASE}/api/game/assets`, { headers: auth }));
const gengar = assets.cards.find((c) => c.cardName === 'Gengar VMAX');
console.log(`    total cards: ${assets.cards.length}; gengar present: ${!!gengar}; profile: ${gengar ? 'Lv' + (assets.profiles[gengar.assetId]?.level ?? '?') : 'n/a'}`);

console.log('4) PUT /api/settings → mainnet (mode only; RPC rejected if sent)');
const toMain = await fetch(`${BASE}/api/settings`, {
  method: 'PUT',
  headers: auth,
  body: JSON.stringify({ mode: 'mainnet' }),
});
console.log('   ', toMain.status, JSON.stringify(await j(toMain)));

const rejectRpc = await fetch(`${BASE}/api/settings`, {
  method: 'PUT',
  headers: auth,
  body: JSON.stringify({ mode: 'devnet', heliusRpcUrl: 'https://evil.example/?api-key=leak' }),
});
console.log('5) PUT with heliusRpcUrl rejected:', rejectRpc.status, JSON.stringify(await j(rejectRpc)));

console.log('6) PUT /api/settings → back to devnet');
const toDev = await fetch(`${BASE}/api/settings`, { method: 'PUT', headers: auth, body: JSON.stringify({ mode: 'devnet' }) });
console.log('   ', toDev.status, JSON.stringify(await j(toDev)));

console.log('7) cleanup: delete custom card');
const del = await fetch(`${BASE}/api/game/mock-card?assetId=${encodeURIComponent(add.card.assetId)}`, { method: 'DELETE', headers: auth });
console.log('   ', del.status);
