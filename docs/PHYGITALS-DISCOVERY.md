# Phygitals on-chain discovery notes

The parser/derivation are built against **observed** data, not assumptions.

## Collection (verified)
- Collection grouping value (Solana): **`BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM`**
  (seen in OKX NFT data; ~103,633 NFTs across ~17,912 wallets as of June 2026).
- Assets are **Metaplex Bubblegum compressed NFTs (cNFTs)**: DAS `interface = "V1_NFT"`,
  `compression.compressed = true`. Tradable on Tensor, Magic Eden, OKX.
- Standard Solana RPC **cannot** read cNFTs — you must use the DAS API (Helius/QuickNode/Triton).

## Sample mint addresses (OKX, June 2026)
| Card | Mint |
|------|------|
| 2023 Camerupt Obsidian Flames | `G5dbC5KNg5gY9jwjQjXHmRRz8vYiAmLsR71Ls2YXx27b` |
| 2024 Pokemon Japanese SV Terasta | `6X5NFC6ie23nN2yTptDYmDzFT7emFzXxaY69LQaBqYkW` |
| 2025 Pokemon Japanese SV Battle | `55XqGgA4DfTUPmwdKVhw1Fn2WuWpSzBGo5JKM2Cgksxb` |

## Name pattern
`"{YEAR} {Pokemon name} {Set name} #{card_number}"`, e.g. `2023 Camerupt Obsidian Flames #148/197`.
- The species is the **leading** token(s) → the parser uses **prefix-shrinking** (longest leading
  word-run first) so it strips the trailing set name without a hard-coded set list.
- Whole-set / generic cards (`2024 Pokemon Japanese SV Terasta`) contain the brand word
  `Pokemon` and no single species → marked **`generic_set_card` / unplayable**.

## Attribute schema (multi-key — exact keys NOT publicly confirmed)
`extractAttributes` tries several `trait_type` variants per field and falls back to the name string:
| Field | Tried keys |
|-------|-----------|
| grade | Grade, PSA Grade, CGC Grade, BGS Grade, Card Grade |
| gradingCompany | Grading Company, grading_company, Grader, Certification, Company |
| set | Set, Set Name, Series, Edition, Expansion |
| cardNumber | Card Number, card_number, Number, Collector Number, # *(name fallback)* |
| rarity | Rarity, Card Rarity |
| year | Year, Release Year, Date *(name fallback)* |
| language | Language, Lang |
| certNumber | Certification Number, Cert Number, Cert |

## DAS getAsset fields we rely on
- `id`, `interface`, `content.json_uri`, `content.files[].uri|cdn_uri`, `content.metadata.{name,attributes}`,
  `grouping[].group_value`, `compression.{compressed,tree,leaf_id}`, `ownership.{owner,frozen,delegated}`,
  `burnt`.
- **Caching:** off-chain metadata is treated as slow-changing (refetch only if >24h); **ownership is
  re-fetched at login and at match start** (a card may have sold seconds ago).

## To validate against the real chain
Set `USE_MOCK_DAS=false` and `HELIUS_RPC_URL=...`, then call `getAsset` on a sample mint above and
diff the real `content.metadata.attributes` keys against `KEY_ALIASES` in
`packages/das/src/attributes.ts`; add any new key variants. The trait set (grade/cert/set/number/
year/rarity) is a strong prior but unconfirmed for Phygitals specifically.
