# Risk register (price these in *before* building further)

These are gating items, not afterthoughts. The riskiest unknowns are **legal, not
technical.**

## 1. Nintendo / The Pokémon Company IP
- Pokémon **names, sprites, and character designs** are Nintendo/TPC IP. Showdown's *code* is MIT,
  but reproducing Pokémon assets in a competing, monetized game is squarely what TPC issues takedowns
  against (mass Game Jolt DMCA, Pokémon Uranium, AM2R, Relic Castle…). Monetized projects are higher-risk.
- The first-sale doctrine that lets a tokenized-card platform resell a *specific physical card* does
  **not** authorize reproducing Pokémon sprites/names in a separate battle game.
- **Mitigation (built in):** the engine + data model are art-agnostic. Pokémon names/sprites are shown
  only behind `NEXT_PUBLIC_ENABLE_POKEMON_ART` for private/devnet testing. Plan an **original-creature
  art + original-names** swap (map species → original creatures) before any public monetized launch.
  If TPC sends *any* notice → execute the swap immediately.

## 2. Real-money wagering = regulated gambling
- Taking a rake on peer-to-peer crypto bets makes you a gambling operator in most U.S. jurisdictions
  (licensing, KYC/AML, geo-blocking). "Skill-based" exemptions are state-specific, and Pokémon battles
  have a non-trivial chance element (damage rolls, crits, accuracy) that weakens a pure-skill claim.
- **Mitigation (built in):** the MVP is **fake credits only** (Postgres ledger / dev faucet). Real
  stakes stay disabled until a gaming-law opinion clears the target jurisdictions. Settlement is behind
  `SettlementProvider` so the ledger can later be swapped for on-chain escrow + KYC gating.

## 3. Oracle trust
- Even with on-chain escrow, **your server reports who won.** Players must trust you. We persist the full
  Showdown protocol log and a **SHA-256 hash signed** by the server (`GET /api/match/:id/verify` returns
  log + signature + public key) for dispute resolution.

## 4. DAS dependency
- Helius rate limits/outages. We cache aggressively (metadata ~immutable, refetch >24h), keep ownership
  fresh only where it matters (login, match start), and use Helius webhooks to flag transfers for
  re-verify. The provider sits behind a `DasProvider` interface (mock ↔ Helius is one line).

## 5. Staking integrity without escrow (honest MVP limitation)
- The MVP **cannot trustlessly take a loser's card/SOL** — a staked card is only *app-locked*; a
  malicious user could transfer it mid-battle. Mitigations: re-verify ownership at settlement and **void**
  the match if the card moved; restrict real-value staking until the on-chain escrow phase ships.

## Thresholds that change the plan
- Legal opinion says real-money wagering is unviable in target jurisdictions → keep it
  fake-credit/cosmetic, skip escrow.
- TPC notice → original-art swap immediately.
- Phygitals schema turns out to be one collection with clean traits → parser simplifies.
