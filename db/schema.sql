-- Pokémon cNFT Battler — full schema (all phases).
-- Loaded automatically by the postgres container on first boot (docker-compose).
-- Idempotent: safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Phase 1 — users & cached assets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  pubkey          TEXT PRIMARY KEY,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rating          INTEGER NOT NULL DEFAULT 1000,
  ledger_balance  BIGINT NOT NULL DEFAULT 0,
  suspended       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS assets (
  asset_id            TEXT PRIMARY KEY,
  owner_pubkey        TEXT NOT NULL REFERENCES users(pubkey),
  collection_mint     TEXT,
  card_name           TEXT,
  raw_metadata        JSONB,
  parsed_attributes   JSONB,
  last_verified_at    TIMESTAMPTZ,
  last_metadata_fetch TIMESTAMPTZ,
  owner_needs_reverify BOOLEAN NOT NULL DEFAULT FALSE,
  playable            BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_assets_owner ON assets(owner_pubkey);

-- ---------------------------------------------------------------------------
-- Phase 5 — deterministic battle profiles (cached, versioned)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS battle_profiles (
  asset_id            TEXT PRIMARY KEY REFERENCES assets(asset_id) ON DELETE CASCADE,
  species_id          TEXT NOT NULL,
  level               INTEGER NOT NULL,
  battle_profile      JSONB NOT NULL,
  derivation_version  INTEGER NOT NULL DEFAULT 1,
  derived_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Phase 6 — teams (max 6 asset ids per user)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teams (
  pubkey      TEXT PRIMARY KEY REFERENCES users(pubkey),
  asset_ids   TEXT[] NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Phase 9 — negotiation, matches, ledger, staked cards
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS challenges (
  challenge_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_pubkey   TEXT NOT NULL REFERENCES users(pubkey),
  challengee_pubkey   TEXT NOT NULL REFERENCES users(pubkey),
  wager_type          TEXT NOT NULL DEFAULT 'none' CHECK (wager_type IN ('none','crypto','card')),
  wager_amount        BIGINT,
  wager_asset_id      TEXT,
  proposed_by         TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','COUNTERED','ACCEPTED','REJECTED','EXPIRED')),
  challenger_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  challengee_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  p1_pubkey       TEXT NOT NULL REFERENCES users(pubkey),
  p2_pubkey       TEXT NOT NULL REFERENCES users(pubkey),
  p1_team_assets  TEXT[] NOT NULL DEFAULT '{}',
  p2_team_assets  TEXT[] NOT NULL DEFAULT '{}',
  wager_type      TEXT NOT NULL DEFAULT 'none' CHECK (wager_type IN ('none','crypto','card')),
  wager_amount    BIGINT,
  wager_asset_id  TEXT REFERENCES assets(asset_id),
  status          TEXT NOT NULL DEFAULT 'negotiating'
                    CHECK (status IN ('negotiating','active','complete','void')),
  winner_pubkey   TEXT,
  forfeit_reason  TEXT,
  battle_log      TEXT,
  battle_log_hash TEXT,
  fee_taken       BIGINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);

-- Append-only, double-entry ledger.
CREATE TABLE IF NOT EXISTS ledger_entries (
  id            BIGSERIAL PRIMARY KEY,
  match_id      UUID REFERENCES matches(id),
  user_pubkey   TEXT NOT NULL REFERENCES users(pubkey),
  delta         BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  reason        TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger_entries(user_pubkey);

CREATE TABLE IF NOT EXISTS staked_cards (
  match_id        UUID REFERENCES matches(id),
  asset_id        TEXT REFERENCES assets(asset_id),
  original_owner  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'locked'
                    CHECK (status IN ('locked','transferred','returned','void')),
  PRIMARY KEY (match_id, asset_id)
);

-- ---------------------------------------------------------------------------
-- Phase 10 — anti-cheat flags
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anti_cheat_flags (
  id          BIGSERIAL PRIMARY KEY,
  pubkey      TEXT REFERENCES users(pubkey),
  flag_type   TEXT NOT NULL,  -- 'double_move' | 'ownership_mismatch' | 'invalid_choice' | 'disconnect_forfeit_pattern'
  match_id    UUID,
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flags_pubkey_type ON anti_cheat_flags(pubkey, flag_type, created_at);

-- ---------------------------------------------------------------------------
-- Dev-only: user-added mock cards (the "Add Card" tab in mock mode). Merged
-- into the deterministic mock collection by the configured DAS provider.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mock_cards (
  asset_id      TEXT PRIMARY KEY,
  owner_pubkey  TEXT NOT NULL,
  name          TEXT NOT NULL,
  attributes    JSONB NOT NULL DEFAULT '[]',
  image         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mock_cards_owner ON mock_cards(owner_pubkey);

-- ---------------------------------------------------------------------------
-- Devnet marketplace — limited-stock trending cards (devnet SOL purchases).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS devnet_market_catalog (
  listing_id       TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  species_id       TEXT,
  image            TEXT,
  attributes       JSONB NOT NULL DEFAULT '[]',
  price_lamports   BIGINT NOT NULL,
  stock_total      INTEGER NOT NULL,
  stock_remaining  INTEGER NOT NULL,
  tcg_ref          TEXT,
  phygitals_url    TEXT,
  magiceden_url    TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (stock_remaining >= 0),
  CHECK (stock_remaining <= stock_total)
);
CREATE INDEX IF NOT EXISTS idx_devnet_market_sort ON devnet_market_catalog(sort_order);

CREATE TABLE IF NOT EXISTS devnet_market_purchases (
  id             BIGSERIAL PRIMARY KEY,
  listing_id     TEXT NOT NULL REFERENCES devnet_market_catalog(listing_id),
  buyer_pubkey   TEXT NOT NULL,
  asset_id       TEXT NOT NULL UNIQUE,
  tx_signature   TEXT NOT NULL UNIQUE,
  lamports       BIGINT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_devnet_purchases_buyer ON devnet_market_purchases(buyer_pubkey);

-- ---------------------------------------------------------------------------
-- On-chain escrow (custodial SOL wagers on devnet/mainnet). Both players'
-- stakes land in the escrow hot wallet before battle; settlement pays the
-- winner pot−fee + fee→treasury. Signature is the idempotency key per deposit;
-- settlement is idempotent per match.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS escrow_deposits (
  signature     TEXT PRIMARY KEY,
  match_id      TEXT NOT NULL,
  pubkey        TEXT NOT NULL,
  lamports      BIGINT NOT NULL,
  cluster       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_escrow_deposits_match ON escrow_deposits(match_id);

CREATE TABLE IF NOT EXISTS escrow_settlements (
  match_id      TEXT PRIMARY KEY,
  payout_sig    TEXT,
  winner        TEXT NOT NULL,
  payout        BIGINT NOT NULL DEFAULT 0,
  fee           BIGINT NOT NULL DEFAULT 0,
  voided        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- On-chain card (cNFT) escrow: a staked Phygitals card is transferred to the
-- escrow wallet before battle (deposit_sig), held during the match, then moved
-- escrow→winner (settle_sig) or escrow→staker on a void. Settlement is
-- idempotent per match (settled flag), mirroring the SOL escrow.
CREATE TABLE IF NOT EXISTS escrow_cards (
  match_id      TEXT NOT NULL,
  asset_id      TEXT NOT NULL,
  staker        TEXT NOT NULL,
  cluster       TEXT NOT NULL,
  deposit_sig   TEXT,
  settle_sig    TEXT,
  settled_to    TEXT,
  voided        BOOLEAN NOT NULL DEFAULT FALSE,
  settled       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, asset_id)
);
CREATE INDEX IF NOT EXISTS idx_escrow_cards_match ON escrow_cards(match_id);

-- ---------------------------------------------------------------------------
-- Usernames + friends. A username is a unique display handle linked to a wallet
-- so trainers can find/challenge each other without pasting base58 addresses.
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uq
  ON users (lower(username)) WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS friends (
  owner_pubkey   TEXT NOT NULL,
  friend_pubkey  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_pubkey, friend_pubkey)
);
CREATE INDEX IF NOT EXISTS idx_friends_owner ON friends(owner_pubkey);

-- ---------------------------------------------------------------------------
-- Seed the platform treasury "user" that receives the rake.
-- ---------------------------------------------------------------------------
INSERT INTO users (pubkey, ledger_balance) VALUES ('PLATFORM_TREASURY', 0)
  ON CONFLICT (pubkey) DO NOTHING;
