# Socket.IO Event Catalog (battle-service, port 3001)

All connections require a valid session JWT in `socket.handshake.auth.token`
(issued by `POST /api/auth/verify`). The server pins the wallet pubkey onto the
socket — clients never assert their own identity. On connect, each socket joins a
private room `user:<pubkey>` for targeted server pushes.

The server is authoritative: clients send **choices/intents only**, never game
state. Every choice is validated against the sim's current `|request|`.

## Client → Server

| Event | Payload | When / behavior |
|-------|---------|-----------------|
| `queue:join` | `{ teamAssetIds: string[] }` | Enter matchmaking. Team is stashed in Redis; pubkey added to the `matchmaking_queue` sorted set (score = join time). |
| `queue:leave` | — | Remove from the queue. |
| `battle:join` | `{ roomId }` | Join a matched room; server replays your side's protocol + current request (reconnect-safe). |
| `battle:reconnect` | `{ roomId }` | Re-attach a dropped socket within the 30s window and resume. |
| `battle:choice` | `{ roomId, choice }` | `choice ∈ {move 1..4, switch 1..6, pass, default}`. Validated vs current request; one accepted choice per turn. |
| `negotiation:propose` | `{ challengeId, wager }` | Counter-offer; resets both acceptances → `COUNTERED`. |
| `negotiation:accept` | `{ challengeId }` | Accept current terms; when both accept → `ACCEPTED` → battle locks. |
| `negotiation:reject` | `{ challengeId }` | Reject → `REJECTED`. |

`wager` = `{ type: 'none' } | { type: 'crypto', amount } | { type: 'card', assetId }`.

## Server → Client

| Event | Payload | When |
|-------|---------|------|
| `queue:waiting` | `{ since }` | Acknowledged into the queue. |
| `battle:matched` | `{ roomId, opponent, wager }` | Paired (PvP or bot after 5s). Client should emit `battle:join`. |
| `battle:protocol` | `{ roomId, lines: string[] }` | Raw Showdown protocol for *your* side (public + your private lines). |
| `battle:request` | `{ roomId, request }` | The sim asks you to choose (move/switch); render buttons from this. |
| `battle:turn` | `{ roomId, turn, deadline }` | New turn + 60s deadline (epoch ms). |
| `battle:end` | `{ roomId, winner, reason }` | Battle over (`normal`/`tie`/timeout/forfeit). Settlement has run. |
| `battle:error` | `{ roomId?, message }` | Invalid choice, ownership-check failure, etc. |
| `negotiation:update` | `{ challengeId, status, wager, challengerAccepted, challengeeAccepted }` | Negotiation state changed. |
| `negotiation:locked` | `{ challengeId, roomId, wager, startsAt }` | Both accepted; terms frozen; battle room created. |

## Anti-cheat enforced on the server
- **Choice validation** — only moves/switches present in the current `|request|` are accepted.
- **One choice per turn** — a 2nd submission is ignored with a warning; the 3rd flags `double_move`.
- **Per-turn timer** (60s) — the slow side auto-forfeits; both-idle → tie.
- **Reconnect window** (30s) — room held open; otherwise the dropped side forfeits (`disconnect_forfeit_pattern`).
- **Ownership re-verify** — every team card is re-checked via DAS `getAsset` at match start.
- 3+ flags of one type in 24h → `users.suspended = true`.

## HTTP endpoints (battle-service)
- `GET /health` → `{ status, uptime, redis, postgres }`
- `GET /metrics` → Prometheus (`active_battles`, `matches_completed_total`, `wager_volume_total`, `auth_failures_total`).
- `POST /webhooks/helius` → on a cNFT transfer, flags matching `asset_id`s for ownership re-verification.
