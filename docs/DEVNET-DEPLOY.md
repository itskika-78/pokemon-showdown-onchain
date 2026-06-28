# Hosting on Solana devnet

This is the read-side on-chain configuration: real Helius DAS reads against
**devnet** (or mainnet-beta), while wager *settlement* stays the off-chain
fake-credit ledger (on-chain escrow is the legally-gated deferred phase — see
[RISKS.md](RISKS.md)). The same Helius key works on both clusters; you only swap
the host.

## 1. Get a Helius key (the only way to read cNFTs)

Standard Solana RPC **cannot see compressed NFTs** — DAS is mandatory.

1. Create a free key at <https://helius.dev>.
2. Your two RPC URLs (same key, different host):
   - devnet:  `https://devnet.helius-rpc.com/?api-key=YOUR_KEY`
   - mainnet: `https://mainnet.helius-rpc.com/?api-key=YOUR_KEY`

## 2. Environment

Set these for **both** apps (`apps/web/.env.local` and the battle-service env).
The `JWT_SECRET` **must match** across the two services or sockets won't authenticate.

```bash
# Server-side
DATABASE_URL=postgres://battler:battler@localhost:5432/battler
REDIS_URL=redis://localhost:6379
JWT_SECRET=<one shared secret for web + battle-service>

# DAS — devnet read-side
USE_MOCK_DAS=false
HELIUS_DEVNET_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY   # optional, for mainnet
PHYGITALS_COLLECTION_MINTS=BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM

# Client-side wallet cluster (so Phantom/Solflare connect to devnet)
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
NEXT_PUBLIC_HELIUS_DEVNET_RPC_URL=https://api.devnet.solana.com
```

> Leave `PHYGITALS_COLLECTION_MINTS` **empty** on devnet if you want to see *any*
> cNFT a test wallet holds (the supported-collection filter is then a no-op).
> Keep it set to lock reads to the real Phygitals collection.

## 3. Pick the network at runtime (no restart)

The data source is also switchable from the **Settings** tab while running:
`mock` → `devnet` → `mainnet`. It persists in Redis (`settings:das`) and both the
web app and battle-service pick it up on the next request.

- **Test the connection first:** Settings → choose devnet/mainnet → **Test Helius
  connection**. It issues one real `getAssetsByOwner` and reports latency, so you
  confirm the key/host work *before* switching the live data source. A bad key or
  non-DAS endpoint surfaces a clear error instead of an empty collection.

## 4. Run

```bash
pnpm dev:postgres          # embedded PG on :5432 (or your own Postgres)
pnpm dev:redis             # optional — matchmaking falls back to in-memory KV
pnpm dev:server            # battle-service on :3001  (GET /health, /metrics)
pnpm dev:web               # Next.js on :3000
```

Health checks:
- `GET http://localhost:3001/health` → `{status:"ok", redis, postgres}`
- `GET http://localhost:3000/api/health` → `{ok, postgres, redis}`
- `GET http://localhost:3000/api/network` → `{mode, cluster, onChain}` (public)

## 5. Verify the on-chain read path

1. Put a Phygitals-collection cNFT (or, with an empty collection allow-list, any
   cNFT) on a devnet wallet.
2. Connect that wallet, **Sign In With Solana**, open **Collection**.
3. Pokémon-card cNFTs become battle-ready cards; everything else lands in the
   **Not supported** column (foreign NFTs / energy / trainer cards).

## Resilience notes

- `HeliusDasProvider` retries transient failures (HTTP 429 / 5xx / network /
  timeout) with exponential backoff + jitter, and a 12s per-call timeout, so a
  momentarily rate-limited RPC can't stall a wallet sync or a matchmaking
  ownership re-verify. Non-transient errors (401/403 bad key) fail fast.
- All RPC calls go through DAS `getAssetsByOwner` / `getAsset` only — the same
  two methods on devnet and mainnet.

## What is NOT on-chain yet (by design)

Wager settlement is an off-chain double-entry credit ledger. Real-SOL escrow /
custody is deferred behind the legal gate. See [RISKS.md](RISKS.md) §2.
