# Production deployment (Vercel + separate realtime service)

This app is **two runtime processes plus two stateful stores**. Vercel hosts the
Next.js front end; the realtime battle service must run somewhere that supports a
**long-lived WebSocket process** (Vercel's serverless functions cannot).

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│  Vercel  (apps/web)     │  HTTP  │  Managed Postgres (pooled)   │
│  Next.js 14 + API routes├───────▶│  Neon / Supabase / RDS+PgB.  │
│  SIWS auth, market, etc.│        └──────────────────────────────┘
└───────────┬─────────────┘        ┌──────────────────────────────┐
            │ Socket.IO (wss)      │  Upstash Redis (or any Redis) │
            ▼                      └──────────────────────────────┘
┌─────────────────────────┐                ▲           ▲
│  battle-service          │  pg + redis    │           │
│  Render / Railway / Fly  ├────────────────┴───────────┘
│  Socket.IO + matchmaking │
└─────────────────────────┘
```

## Why the battle service is NOT on Vercel

`apps/battle-service` is a single long-running Node process that holds **in-memory
battle-room state**, runs a **1s matchmaker loop**, keeps **open Socket.IO
connections**, and uses the **Socket.IO Redis adapter**. Vercel functions are
ephemeral and per-request — none of that survives. Deploy it to a platform with a
persistent process: **Render, Railway, Fly.io, a VPS, or any container host**
(a `Dockerfile` is included).

---

## 1. Provision the stores

- **Postgres 16** — Neon or Supabase (both give a **pooled** connection string).
  Use the pooled/PgBouncer URL as `DATABASE_URL`. Load `db/schema.sql` once.
- **Redis** — Upstash (or any Redis 7). Used for SIWS nonces, rate limiting,
  matchmaking queue, and the Socket.IO adapter.

## 2. Deploy the Next.js app to Vercel

- **Root Directory:** `apps/web` (Vercel auto-detects the pnpm workspace and
  installs from the repo root). `apps/web/vercel.json` pins the framework/build.
- Set **Environment Variables** (Production):

  | Var | Example / note |
  | --- | --- |
  | `NODE_ENV` | `production` (Vercel sets this) |
  | `JWT_SECRET` | strong random 32+ chars — **must match the battle service** |
  | `DATABASE_URL` | pooled Postgres URL |
  | `REDIS_URL` | Upstash Redis URL (`rediss://…`) |
  | `PG_POOL_MAX` | `1`–`3` (serverless — keep small) |
  | `USE_MOCK_DAS` | `false` for real cNFTs |
  | `HELIUS_RPC_URL` | mainnet Helius DAS URL (with `?api-key=`) |
  | `HELIUS_DEVNET_RPC_URL` | devnet Helius DAS URL |
  | `PHYGITALS_COLLECTION_MINTS` | `BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM` |
  | `TREASURY_WALLET` | `21vUy4XiTRGhrRF7EwaagRHspvk6zQzzfWahuPXpTwEo` |
  | `SIWS_DOMAIN` / `SIWS_URI` | your production domain / URL |
  | `HELIUS_WEBHOOK_SECRET` | shared secret for the `/webhooks/helius` endpoint |
  | `NEXT_PUBLIC_WS_URL` | **the battle-service public URL** (e.g. `https://battle.yourapp.com`) |
  | `NEXT_PUBLIC_HELIUS_RPC_URL` | public RPC for the wallet/client |
  | `NEXT_PUBLIC_SOLANA_CLUSTER` | `mainnet-beta` |
  | `NEXT_PUBLIC_TREASURY_WALLET` | same treasury address |

  `NEXT_PUBLIC_*` are build-time — set them before the build.

## 3. Deploy the battle service (separate host)

- Build the image from the repo root `Dockerfile` (set the service command to
  `pnpm --filter @battler/battle-service start`), or run `pnpm install` +
  `pnpm --filter @battler/battle-service start` on the host. Expose port `3001`.
- Set env: `JWT_SECRET` (identical to web), `DATABASE_URL`, `REDIS_URL`,
  `FORCE_REDIS=1`, `WEB_ORIGIN=https://yourapp.com` (CORS), `TREASURY_WALLET`,
  Helius URLs, and `ESCROW_SECRET_KEY` (base58 or JSON array) for on-chain wagers.
- Point `NEXT_PUBLIC_WS_URL` (in Vercel) at this service's public HTTPS URL.

## 4. Post-deploy checks

- `GET https://yourapp.com/api/health` → `{ ok: true, postgres: true, redis: true }`
- `GET https://battle.yourapp.com/health` → `{ status: "ok" }`
- Connect a wallet → SIWS → `/collection` loads.
- Security headers present (CSP, HSTS, X-Frame-Options) — see `next.config.mjs`.

## Security / ops notes

- **Secrets** live only in the host's env (never committed). The escrow hot
  wallet key is custodial — for real mainnet volume move it to a KMS/HSM and
  migrate settlement to a trustless on-chain program behind the existing
  `SettlementProvider` seam.
- **Rate limiting** is Redis-backed (`rl:*` keys), so it holds across all Vercel
  instances. For lowest serverless latency you may later swap to Upstash's REST
  client.
- **`/webhooks/helius`** requires the `HELIUS_WEBHOOK_SECRET` (Authorization
  header) when set — configure the same secret in your Helius webhook.
