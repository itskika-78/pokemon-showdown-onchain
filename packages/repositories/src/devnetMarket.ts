import { query, withTransaction } from '@battler/server-kit';

export interface CatalogListing {
  listingId: string;
  name: string;
  speciesId: string | null;
  image: string | null;
  attributes: { trait_type: string; value: string }[];
  priceLamports: number;
  stockTotal: number;
  stockRemaining: number;
  tcgRef: string | null;
  phygitalsUrl: string | null;
  magicEdenUrl: string | null;
  sortOrder: number;
}

interface DbRow {
  listing_id: string;
  name: string;
  species_id: string | null;
  image: string | null;
  attributes: { trait_type: string; value: string }[];
  price_lamports: string;
  stock_total: number;
  stock_remaining: number;
  tcg_ref: string | null;
  phygitals_url: string | null;
  magiceden_url: string | null;
  sort_order: number;
}

const toListing = (r: DbRow): CatalogListing => ({
  listingId: r.listing_id,
  name: r.name,
  speciesId: r.species_id,
  image: r.image,
  attributes: Array.isArray(r.attributes) ? r.attributes : [],
  priceLamports: Number(r.price_lamports),
  stockTotal: r.stock_total,
  stockRemaining: r.stock_remaining,
  tcgRef: r.tcg_ref,
  phygitalsUrl: r.phygitals_url,
  magicEdenUrl: r.magiceden_url,
  sortOrder: r.sort_order,
});

/** Trending Phygitals-style cards with limited devnet stock (mirrors real market). */
const SEED: Omit<CatalogListing, never>[] = [
  {
    listingId: 'trend-charizard-base',
    name: 'Charizard Holo (Base Set)',
    speciesId: 'charizard',
    image: 'https://images.pokemontcg.io/base1/4_hires.png',
    attributes: [
      { trait_type: 'Rarity', value: 'Holo Rare' },
      { trait_type: 'Set', value: 'Base Set' },
      { trait_type: 'Grade', value: '9' },
      { trait_type: 'Grading Company', value: 'PSA' },
    ],
    priceLamports: 150_000_000,
    stockTotal: 5,
    stockRemaining: 5,
    tcgRef: 'base1-4',
    phygitalsUrl: 'https://phygitals.com/marketplace',
    magicEdenUrl: 'https://magiceden.io/marketplace/phygitals',
    sortOrder: 1,
  },
  {
    listingId: 'trend-pikachu-illustrator',
    name: 'Pikachu Illustrator',
    speciesId: 'pikachu',
    image: 'https://images.pokemontcg.io/basep/1_hires.png',
    attributes: [
      { trait_type: 'Rarity', value: 'Promo' },
      { trait_type: 'Grade', value: '8' },
      { trait_type: 'Grading Company', value: 'PSA' },
    ],
    priceLamports: 250_000_000,
    stockTotal: 3,
    stockRemaining: 3,
    tcgRef: 'basep-1',
    phygitalsUrl: 'https://phygitals.com/marketplace',
    magicEdenUrl: 'https://magiceden.io/marketplace/phygitals',
    sortOrder: 2,
  },
  {
    listingId: 'trend-mewtwo-gx',
    name: 'Mewtwo GX (Shining Legends)',
    speciesId: 'mewtwo',
    image: 'https://images.pokemontcg.io/sm35/39_hires.png',
    attributes: [
      { trait_type: 'Rarity', value: 'Ultra Rare' },
      { trait_type: 'Set', value: 'Shining Legends' },
      { trait_type: 'Grade', value: '10' },
      { trait_type: 'Grading Company', value: 'PSA' },
    ],
    priceLamports: 80_000_000,
    stockTotal: 8,
    stockRemaining: 8,
    tcgRef: 'sm35-39',
    phygitalsUrl: 'https://phygitals.com/marketplace',
    magicEdenUrl: 'https://magiceden.io/marketplace/phygitals',
    sortOrder: 3,
  },
  {
    listingId: 'trend-blastoise-base',
    name: 'Blastoise Holo (Base Set)',
    speciesId: 'blastoise',
    image: 'https://images.pokemontcg.io/base1/2_hires.png',
    attributes: [
      { trait_type: 'Rarity', value: 'Holo Rare' },
      { trait_type: 'Set', value: 'Base Set' },
      { trait_type: 'Grade', value: '9' },
      { trait_type: 'Grading Company', value: 'PSA' },
    ],
    priceLamports: 120_000_000,
    stockTotal: 5,
    stockRemaining: 5,
    tcgRef: 'base1-2',
    phygitalsUrl: 'https://phygitals.com/marketplace',
    magicEdenUrl: 'https://magiceden.io/marketplace/phygitals',
    sortOrder: 4,
  },
  {
    listingId: 'trend-umbreon-gold',
    name: 'Umbreon Gold Star (POP Series 5)',
    speciesId: 'umbreon',
    image: 'https://images.pokemontcg.io/pop5/17_hires.png',
    attributes: [
      { trait_type: 'Rarity', value: 'Gold Star' },
      { trait_type: 'Grade', value: '9.5' },
      { trait_type: 'Grading Company', value: 'BGS' },
    ],
    priceLamports: 200_000_000,
    stockTotal: 4,
    stockRemaining: 4,
    tcgRef: 'pop5-17',
    phygitalsUrl: 'https://phygitals.com/marketplace',
    magicEdenUrl: 'https://magiceden.io/marketplace/phygitals',
    sortOrder: 5,
  },
  {
    listingId: 'trend-lugia-ex',
    name: 'Lugia EX (Silver Tempest)',
    speciesId: 'lugia',
    image: 'https://images.pokemontcg.io/sw12/186_hires.png',
    attributes: [
      { trait_type: 'Rarity', value: 'Special Illustration Rare' },
      { trait_type: 'Grade', value: '10' },
      { trait_type: 'Grading Company', value: 'PSA' },
    ],
    priceLamports: 95_000_000,
    stockTotal: 6,
    stockRemaining: 6,
    tcgRef: 'sw12-186',
    phygitalsUrl: 'https://phygitals.com/marketplace',
    magicEdenUrl: 'https://magiceden.io/marketplace/phygitals',
    sortOrder: 6,
  },
];

export async function ensureSeeded(): Promise<void> {
  const res = await query<{ c: string }>('SELECT COUNT(*)::text AS c FROM devnet_market_catalog');
  if (parseInt(res.rows[0]?.c ?? '0', 10) > 0) return;
  for (const item of SEED) {
    await query(
      `INSERT INTO devnet_market_catalog
         (listing_id, name, species_id, image, attributes, price_lamports, stock_total, stock_remaining, tcg_ref, phygitals_url, magiceden_url, sort_order)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12)`,
      [
        item.listingId,
        item.name,
        item.speciesId,
        item.image,
        JSON.stringify(item.attributes),
        item.priceLamports,
        item.stockTotal,
        item.stockRemaining,
        item.tcgRef,
        item.phygitalsUrl,
        item.magicEdenUrl,
        item.sortOrder,
      ],
    );
  }
}

export async function listCatalog(): Promise<CatalogListing[]> {
  await ensureSeeded();
  const res = await query<DbRow>(
    'SELECT * FROM devnet_market_catalog ORDER BY sort_order, name',
  );
  return res.rows.map(toListing);
}

export async function getListing(listingId: string): Promise<CatalogListing | null> {
  await ensureSeeded();
  const res = await query<DbRow>('SELECT * FROM devnet_market_catalog WHERE listing_id = $1', [
    listingId,
  ]);
  return res.rows[0] ? toListing(res.rows[0]) : null;
}

/** Atomically decrement stock and record purchase. Returns null if out of stock. */
export async function recordPurchase(input: {
  listingId: string;
  buyerPubkey: string;
  assetId: string;
  txSignature: string;
  lamports: number;
}): Promise<CatalogListing | null> {
  return withTransaction(async (client) => {
    const dec = await client.query<DbRow>(
      `UPDATE devnet_market_catalog
       SET stock_remaining = stock_remaining - 1
       WHERE listing_id = $1 AND stock_remaining > 0
       RETURNING *`,
      [input.listingId],
    );
    if (!dec.rows[0]) return null;
    await client.query(
      `INSERT INTO devnet_market_purchases (listing_id, buyer_pubkey, asset_id, tx_signature, lamports)
       VALUES ($1,$2,$3,$4,$5)`,
      [input.listingId, input.buyerPubkey, input.assetId, input.txSignature, input.lamports],
    );
    return toListing(dec.rows[0]);
  });
}

export async function purchaseExists(signature: string): Promise<boolean> {
  const res = await query<{ c: string }>(
    'SELECT COUNT(*)::text AS c FROM devnet_market_purchases WHERE tx_signature = $1',
    [signature],
  );
  return parseInt(res.rows[0]?.c ?? '0', 10) > 0;
}
