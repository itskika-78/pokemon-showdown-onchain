# PHASE_COMPLETE — Pokémon cNFT Battler

Ground truth wired in: Phygitals collection `BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM`,
real card-name pattern `"{YEAR} {Pokemon} {Set} #{num}"`, multi-key attribute schema,
Helius DAS `V1_NFT` / `compression.compressed = true`.

**54 tests passing across 6 packages. 8 packages + battle-service typecheck clean.**

---

## ✅ Phase 1 — Monorepo + config + datastores
- pnpm workspace: `packages/{core,card-parser,battle-engine,das,server-kit,settlement,repositories,ingest}` + `apps/{web,battle-service}`.
- `packages/server-kit` — **zod env validation** (`loadServerConfig`, crash-fast), pg pool + `withTransaction`, ioredis, pino, prom-client, JWT, SIWS verify, ECDSA/HMAC log signing.
- `db/schema.sql` — users, assets, battle_profiles, teams, challenges, matches, ledger_entries, staked_cards, anti_cheat_flags (+ platform treasury seed).
- `docker-compose.yml` — postgres:16 + redis:7 (+ healthchecks/volume) **+ web + battle-service** services; single `Dockerfile` + `.dockerignore`. `docker compose up` boots the whole stack.
- Default `PHYGITALS_COLLECTION_MINTS=BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM`.

## ✅ Phase 2 — SIWS auth
- `siws.ts` `buildSiwsMessage` / `verifySiws` (tweetnacl + bs58), `jwt.ts` HS256 sessions — **7 server-kit tests** (incl. prod JWT crash-fast, sign/verify, tamper rejection).
- `apps/web`: wallet-adapter providers (Phantom/Solflare/Backpack), `/api/auth/nonce` (single-use Redis nonce, 5min TTL) + `/api/auth/verify` (HttpOnly JWT cookie + bearer), SIWS sign-in button.

## ✅ Phase 3 — DAS fetch + caching (`packages/das`, `packages/ingest`)
- `HeliusDasProvider` — paginated `getAssetsByOwner` (loop until <1000), `getAsset`. `MockDasProvider` (no key needed; fixtures minted under the real collection).
- `extractAttributes` — **multi-key fallback** (Grade/PSA Grade…, Grading Company/Grader…, Set/Edition…, etc.) + **name-string fallback** for year/cardNumber. Captures Grade, Grading Company, Set, Card Number, Rarity, Year, Language, Cert #.
- `filterSupportedCollections` — requires `compression.compressed === true && !burnt && collection ∈ SUPPORTED`.
- `ingest.syncOwnerAssets` — fetch → filter → cache assets → derive+persist profiles; metadata refetched only if >24h; ownership always refreshed. **5 das tests** (incl. real Camerupt card).

## ✅ Phase 4 — Card parser (`packages/card-parser`) — GATE
- `normalizeCardName` strip pipeline + alias table + Fuse.js fuzzy + **prefix-shrinking** (handles `{Pokemon} {Set}` real names) + **generic-set-card** detection.
- **20 tests pass incl. all 16 gated cases**: `2023 Camerupt Obsidian Flames #148/197 → camerupt`, `Charizard VMAX … → charizard/VMAX`, `Alolan Raichu → raichualola`, `Galarian Rapidash V → rapidashgalar`, `Mr. Mime → mrmime`, `Nidoran → nidoranf`, `2024 Pokemon Japanese SV Terasta → unplayable (generic_set_card)`, …

## ✅ Phase 5 — Deterministic derivation (`packages/battle-engine`) — GATE
- `Prando(assetId)` seeded; level = `base(rarity)+grade+tier+vintage+ownerPrefix` (exact constants). Seeded IVs (grade floor), legal EVs (≤252/≤508), nature, ability, learnset moves.
- `TeamValidator('gen9customgame')` validation with repair → **guaranteed-legal fallback** (never throws for a real species). National-Dex species supported (Camerupt etc.).
- **15 tests**: determinism (identical profile per asset ID), power curve, IV floor, sim-legality, EV legality.

## ✅ Phase 7 — Battle engine + vs-bot (`packages/battle-engine`) — GATE
- `BattleRoomEngine` (BattleStream wrapper, per-side protocol routing, force-win/tie) + `RandomBotAI` + `runBotBattle`.
- **1 test**: full 6v6 bot battle runs to a winner, 0 sim errors, every protocol line parses.

## ✅ Phase 9 — Settlement (`packages/settlement`)
- `computeSettlement` double-entry (loser −stake, winner +stake−fee, treasury +fee), 2.5% fee, card transfer. `LedgerSettlementService` (idempotent by match_id) over `InMemoryLedgerStore` / `PgLedgerStore`. **6 tests**.

## ✅ Phase 6/8 — Battle service (`apps/battle-service`) — typecheck clean
- Socket.IO + Redis adapter, JWT socket auth, matchmaking (Redis ZSET + bot fallback), `BattleRoom` (choice validation, 1-move/turn, per-turn timer, reconnect window, forfeit), settlement on end, `/health`, `/metrics`, Helius webhook. **Runtime-verify pending (needs Redis+PG).**

## ✅ Phase 10 — hardening (wired)
- Signed+hashed battle logs (`signLogHash`), Helius webhook → `flagForReverify`, ownership reverify at match start, anti-cheat flags + auto-suspend. **Rate-limit/sanitize (web) + load test + security checklist pending.**

## ✅ Phase 6 — Team builder UI (`apps/web`)
- `/collection` — flip cards (front: card image; back: `@pkmn/img` sprite + level/ability/nature/moves).
- `/team` — pick ≤6 playable cards; server-side validation (owned, playable, has profile); `/battle` Socket.IO view with live protocol + move/switch buttons.
- API: `/api/game/assets` (sync + profiles), `/api/game/team` GET/PUT, `/api/game/faucet` (dev), `/api/challenge`, `/api/match/:id/verify`. Rate-limit + input sanitization wired.

---

## Verification (all green)
- `pnpm test` → **54 tests / 6 files passing**.
- Typecheck clean: **8 packages + apps/web + apps/battle-service**.
- `pnpm demo:pipeline` → real Camerupt/Charizard/… cards derive correctly with full rationale.
- `pnpm demo:battle` → full 6v6 bot battle to a winner, 0 sim errors.
- Docs: `README.md`, `EVENTS.md`, `docs/{PHYGITALS-DISCOVERY,RISKS,SECURITY-CHECKLIST}.md`, `scripts/loadtest.ts`.

## Runtime-verify still requires live infra (can't run here)
- Socket.IO PvP, matchmaking, settlement, webhooks, `/health`, `/metrics`, load test → need Postgres + Redis + the service running (`docker compose up`). All typecheck-clean and wired; not exercised against live datastores in this environment.
