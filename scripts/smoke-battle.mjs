// Smoke test: sync a mock owner's profiles, queue, get a bot match, play to end.
import { io } from 'socket.io-client';
import jwt from 'jsonwebtoken';

const SECRET = 'pokechain-dev-jwt-secret-2026-do-not-use-in-prod';
const OWNER = 'SmokeBattleTester1111111111111111111111111';
const WEB = 'http://localhost:3000';
const WS = 'http://localhost:3001';
const token = jwt.sign({ pubkey: OWNER }, SECRET, { algorithm: 'HS256', expiresIn: 3600 });

const fail = (m) => { console.error('FAIL:', m); process.exit(1); };
const timeout = setTimeout(() => fail('timed out (no battle:end in 45s)'), 45000);

// 1) sync assets → derive battle profiles
const res = await fetch(`${WEB}/api/game/assets`, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) fail(`assets sync HTTP ${res.status}`);
const { cards, profiles } = await res.json();
const playable = cards.filter((c) => c.playable && profiles[c.assetId]).map((c) => c.assetId);
console.log(`synced: ${cards.length} cards, ${playable.length} playable w/ profiles`);
if (playable.length < 1) fail('no playable cards with profiles');
const team = playable.slice(0, 6);

// 2) connect socket + queue
const socket = io(WS, { auth: { token }, transports: ['websocket'] });
let roomId = null;
let turns = 0;
let lastReq = null; // dedupe the attach-replayed request vs the live one

socket.on('connect', () => { console.log('socket connected'); socket.emit('queue:join', { teamAssetIds: team }); });
socket.on('connect_error', (e) => fail(`connect_error: ${e.message}`));
socket.on('queue:waiting', () => console.log('queued, waiting for opponent/bot…'));
socket.on('battle:matched', (p) => { roomId = p.roomId; console.log(`matched → room ${p.roomId}, opponent ${p.opponent}`); socket.emit('battle:join', { roomId: p.roomId }); });
socket.on('battle:request', (p) => {
  const sig = JSON.stringify(p.request);
  if (sig === lastReq) return; // ignore replayed/duplicate identical request
  lastReq = sig;
  turns++;
  socket.emit('battle:choice', { roomId: p.roomId, choice: 'default' });
});
socket.on('battle:error', (p) => console.log(`(warn) battle:error: ${p.message}`));
socket.on('battle:end', (p) => {
  clearTimeout(timeout);
  console.log(`battle:end → winner=${p.winner} reason=${p.reason} (after ${turns} requests)`);
  console.log('PASS');
  socket.close();
  process.exit(0);
});
