# Security checklist

Annotated against the Solana Foundation `solana-dev-skill` Security Checklist,
split into **what applies to this app-first MVP** vs **the future smart-contract
(escrow) phase**.

## Applies now (app / off-chain)

### Auth & sessions
- [x] **SIWS** — server-issued single-use nonce (Redis, 5min TTL), ed25519 verify (tweetnacl+bs58),
      nonce deleted on use (replay prevention).
- [x] **JWT** HS256, 24h, HttpOnly+SameSite cookie; pubkey never trusted from the client.
- [x] Strong `JWT_SECRET` **required in production** (zod config crashes on the dev default).

### Server authority & anti-cheat
- [x] All game logic server-side; clients send only choices.
- [x] Choice validation against the sim's current `|request|`; one choice per turn.
- [x] Per-turn timer + reconnect window + auto-forfeit; idempotent settlement (by `match_id`).
- [x] Anti-cheat flags table + auto-suspend (3 same-type flags / 24h).
- [x] **Ownership re-verify** (DAS `getAsset`) at match start and settlement; void on mismatch/frozen.
- [x] Signed + hashed battle logs; public verify endpoint.

### Input handling & DB
- [x] **Parameterized SQL only** (pg; no string interpolation, no ORM).
- [x] Input validation: base58 pubkey/asset-id checks, wager shape validation, text sanitization.
- [x] Settlement writes in a single Postgres transaction (`withTransaction`, `SELECT … FOR UPDATE`).
- [x] Rate limiting (global + stricter on `/api/auth/*`).

### Ops
- [x] zod env validation (crash-fast). Secrets via env, never committed.
- [x] Structured logging (pino); Prometheus `/metrics`; `/health` (redis+postgres).
- [ ] TODO: move rate-limit + per-turn move flag to Redis for horizontal scale.
- [ ] TODO: independent dependency audit; CSP headers; DOMPurify on any rendered user text.

## Future phase (on-chain escrow — NOT in MVP)
Maps to the `solana-dev-skill` checklist items that only matter once funds are on-chain:
- [ ] **Signer checks** — verify the expected authority signs payout/settlement instructions.
- [ ] **Account validation** — owner/PDA/seeds checks; no account substitution.
- [ ] **Arithmetic** — checked math on stakes/fees; no overflow.
- [ ] **Oracle** — server-signed result is the trusted input; keep signed logs for disputes.
- [ ] **Idempotency / double-spend** — escrow settlement keyed so reconnect retries can't double-pay.
- [ ] **Testing pyramid** — LiteSVM/Mollusk unit tests, Surfpool mainnet-fork integration.
- [ ] **Independent audit** before mainnet money; KYC/AML + geo-gating (see RISKS.md).

The `SettlementProvider` interface is the single seam: swapping `LedgerSettlementService` for an
on-chain escrow client requires **no changes** to battle/matchmaking code.
