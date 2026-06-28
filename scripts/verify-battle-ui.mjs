/**
 * Verifies the Showdown-style battle data path: login → set team → queue → bot
 * match → check the request is ENRICHED (move types) → play to completion and
 * confirm the protocol contains switch/move/faint lines the UI parses.
 */
import crypto from 'node:crypto';
import bs58 from 'bs58';
import jwt from 'jsonwebtoken';
import { io } from 'socket.io-client';

const WEB = 'http://localhost:3000';
const WS = 'http://localhost:3001';
const SECRET = process.env.JWT_SECRET ?? 'pokechain-dev-jwt-secret-2026-do-not-use-in-prod';

const { publicKey } = crypto.generateKeyPairSync('ed25519');
const pubkey = bs58.encode(Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url'));
const token = jwt.sign({ pubkey }, SECRET, { algorithm: 'HS256', expiresIn: 3600 });
const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

// seed assets + team via the web API
const assets = await (await fetch(`${WEB}/api/game/assets`, { headers: auth })).json();
const team = assets.cards.filter((c) => c.playable).slice(0, 6).map((c) => c.assetId);
await fetch(`${WEB}/api/game/team`, { method: 'PUT', headers: auth, body: JSON.stringify({ assetIds: team }) });
console.log('team set:', team.length, 'cards');

const socket = io(WS, { auth: { token }, transports: ['websocket'] });
let roomId = null;
let enriched = null;
const seen = new Set();
const start = Date.now();

const finish = (msg, code) => { console.log(msg); socket.disconnect(); process.exit(code); };
setTimeout(() => finish('TIMEOUT — battle did not finish', 1), 90_000);

const ts = () => `+${Date.now() - start}ms`;
let reqCount = 0, protoCount = 0;
socket.on('connect', () => { console.log(ts(), 'connected'); socket.emit('queue:join', { teamAssetIds: team }); });
socket.on('queue:waiting', () => console.log(ts(), 'queue:waiting'));
socket.on('battle:matched', (p) => { roomId = p.roomId; console.log(ts(), 'matched vs', p.opponent, 'room', p.roomId); socket.emit('battle:join', { roomId }); });
socket.on('battle:turn', (p) => console.log(ts(), 'battle:turn', p.turn));
socket.on('battle:protocol', (p) => { protoCount++; if (protoCount <= 3) console.log(ts(), 'protocol#' + protoCount, p.lines.length, 'lines, e.g.', p.lines.find(Boolean)); p.lines.forEach((l) => { const c = l.split('|')[1]; if (c) seen.add(c); }); });
socket.on('battle:request', (p) => {
  const req = p.request;
  reqCount++;
  console.log(ts(), `battle:request#${reqCount}`, 'keys:', Object.keys(req ?? {}).join(','), '| active?', Array.isArray(req?.active), '| forceSwitch?', !!req?.forceSwitch, '| wait?', !!req?.wait);
  if (enriched === null && Array.isArray(req?.active)) {
    const m = req.active[0]?.moves?.[0];
    enriched = !!(m && m.type);
    console.log('first move sample:', JSON.stringify(m));
    console.log('request enriched with move type:', enriched);
    console.log('my side id:', req?.side?.id, '| team size in request:', req?.side?.pokemon?.length);
  }
  // play a legal choice
  let choice = 'default';
  if (req?.teamPreview) {
    const n = req.side?.pokemon?.length ?? 6;
    choice = 'team ' + Array.from({ length: n }, (_, k) => k + 1).join('');
  } else if (Array.isArray(req?.forceSwitch) && req.forceSwitch.some(Boolean)) {
    const i = (req.side?.pokemon ?? []).findIndex((m) => m && !m.active && !/fnt/.test(m.condition ?? ''));
    choice = i >= 0 ? `switch ${i + 1}` : 'pass';
  } else if (Array.isArray(req?.active)) {
    const moves = (req.active[0]?.moves ?? []).filter((m) => !m.disabled && m.pp !== 0);
    choice = `move ${moves.length ? Math.floor(Math.random() * moves.length) + 1 : 1}`;
  } else return;
  if (roomId) socket.emit('battle:choice', { roomId, choice });
});
socket.on('battle:end', (p) => {
  const ms = Date.now() - start;
  console.log('battle:end →', JSON.stringify(p));
  console.log('protocol commands seen:', [...seen].filter((c) => ['switch', 'move', '-damage', 'faint', 'turn', 'win', 'tie'].includes(c)).join(', '));
  finish(`✅ DONE in ${ms}ms — enriched=${enriched}`, enriched ? 0 : 2);
});
socket.on('battle:error', (p) => console.log('battle:error', p.message));
socket.on('connect_error', (e) => finish('connect_error ' + e.message, 1));
