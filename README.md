# Pokémon cNFT Battler

A server-authoritative Pokémon Showdown–style battler where **your team is the
Pokémon card cNFTs in your Solana wallet** (Phygitals, collection
`BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM`). Each card deterministically
derives into a battle-ready Pokémon; you build a team of six and battle in real
time. Wagering ships as an off-chain fake-credit ledger behind a swappable
`SettlementProvider` (the seam for a future on-chain escrow program).

> ⚠️ Pokémon names/sprites are Nintendo/TPC IP (shown behind a dev flag only) and
> real-money wagering is regulated gambling. Both are **gating items, not
> afterthoughts** — see [docs/RISKS.md](docs/RISKS.md). The MVP uses fake credits.

---

## Architecture (pnpm monorepo)

```
packages/
  core          shared types (DAS, NormalizedCard, BattleProfile, wager/ledger, socket events)
  card-parser   normalizeCardName(): messy TCG name → Showdown species (alias + Fuse + prefix-shrink)
  battle-engine Prando-deterministic derivation + TeamValidator + BattleStream wrapper + RandomAI bot
  das           Helius DAS client (getAssetsByOwner/getAsset) + mock provider + attribute extraction
  server-kit    zod env config, pg, redis, JWT, SIWS verify, pino, prom-client, log signing
  settlement    double-entry ledger + 2.5% fee + idempotent LedgerSettlementService
  repositories  parameterized pg data access (users/assets/profiles/teams/matches/challenges/anti-cheat)
  ingest        DAS → parse → derive → persist pipeline + ownership re-verify
apps/
  web            Next.js 14 — wallet connect, SIWS, collection flip, team builder, battle view + API routes
  battle-service Node — Socket.IO PvP, matchmaking, battle rooms, settlement, /health, /metrics, webhooks
db/schema.sql    full Postgres schema (loaded on first container boot)
```

**Two principles:** the server computes *all* game logic (clients send only
choices); derivation is *deterministic* (same asset ID → same Pokémon, forever).

---

## Quick start

### 1. Prerequisites
- Node ≥ 20, pnpm ≥ 11, Docker (for Postgres + Redis).

### 2. Install
```bash
pnpm install
```

### 3. Configure
```bash
cp .env.example .env
# Dev works out of the box with USE_MOCK_DAS=true (no Helius key needed).
# For real wallets: set HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=... and USE_MOCK_DAS=false
```

### 4. Run the whole stack
```bash
docker compose up --build
# web            → http://localhost:3000
# battle-service → http://localhost:3001  (GET /health, GET /metrics)
# postgres :5432, redis :6379 (schema auto-loaded from db/schema.sql)
```

Or run the datastores in Docker and the apps locally:
```bash
docker compose up postgres redis -d
pnpm dev:server   # battle-service on :3001
pnpm dev:web      # Next.js on :3000
```

### 5. Try it
1. Open http://localhost:3000, connect a wallet (Phantom/Solflare/Backpack), **Sign In With Solana**.
2. **Collection** — with `USE_MOCK_DAS=true` you get a stable mock collection (incl. a real
   `2023 Camerupt Obsidian Flames #148/197`). Hover a card to flip it to its derived Pokémon.
3. **Team** — pick up to 6 playable cards, Save.
4. **Battle** — Find a match; if no human is queued you’re paired with a bot after 5s.

---

## Tests & typecheck

```bash
pnpm test         # 54 tests across 6 packages
pnpm typecheck    # all packages + apps (project references)
pnpm demo:battle  # headless 6v6 bot-vs-bot battle in the terminal
```

Gated suites (must stay green):
- **card-parser** — 16 named real-world cards normalize correctly (incl. Camerupt + generic-set rejection).
- **battle-engine/derivation** — determinism, power curve, sim-legality (`gen9customgame`).
- **battle-engine/battle** — a full 6v6 bot battle reaches a winner with zero sim errors.
- **settlement** — double-entry math, 2.5% fee, idempotency, card transfer.

---

## How a card becomes a Pokémon (the pipeline)

1. **DAS fetch** — `getAssetsByOwner` (paginated) → filter to compressed, non-burnt cards in the
   supported collection.
2. **Parse** — `normalizeCardName("2023 Camerupt Obsidian Flames #148/197")` → `camerupt` (+ tier,
   owner/rarity prefixes); `extractAttributes` reads grade/company/set/number/rarity/year/language/cert
   with multi-key fallbacks.
3. **Derive** — `Prando(assetId)` seeds level = `base(rarity) + grade + tier + vintage + ownerPrefix`,
   then IVs/EVs/nature/ability/moves from the legal learnset, validated by `TeamValidator`. Persisted to
   `battle_profiles` with a `derivation_version`.
4. **Battle** — `@pkmn/sim` `BattleStream` runs server-side; clients send only `move`/`switch` choices.

See [PHASE_COMPLETE.md](PHASE_COMPLETE.md) for the per-phase checklist, [EVENTS.md](EVENTS.md) for the
Socket.IO catalog, and [docs/](docs/) for discovery notes, risk register, and the security checklist.
