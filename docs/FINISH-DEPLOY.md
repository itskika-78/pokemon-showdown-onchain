# Finish the deploy — fix "backend offline"

The web app is **live** at https://pokemon-showdown-onchain.vercel.app and the
Helius RPC proxy works + the API key is hidden. The **"backend offline"** banner
means the app can't reach a **database** (and Redis). Everything else is already
configured on Vercel — you just need to add two connection strings from your own
free accounts, then redeploy.

`/api/health` currently returns `{"postgres":false,"redisMode":"memory"}`. The goal
is `{"ok":true,"postgres":true,"redis":true}`.

---

## Step 1 — Postgres (Neon, free) → fixes "backend offline"

1. Go to **https://neon.tech** → sign up → **Create project**.
2. After it's created, open **Connection Details** and copy the **Pooled** connection
   string (it contains `-pooler` in the host). It looks like:
   `postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require`
3. **Load the schema:** in Neon's **SQL Editor**, open the file `db/schema.sql` from
   this repo, copy its entire contents, paste into the editor, and click **Run**.
   (This creates the `users`, `friends`, `mock_cards`, etc. tables.)

## Step 2 — Redis (Upstash, free)

1. Go to **https://upstash.com** → sign up → **Create Database** (Redis).
2. Copy the **`rediss://...`** URL (the TLS one) from the database page.

## Step 3 — Add both to Vercel, then redeploy

1. Vercel → your **pokemon-showdown-onchain** project → **Settings → Environment
   Variables**.
2. Add two variables (target: **Production**, Preview, Development):
   - `DATABASE_URL` = your Neon **pooled** string from Step 1
   - `REDIS_URL` = your Upstash `rediss://` URL from Step 2
   - (optional, recommended) `PG_POOL_MAX` = `2`
3. **Deployments** tab → top deployment → **⋯ → Redeploy**.

## Step 4 — Verify

Open `https://pokemon-showdown-onchain.vercel.app/api/health` — it should now say:
```json
{"ok":true,"postgres":true,"redis":true,"redisMode":"redis"}
```
The "backend offline" banner disappears, and **login / collection / market /
friends** work. (Connect a Solana wallet → Sign In → /collection.)

---

## Step 5 — Live battles (optional, later) — battle-service on Render

Real-time 6v6 battles + wagers run on a separate long-lived server (Vercel can't
host WebSockets). Deploy `apps/battle-service`:

1. **https://render.com** → New → **Web Service** → connect this GitHub repo.
2. **Root Directory:** `apps/battle-service` · **Build:** `corepack enable && pnpm install`
   · **Start:** `pnpm --filter @battler/battle-service start`
3. Environment variables (must match Vercel):
   - `JWT_SECRET` = `f5543d5e5d9c19aa6477fb4acaf15bddba7fe51d4b105119a665828de98483a5`
   - `LOG_SIGNING_SECRET` = `57126c68c0c670f7a57573498d598039c491ef06fc19998077c394cfa46dcbc5`
   - `DATABASE_URL` = same Neon string · `REDIS_URL` = same Upstash URL
   - `FORCE_REDIS` = `1` · `WEB_ORIGIN` = `https://pokemon-showdown-onchain.vercel.app`
   - `TREASURY_WALLET` = `21vUy4XiTRGhrRF7EwaagRHspvk6zQzzfWahuPXpTwEo`
   - `HELIUS_DEVNET_RPC_URL` / `HELIUS_RPC_URL` = your Helius URLs (from `apps/web/.env.local`)
   - **`BATTLE_SERVICE_PORT`** = the port Render expects (Render injects `PORT`; set
     `BATTLE_SERVICE_PORT` to the same value Render shows, e.g. `10000`). ⚠️ The
     service reads `BATTLE_SERVICE_PORT`, not `PORT` — see "Known fix" below.
4. After it's live, copy the service URL, then in **Vercel** set
   `NEXT_PUBLIC_WS_URL` = that URL (e.g. `https://pokeshowdown-battle.onrender.com`)
   and **redeploy**.

### Known fix to apply in Cursor (so Render health checks pass)
`apps/battle-service` binds `BATTLE_SERVICE_PORT` (default 3001) but Render/Railway/Fly
inject `PORT`. Either set `BATTLE_SERVICE_PORT` to the host's port (quick), or make the
code prefer `PORT` (proper). In Cursor, change `packages/server-kit/src/config.ts` so
`battlePort` honors `PORT`:
```ts
// in config.ts, where battlePort is resolved:
battlePort: Number(process.env.PORT) || e.BATTLE_SERVICE_PORT,
```

---

## Cursor prompt (paste this to continue)

> The Next.js app is deployed on Vercel (project `pokemon-showdown-onchain`, Root
> Directory `apps/web`) and live, but `/api/health` returns `postgres:false`
> ("backend offline"). I've created a Neon Postgres DB and an Upstash Redis DB.
> Help me: (1) load `db/schema.sql` into Neon, (2) confirm `DATABASE_URL` (pooled)
> and `REDIS_URL` are set in Vercel, (3) make `apps/battle-service` bind to
> `process.env.PORT` for Render by editing `battlePort` in
> `packages/server-kit/src/config.ts`, and (4) verify `/api/health` shows
> `postgres:true, redis:true`. The Helius key must stay server-side only (it's
> proxied via `apps/web/src/app/api/rpc/route.ts`) — never put it in a
> `NEXT_PUBLIC_` var.

---

## Reference — env vars already set on Vercel
`HELIUS_RPC_URL`, `HELIUS_DEVNET_RPC_URL`, `JWT_SECRET`, `LOG_SIGNING_SECRET`,
`TREASURY_WALLET`, `NEXT_PUBLIC_TREASURY_WALLET`, `PHYGITALS_COLLECTION_MINTS`,
`PLATFORM_FEE_BPS`, `USE_MOCK_DAS=true`, `NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_SOLANA_CLUSTER`, `NEXT_PUBLIC_SPRITE_HOST`, `NEXT_PUBLIC_ENABLE_POKEMON_ART`.
You only need to add **`DATABASE_URL`** and **`REDIS_URL`**.
