import type { DasAsset } from '@battler/core';
import type { DasProvider } from './provider.js';

/** Real, verified Phygitals collection grouping value on Solana. */
export const MOCK_COLLECTION_MINT = 'BSG6DyEihFFtfvxtL9mKYsvTwiZXB1rq5gARMTJC2xAM';

interface MockTemplate {
  name: string;
  attributes: { trait_type: string; value: string }[];
  image: string;
  collection?: string;
  /** Defaults to true (a cNFT). Set false to simulate a regular NFT in the wallet. */
  compressed?: boolean;
  /** DAS interface; defaults to V1_NFT. */
  interface?: string;
}

/** Deterministic dev fixtures matching the real Phygitals attribute schema. */
const MOCK_CARDS: MockTemplate[] = [
  {
    // Real Phygitals-style card (name pattern + full attribute schema).
    name: '2023 Camerupt Obsidian Flames #148/197',
    image: 'https://cdn.phygitals.com/images/camerupt.png',
    attributes: [
      { trait_type: 'Year', value: '2023' },
      { trait_type: 'Set', value: 'Obsidian Flames' },
      { trait_type: 'Card Number', value: '148/197' },
      { trait_type: 'Grade', value: '10' },
      { trait_type: 'Grading Company', value: 'PSA' },
      { trait_type: 'Rarity', value: 'Uncommon' },
      { trait_type: 'Language', value: 'English' },
      { trait_type: 'Certification Number', value: '12345678' },
    ],
  },
  {
    name: 'Charizard VMAX PSA 10 #20/189',
    image: 'https://cdn.phygitals.com/images/charizard-vmax.png',
    attributes: [
      { trait_type: 'Grade', value: '10' },
      { trait_type: 'Grading Company', value: 'PSA' },
      { trait_type: 'Set', value: "Champion's Path" },
      { trait_type: 'Card Number', value: '20/189' },
      { trait_type: 'Rarity', value: 'Secret Rare' },
      { trait_type: 'Year', value: '2020' },
    ],
  },
  {
    name: 'Pikachu V #43/185 PSA 9',
    image: 'https://cdn.phygitals.com/images/pikachu-v.png',
    attributes: [
      { trait_type: 'Grade', value: '9' },
      { trait_type: 'Grading Company', value: 'PSA' },
      { trait_type: 'Set', value: 'Vivid Voltage' },
      { trait_type: 'Card Number', value: '43/185' },
      { trait_type: 'Rarity', value: 'Ultra Rare' },
      { trait_type: 'Year', value: '2020' },
    ],
  },
  {
    name: 'Dark Charizard #4/82',
    image: 'https://cdn.phygitals.com/images/dark-charizard.png',
    attributes: [
      { trait_type: 'Set', value: 'Team Rocket' },
      { trait_type: 'Card Number', value: '4/82' },
      { trait_type: 'Rarity', value: 'Holo Rare' },
      { trait_type: 'Year', value: '2000' },
    ],
  },
  {
    name: 'Radiant Greninja #46/071',
    image: 'https://cdn.phygitals.com/images/radiant-greninja.png',
    attributes: [
      { trait_type: 'Set', value: 'Astral Radiance' },
      { trait_type: 'Card Number', value: '46/071' },
      { trait_type: 'Rarity', value: 'Radiant Rare' },
      { trait_type: 'Year', value: '2022' },
    ],
  },
  {
    name: 'Alolan Raichu GX #51/149',
    image: 'https://cdn.phygitals.com/images/alolan-raichu-gx.png',
    attributes: [
      { trait_type: 'Set', value: 'Sun & Moon' },
      { trait_type: 'Card Number', value: '51/149' },
      { trait_type: 'Rarity', value: 'Ultra Rare' },
      { trait_type: 'Year', value: '2017' },
    ],
  },
  {
    name: 'Mewtwo GX #39/214 BGS 9.5',
    image: 'https://cdn.phygitals.com/images/mewtwo-gx.png',
    attributes: [
      { trait_type: 'Grade', value: '9.5' },
      { trait_type: 'Grading Company', value: 'BGS' },
      { trait_type: 'Set', value: 'Lost Thunder' },
      { trait_type: 'Card Number', value: '39/214' },
      { trait_type: 'Rarity', value: 'Ultra Rare' },
      { trait_type: 'Year', value: '2018' },
    ],
  },
  {
    name: "Team Rocket's Meowth #ical",
    image: 'https://cdn.phygitals.com/images/tr-meowth.png',
    attributes: [
      { trait_type: 'Set', value: 'Gym Heroes' },
      { trait_type: 'Rarity', value: 'Common' },
      { trait_type: 'Year', value: '2000' },
    ],
  },
  {
    // a non-Pokémon card → should come back playable:false
    name: 'Basic Fire Energy',
    image: 'https://cdn.phygitals.com/images/fire-energy.png',
    attributes: [
      { trait_type: 'Set', value: 'Base Set' },
      { trait_type: 'Rarity', value: 'Common' },
      { trait_type: 'Year', value: '1999' },
    ],
  },
  // ---- Non-Pokémon wallet assets → the collection's "Not supported" column ----
  {
    // A different cNFT collection (e.g. a PFP) the wallet also holds.
    name: 'Mad Lads #4209',
    image: 'https://i.seadn.io/gcs/files/madlads-placeholder.png',
    collection: 'J1S9H3QjnRtBbbuD4HjPV6RpRhwuk4zKbxsnCHuTgh9w',
    attributes: [
      { trait_type: 'Type', value: 'PFP' },
      { trait_type: 'Background', value: 'Purple' },
    ],
  },
  {
    name: 'Tensorian #1337',
    image: 'https://i.seadn.io/gcs/files/tensorians-placeholder.png',
    collection: '5PA96eCFHJSFPY9SWFeRJUHrpoNF5XZL6RrE1JADXhxf',
    attributes: [{ trait_type: 'Type', value: 'PFP' }],
  },
  {
    // A regular (non-compressed) NFT → reason 'not_compressed'.
    name: 'Okay Bear #88',
    image: 'https://i.seadn.io/gcs/files/okaybears-placeholder.png',
    collection: '3saAedkM9o5g1u5DCqsuMZuC4GRqPB4TuMkvSsSVvGQ3',
    compressed: false,
    attributes: [{ trait_type: 'Type', value: 'PFP' }],
  },
];

/**
 * Asset ids encode the *full* owner (hex) + template index, so any process can
 * reconstruct the exact asset — including its true owner — from the id alone.
 * This makes the mock stateless and deterministic across processes (the web app
 * seeds, the battle-service re-verifies ownership), instead of relying on shared
 * in-memory state. Pubkeys are base58 and indices are digits, so neither
 * contains `_`; the three-part id splits unambiguously.
 */
const ID_PREFIX = 'mock';

function encodeOwner(owner: string): string {
  return Buffer.from(owner, 'utf8').toString('hex');
}

function idFor(owner: string, idx: number): string {
  return `${ID_PREFIX}_${encodeOwner(owner)}_${idx}`;
}

function parseId(assetId: string): { owner: string; idx: number } | null {
  const parts = assetId.split('_');
  if (parts.length !== 3 || parts[0] !== ID_PREFIX) return null;
  const idx = Number(parts[2]);
  if (!Number.isInteger(idx) || idx < 0 || idx >= MOCK_CARDS.length) return null;
  try {
    const owner = Buffer.from(parts[1]!, 'hex').toString('utf8');
    return owner ? { owner, idx } : null;
  } catch {
    return null;
  }
}

function buildAsset(owner: string, idx: number, t: MockTemplate): DasAsset {
  const compressed = t.compressed !== false;
  return {
    id: idFor(owner, idx),
    interface: t.interface ?? 'V1_NFT',
    compression: { compressed, tree: 'MockTree1111111111111111111111111', leaf_id: idx },
    content: {
      json_uri: `https://cdn.phygitals.com/metadata/mock_${idx}.json`,
      metadata: { name: t.name, attributes: t.attributes },
      files: [{ uri: t.image, cdn_uri: t.image }],
      links: { image: t.image },
    },
    grouping: [{ group_key: 'collection', group_value: t.collection ?? MOCK_COLLECTION_MINT }],
    ownership: { owner, frozen: false, delegated: false, delegate: null },
    authorities: [{ address: 'MockUpdateAuthority11111111111111111111111', scopes: ['full'] }],
    mutable: true,
    burnt: false,
  };
}

/**
 * In-memory DAS provider for dev/tests — no Helius key needed. Generates a
 * stable mock collection per owner and supports owner/frozen mutation so the
 * Phase-10 ownership-reverify path can be exercised.
 */
export class MockDasProvider implements DasProvider {
  /** Only holds *mutated* assets (transfers/freezes/seeds); the default state is
   * reconstructed deterministically from the asset id. */
  private readonly overrides = new Map<string, DasAsset>();

  /** Default (unmutated) asset for an id, rebuilt from the id alone. */
  private base(assetId: string): DasAsset | null {
    const p = parseId(assetId);
    return p ? buildAsset(p.owner, p.idx, MOCK_CARDS[p.idx]!) : null;
  }

  async getAssetsByOwner(owner: string): Promise<DasAsset[]> {
    return MOCK_CARDS.map((t, i) => {
      const id = idFor(owner, i);
      return this.overrides.get(id) ?? buildAsset(owner, i, t);
    });
  }

  async getAsset(assetId: string): Promise<DasAsset | null> {
    return this.overrides.get(assetId) ?? this.base(assetId);
  }

  /** A demo "marketplace roster" — the Pokémon-card templates in the supported collection. */
  async getAssetsByGroup(collection: string, _page = 1, _limit = 24): Promise<DasAsset[]> {
    return MOCK_CARDS.map((t, i) => buildAsset('MarketRosterDemo111111111111111111111111', i, t)).filter(
      (a) => (a.grouping?.[0]?.group_value ?? '') === collection,
    );
  }

  // ---- test/dev helpers (simulate marketplace activity) ----
  setOwner(assetId: string, owner: string): void {
    const a = this.overrides.get(assetId) ?? this.base(assetId);
    if (a) this.overrides.set(assetId, { ...a, ownership: { ...a.ownership, owner } });
  }
  setFrozen(assetId: string, frozen: boolean): void {
    const a = this.overrides.get(assetId) ?? this.base(assetId);
    if (a) this.overrides.set(assetId, { ...a, ownership: { ...a.ownership, frozen } });
  }
  seed(asset: DasAsset): void {
    this.overrides.set(asset.id, asset);
  }
}
