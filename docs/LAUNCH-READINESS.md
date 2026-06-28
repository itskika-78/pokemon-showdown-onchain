# Launch readiness — on-chain status & security

Honest accounting of what is **real on-chain today**, what is the **off-chain
seam**, and what a **mainnet money launch still requires**. Pairs with
[DEVNET-DEPLOY.md](DEVNET-DEPLOY.md) and [RISKS.md](RISKS.md).

## Real on-chain today ✅

- **Wallet login** — Sign-In-With-Solana (ed25519 over a single-use nonce) → JWT session.
- **cNFT reads** — Helius DAS (`getAssetsByOwner`, `getAsset`, `getAssetsByGroup`) on
  devnet + mainnet. Verified live against a real Phygitals wallet.
- **Card → Pokémon derivation** — deterministic from real card metadata (rarity/grade/
  set/vintage → level, IVs/EVs/nature/moves/types).
- **Collection split** — every wallet cNFT, partitioned into battle-ready Pokémon vs the
  Not-supported column.
- **Marketplace = real roster** — live on-chain cards in the supported collection via DAS,
  with Magic Eden floor/volume stats and deep links to where each card actually trades
  (Magic Eden / Tensor / Explorer). Buying there transfers the real cNFT to the wallet.
- **Wallet balance** — real SOL + USDC read straight from the active cluster's RPC.
- **Treasury** — `TREASURY_WALLET` (`21vUy4XiTRGhrRF7EwaagRHspvk6zQzzfWahuPXpTwEo`),
  same on devnet + mainnet, is the configured recipient for platform fees / rake.

## Wager currency, per network

- **mock** → off-chain credit ledger ("PokéCoin") — play instantly, no chain.
- **devnet** → **real devnet SOL** through the custodial escrow.
- **mainnet** → **real SOL** through the custodial escrow.

`NetworkAwareSettlement` (battle-service) dispatches: mock uses the double-entry credit
ledger; devnet/mainnet use `OnChainSettlementService`.

## On-chain SOL escrow — BUILT ✅ (custodial)

Real SOL wagering is implemented and unit-tested. Because an Anchor PDA program can't be
deployed/audited from this environment, this is a **custodial** escrow (a server-held hot
wallet holds both stakes mid-match) rather than a trustless program — deployable today,
upgradeable to a program later behind the same `SettlementProvider` seam.

Flow (devnet/mainnet crypto wager):
1. Both trainers accept terms → server holds the room and emits `wager:awaiting-deposit`
   with the escrow address + lamports.
2. Each client signs a `SystemProgram.transfer` of its stake to the **escrow hot wallet**;
   the server verifies the deposit **on-chain** (confirmed, correct payer, correct
   recipient, ≥ stake) and records it (idempotent by signature).
3. When **both** deposits land, the battle starts. No-show/timeout → escrow **refunds**
   whoever paid.
4. On result, `OnChainSettlementService` pays the winner `pot − fee` and `fee → treasury`
   in one signed transfer; idempotent per match (never double-pays).

Verified: `packages/settlement` unit tests (pot split, decoded transfer amounts,
idempotency, key parsing) + `scripts/verify-escrow-devnet.mjs` (live devnet end-to-end —
needs the escrow funded; see below).

### Still required for card wagers + a hardened mainnet

- **Card (cNFT) escrow** — stake the card to escrow (Bubblegum transfer w/ DAS
  `getAssetProof`), transfer to winner on loss / return on win. Not yet built (untestable
  here without owned devnet cNFTs); ownership re-verify at match start is already wired.
- **Custodial → trustless:** move the hot-wallet payout into an audited Anchor PDA program
  + a hardened signer (HSM/KMS) before real mainnet volume.
- **Audit** the escrow/settlement money paths; they move real funds.

## Security posture ✅

- **Server-authoritative battles** — clients send only move/switch choices; the sim runs
  server-side; one-choice-per-turn; per-turn timer; reconnect window.
- **Socket auth** — JWT verified, pubkey pinned from the token (client never asserts its id).
- **Ownership re-verify** at match start (real DAS) + anti-cheat flags / auto-suspend.
- **Rate limiting** on auth + every external-API/credit route, with bucket eviction.
- **Input sanitization** + parameterized SQL everywhere; signed/hashed battle logs.
- **Idempotency** by id/signature on settlement + any on-chain credit.
- **UTF8 database** (real NFT metadata with emoji/unicode stores correctly).
- **Secrets** (`.env*`, `.runtime/`) are git-ignored.
- **Mock-only tools** (Add Card, sandbox) are hidden on devnet/mainnet.

## Mainnet money-launch checklist

- [x] Real on-chain **SOL** escrow + payout (custodial) — built, unit-tested, devnet script ready.
- [x] Network-aware settlement (mock credits ↔ on-chain SOL).
- [ ] Fund the escrow hot wallet + run `scripts/verify-escrow-devnet.mjs` for the live devnet proof.
- [ ] Card (cNFT) escrow via Bubblegum.
- [ ] Audit the escrow money paths; move the signer to an HSM/KMS; upgrade to a trustless PDA program.
- [ ] Legal sign-off on real-money wagering (jurisdiction/gambling) — RISKS.md §2.
- [ ] IP review: original-creature art/name swap before any public monetized launch (RISKS.md §1).
- [ ] Move rate-limit + nonce state to Redis for horizontal scale.
- [ ] Set a strong `JWT_SECRET`, real RPCs, and `NODE_ENV=production` (locks dev tools).
- [ ] Load test matchmaking + settlement.

## How to host it

`pnpm --filter @battler/web build` is clean (verified) — the app is deployable today.

- **Web (`apps/web`)** → Vercel (or any Next 14 host). Set env: `DATABASE_URL`,
  `REDIS_URL`, `JWT_SECRET`, `HELIUS_RPC_URL`/`HELIUS_DEVNET_RPC_URL`,
  `TREASURY_WALLET`, `NEXT_PUBLIC_*`, and `MAGICEDEN_API_KEY` (to enable in-app buy),
  `NODE_ENV=production`.
- **Battle-service (`apps/battle-service`)** → a Node host that supports
  **WebSockets** (Railway / Render / Fly.io — *not* Vercel serverless). Same
  `JWT_SECRET` as web; set `WEB_ORIGIN` to the deployed web URL (Socket.IO CORS).
- **Datastores** → managed **Postgres** (must be **UTF8** — real NFT metadata
  has unicode) + **Redis** (`FORCE_REDIS=1` in prod so it never silently falls back
  to in-memory KV).
- Point `NEXT_PUBLIC_WS_URL` at the deployed battle-service URL.

Hardening already done for hosting: every Redis connection has an error handler
(no unhandled-error crashes), `/api/network` is dynamic (reflects runtime
settings), card images use plain `<img>` (real cNFT art from any host loads),
all dev/mutating routes are `NODE_ENV=production`-gated, no secrets in the client
bundle.
