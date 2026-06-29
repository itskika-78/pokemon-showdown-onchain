<div align="center">

# Pokémon Showdown Onchain

**Turn the Pokémon card cNFTs in your Solana wallet into a real, server-authoritative 6v6 battler.**

Sign in with Solana · Build a team of six · Wager SOL in live PvP · Your cards never leave your custody until settlement.

<br />

[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![Solana](https://img.shields.io/badge/Solana-devnet%20%7C%20mainnet-9945FF?logo=solana&logoColor=white)](https://solana.com/)

[Live demo](https://pokemon-showdown-onchain.vercel.app) · [GitHub](https://github.com/itskika-78/pokemon-showdown-onchain) · [Deployment guide](docs/DEPLOYMENT.md) · [Security checklist](docs/SECURITY-CHECKLIST.md) · [Risk register](docs/RISKS.md)

</div>

---

## What is this?

**Pokémon Showdown Onchain** is a full-stack web app that reads **compressed NFT (cNFT) Pokémon cards** from your Solana wallet via [Helius DAS](https://docs.helius.dev/), deterministically derives each card into a battle-ready Pokémon, and runs **100% server-side** [Pokémon Showdown](https://github.com/smogon/pokemon-showdown) battles over WebSockets.

| You bring | The app does |
|-----------|--------------|
| A Solana wallet (Phantom, Solflare, …) | Sign-In With Solana (SIWS) + session JWT |
| Phygitals card cNFTs in a supported collection | DAS ingest → parse card name → derive stats/moves |
| A squad of six asset IDs | Team validation, ownership re-verify at match start |
| SOL for wagers (optional) | Matchmaking, escrow, settlement via battle-service |

**Supported collection (mainnet):** `BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM` (Phygitals)

> **Disclaimer:** Pokémon names and sprites are Nintendo/TPC intellectual property. They are gated behind `NEXT_PUBLIC_ENABLE_POKEMON_ART` for development. Real-money wagering may be regulated in your jurisdiction — see [docs/RISKS.md](docs/RISKS.md). This software is provided as-is under the [MIT License](LICENSE).

---

## Features

- **Wallet-native auth** — SIWS message signing, HttpOnly session cookie + bearer JWT
- **On-chain collection sync** — Helius `getAssetsByOwner` with Postgres cache and stale-metadata refresh
- **Deterministic derivation** — same `assetId` → same species, level, IVs, moves, forever (`Prando` + `derivation_version`)
- **Devnet & mainnet** — switch networks in **Settings** (persisted in Postgres across serverless instances)
- **Devnet marketplace** — limited-stock trending cards purchasable with devnet SOL
- **Mainnet mode** — shows cards you already own; buy links to Phygitals / Magic Eden
- **Real-time PvP** — Socket.IO battle rooms, turn timers, reconnect window, signed battle logs
- **Secure RPC** — browser wallet talks to `/api/rpc`; Helius API keys never reach the client bundle
- **16-bit editorial UI** — Next.js 14, Tailwind, Framer Motion, hand-tuned `globals.css`

---

## Architecture

```mermaid
flowchart TB
  subgraph client["Browser (apps/web)"]
    UI[Next.js App Router]
    Wallet[Wallet Adapter]
    UI --> Wallet
  end

  subgraph vercel["Vercel / Node"]
    API[API Routes — SIWS, assets, market, settings]
    RPC["/api/rpc proxy"]
    API --> PG[(Postgres)]
    API --> Redis[(Redis)]
    RPC --> Helius[Helius DAS / RPC]
  end

  subgraph realtime["battle-service :3001"]
    WS[Socket.IO]
    MM[Matchmaker]
    Sim["@pkmn/sim BattleStream"]
    WS --> MM --> Sim
    WS --> PG
    WS --> Redis
  end

  Wallet --> API
  Wallet --> RPC
  UI -->|wss| WS
  Helius --> API
```

### Monorepo layout

```
pokemon-cnft-battler/
├── apps/
│   ├── web/                 # Next.js 14 — UI, REST API routes, SIWS, marketplace
│   └── battle-service/      # Socket.IO — matchmaking, battles, settlement
├── packages/
│   ├── core/                # Shared domain types & socket events
│   ├── card-parser/         # TCG card name → Showdown species
│   ├── battle-engine/       # Derivation, TeamValidator, BattleStream, bot AI
│   ├── das/                 # Helius DAS provider + collection helpers
│   ├── ingest/              # DAS → parse → derive → persist pipeline
│   ├── repositories/        # Parameterized Postgres access layer
│   ├── server-kit/          # Env config (zod), pg, redis, JWT, SIWS, metrics
│   └── settlement/          # Ledger, fees, idempotent settlement
├── db/schema.sql            # Full Postgres schema (idempotent)
├── docker-compose.yml       # Postgres + Redis + web + battle-service
└── docs/                    # Deployment, security, risks, discovery notes
```

**Two design rules**

1. **Server authority** — clients send only battle choices (`move` / `switch`); the sim runs on the server.
2. **Deterministic cards** — derivation is seeded by `assetId`; bump `DERIVATION_VERSION` to invalidate cached profiles.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, Framer Motion |
| Wallet | `@solana/wallet-adapter-*`, Sign-In With Solana |
| Realtime | Socket.IO, dedicated `battle-service` process |
| Battle sim | `@pkmn/sim` (`gen9customgame`) |
| Chain data | Helius DAS + JSON-RPC (server-side only) |
| Database | PostgreSQL 16 (Neon / Docker / embedded dev) |
| Cache / queues | Redis 7 (Upstash / Docker / in-memory fallback on Vercel) |
| Auth | JWT sessions, SIWS signature verification |
| Package manager | pnpm 11 workspaces |

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Node.js** | ≥ 20 | LTS recommended |
| **pnpm** | ≥ 11 | `corepack enable && corepack prepare pnpm@11.1.3 --activate` |
| **Docker** | optional | Easiest way to run Postgres + Redis |
| **Helius API key** | optional for boot | Required for real wallet / cNFT sync — [helius.dev](https://helius.dev) |

---

## Run locally

### 1. Clone & install

```bash
git clone https://github.com/itskika-78/pokemon-showdown-onchain.git
cd pokemon-showdown-onchain
pnpm install
```

### 2. Environment

```bash
cp .env.example .env
```

Minimum for local development:

```env
# Required for real cNFT reads (get a free key at helius.dev)
HELIUS_API_KEY=your_key_here

# Datastores (defaults match Docker Compose)
DATABASE_URL=postgres://battler:battler@localhost:5432/battler
REDIS_URL=redis://localhost:6379

# Auth (change in production)
JWT_SECRET=dev-only-change-me-please
SIWS_DOMAIN=localhost:3000
SIWS_URI=http://localhost:3000

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=http://localhost:3001
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
```

See [.env.example](.env.example) for the full list (treasury wallet, Magic Eden, webhooks, etc.).

### 3. Start datastores

**Option A — Docker (recommended)**

```bash
docker compose up postgres redis -d
```

Schema loads automatically from `db/schema.sql` on first Postgres boot.

**Option B — Embedded Postgres (no Docker)**

```bash
# Terminal 1 — Postgres on :5432 (creates .runtime/pgdata, applies schema)
pnpm dev:postgres
```

```bash
# Terminal 2 — Redis
# Windows: pnpm dev:redis
# macOS/Linux: docker run -p 6379:6379 redis:7-alpine
#             — or install redis-server locally
```

**Apply / refresh schema manually** (Neon, existing DB):

```bash
DATABASE_URL="postgres://..." node scripts/apply-schema.mjs
```

### 4. Start the apps

```bash
# Terminal 3 — Next.js web app → http://localhost:3000
pnpm dev:web

# Terminal 4 — Battle service (WebSockets) → http://localhost:3001
pnpm dev:server
```

**Or run everything in Docker:**

```bash
docker compose up --build
# web            → http://localhost:3000
# battle-service → http://localhost:3001
```

### 5. Try it

1. Open **http://localhost:3000**
2. Connect **Phantom** or **Solflare** (set wallet to **Devnet** for testing)
3. **Sign in** — approve the SIWS message
4. **Settings** → pick **Devnet** or **Mainnet**
5. **Collection** → sync your wallet cards (or buy from **Market** / **Add card** on devnet)
6. **Team** → select six playable cards and save
7. **Battle** → queue a SOL wager match (requires battle-service + treasury/escrow config)

**Health checks**

```bash
curl http://localhost:3000/api/health
curl http://localhost:3001/health
```

---

## Development scripts

| Command | Description |
|---------|-------------|
| `pnpm dev:web` | Next.js dev server on port 3000 |
| `pnpm dev:server` | Battle service on port 3001 |
| `pnpm dev:postgres` | Embedded Postgres 16 + schema apply |
| `pnpm dev:redis` | Windows bundled Redis (see script) |
| `pnpm test` | Vitest — unit & integration tests |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm typecheck` | TypeScript project references + web app |
| `pnpm demo:battle` | Headless 6v6 bot-vs-bot in the terminal |
| `pnpm demo:pipeline` | End-to-end ingest/derive demo |
| `pnpm loadtest` | Socket load test against battle-service |

---

## How a card becomes a Pokémon

```
Wallet cNFT  →  Helius DAS  →  parse card name  →  derive battle profile  →  @pkmn/sim team
     │              │                  │                      │                      │
  assetId      raw metadata      species + tier         level/IVs/moves        server battle
```

1. **Ingest** — `getAssetsByOwner` (paginated); filter compressed cards in `PHYGITALS_COLLECTION_MINTS`
2. **Parse** — `normalizeCardName("2023 Camerupt Obsidian Flames #148/197")` → `camerupt`
3. **Derive** — `Prando(assetId)` seeds level, IVs, EVs, nature, ability, moves; validated by `TeamValidator`
4. **Persist** — `assets` + `battle_profiles` tables; re-derived when `DERIVATION_VERSION` changes
5. **Battle** — ownership re-verified at match start; full protocol log signed for disputes

Details: [PHASE_COMPLETE.md](PHASE_COMPLETE.md) · [docs/PHYGITALS-DISCOVERY.md](docs/PHYGITALS-DISCOVERY.md)

---

## Production deployment

The app is **two processes**:

| Component | Host | Why |
|-----------|------|-----|
| `apps/web` | **Vercel** (or any Node host) | Next.js + API routes |
| `apps/battle-service` | **Render / Railway / Fly / VPS** | Long-lived WebSockets + matchmaker |

Plus **managed Postgres** (Neon) and **Redis** (Upstash) for sessions, settings, matchmaking, and rate limits.

```bash
# Live frontend (example)
https://pokemon-showdown-onchain.vercel.app
```

Full checklist: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** · **[docs/FINISH-DEPLOY.md](docs/FINISH-DEPLOY.md)**

**Critical production env vars**

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Pooled Postgres (apply `db/schema.sql` once) |
| `REDIS_URL` | Shared state across Vercel instances |
| `JWT_SECRET` / `LOG_SIGNING_SECRET` | Strong random values (required in prod) |
| `HELIUS_API_KEY` | Server-only DAS + RPC proxy |
| `TREASURY_WALLET` | Devnet market + platform fees |
| `NEXT_PUBLIC_API_URL` | Your deployed site URL |
| `NEXT_PUBLIC_WS_URL` | Public battle-service WebSocket URL |
| `SIWS_DOMAIN` / `SIWS_URI` | Must match your production domain |

Helius keys are injected server-side via `/api/rpc` — they never ship in the browser bundle.

---

## Security

- SIWS with single-use Redis nonces (replay protection)
- Rate-limited API routes and RPC proxy (method allow-list)
- Helius credentials server-side only; masked in settings responses
- Signed battle logs (`GET /api/match/:id/verify`)
- Parameterized SQL throughout repositories

See **[docs/SECURITY-CHECKLIST.md](docs/SECURITY-CHECKLIST.md)** before going live.

---

## Testing

```bash
pnpm test
pnpm typecheck
```

Key gated suites:

- **card-parser** — real-world TCG names normalize to correct species
- **battle-engine** — derivation determinism, legality under `gen9customgame`
- **settlement** — double-entry ledger, platform fee, idempotency

---

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Vercel + battle-service + env vars |
| [docs/DEVNET-DEPLOY.md](docs/DEVNET-DEPLOY.md) | Devnet-specific configuration |
| [docs/RISKS.md](docs/RISKS.md) | IP, gambling, oracle trust |
| [docs/SECURITY-CHECKLIST.md](docs/SECURITY-CHECKLIST.md) | Pre-launch security review |
| [docs/PHYGITALS-DISCOVERY.md](docs/PHYGITALS-DISCOVERY.md) | Collection mint & trait notes |
| [EVENTS.md](EVENTS.md) | Socket.IO event catalog |

---

## Contributing

Contributions are welcome. Please:

1. Fork the repo and create a feature branch
2. Run `pnpm typecheck` and `pnpm test` before opening a PR
3. Keep changes focused — match existing code style and conventions
4. Do not commit secrets (`.env`, API keys, database passwords)

For large changes (new wager types, escrow programs, art swap), open an issue first.

---

## License

This project's **source code** is released under the **[MIT License](LICENSE)**.

**Third-party IP is not licensed here.** Pokémon, Phygitals, and other trademarks belong to their respective owners. You are responsible for compliance with applicable laws and third-party terms before deploying publicly.

---

<div align="center">

**Built on Solana · Powered by Pokémon Showdown · Cards stay in your wallet**

[⬆ back to top](#pokémon-showdown-onchain)

</div>
